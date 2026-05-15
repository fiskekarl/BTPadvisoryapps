'use strict';

const cds = require('@sap/cds');
const axios = require('axios');
const crypto = require('crypto');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysUntil(isoDate) {
  if (!isoDate) return null;
  return Math.floor((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
}

function severityFor(days, t) {
  if (days === null || days === undefined) return 'notice';
  if (days < 0) return 'expired';
  if (days <= t.criticalDays) return 'error';
  if (days <= t.warnDays)     return 'warn';
  if (days <= t.noticeDays)   return 'notice';
  return 'ok';
}

function parsePem(pem) {
  try {
    const cert = new crypto.X509Certificate(pem);
    return {
      subject:   cert.subject,
      issuer:    cert.issuer,
      notBefore: new Date(cert.validFrom).toISOString().slice(0, 10),
      notAfter:  new Date(cert.validTo).toISOString().slice(0, 10),
    };
  } catch { return null; }
}

// ─── OAuth Token Cache ───────────────────────────────────────────────────────
const _tokenCaches = {};
async function getOAuthToken(uaa) {
  const key = uaa.clientid;
  if (!_tokenCaches[key]) _tokenCaches[key] = { token: null, expiresAt: 0 };
  const c = _tokenCaches[key];
  if (c.token && Date.now() < c.expiresAt) return c.token;
  const resp = await axios.post(`${uaa.url}/oauth/token`,
    new URLSearchParams({ grant_type: 'client_credentials', client_id: uaa.clientid, client_secret: uaa.clientsecret }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  c.token     = resp.data.access_token;
  c.expiresAt = Date.now() + (resp.data.expires_in - 60) * 1000;
  return c.token;
}

// ─── Source: Destination certs (reuses DESTINATION_KEYS from app #2) ─────────
async function loadDestinationCerts() {
  if (!process.env.DESTINATION_KEYS) return [];
  let keys; try { keys = JSON.parse(process.env.DESTINATION_KEYS); } catch { return []; }
  const out = [];
  for (const k of keys) {
    try {
      const token = await getOAuthToken(k.uaa);
      const data  = await axios.get(`${k.uri}/destination-configuration/v1/subaccountDestinations`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 30_000,
      });
      const items = Array.isArray(data.data) ? data.data : (data.data?.destinationConfigurations ?? []);
      for (const d of items) {
        const pemB64 = d.Certificates?.[0]?.Content;
        if (!pemB64) continue;
        const parsed = parsePem(Buffer.from(pemB64, 'base64'));
        if (!parsed) continue;
        out.push({
          kind:           'DESTINATION',
          subaccountId:   k.subaccountId,
          subaccountName: k.subaccountName,
          name:           d.Name,
          ...parsed,
          blastRadius:    `Destination "${d.Name}" → ${d.URL || ''}`,
        });
      }
    } catch (e) {
      cds.log('cert-service').warn(`Skipping ${k.subaccountName} for cert scan:`, e.message);
    }
  }
  return out;
}

// ─── Source: IAS certs ───────────────────────────────────────────────────────
//
// IAS exposes its SAML signing & encryption certs at:
//   GET /Trust  → returns trust configurations with embedded cert PEMs.
// Same IAS_* env vars as app #4.
async function loadIasCerts() {
  if (!process.env.IAS_API_URL || !process.env.IAS_CLIENT_ID || !process.env.IAS_CLIENT_SECRET) return [];
  // TODO: implement IAS OAuth + GET /Trust + parse cert PEMs.
  return [];
}

// ─── Source: XSUAA trust configs ─────────────────────────────────────────────
//
// Per subaccount:
//   GET <subaccount-uaa>/authorization/v2/trust-configurations
// Each trust has a `samlMetadata` blob with a public signing cert.
// Requires per-subaccount XSUAA service-keys; reuse DESTINATION_KEYS-style
// pattern with XSUAA_KEYS env var. TODO.
async function loadXsuaaTrustCerts() {
  // TODO: requires XSUAA_KEYS env var with per-subaccount XSUAA admin tokens.
  return [];
}

// ─── Source: cTMS signing keys ───────────────────────────────────────────────
async function loadCtmsCerts() {
  // TODO: cTMS exposes signing keys via its admin API; scope when an
  // engagement uses cTMS. Most don't, so deferring.
  return [];
}

// ─── Service ──────────────────────────────────────────────────────────────────
class CertService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('cert-service');

    this.on('getCerts', async () => {
      const [thresholds, acks, dests, ias, xsuaa, ctms] = await Promise.all([
        getThresholds(),
        cds.db.run(SELECT.from('com.btpconsulting.certexpiry.Acknowledgement')),
        loadDestinationCerts(),
        loadIasCerts(),
        loadXsuaaTrustCerts(),
        loadCtmsCerts(),
      ]);

      let raw = [...dests, ...ias, ...xsuaa, ...ctms];
      if (raw.length === 0) {
        raw = mockCerts();
        LOG.warn('No upstream cert sources configured — returning mock data.');
      }

      const today = new Date().toISOString().slice(0, 10);
      const ackByKey = new Map();
      for (const a of acks) {
        if (a.acknowledgedUntil && a.acknowledgedUntil < today) continue;
        ackByKey.set(a.certKey, a.reason || '');
      }

      return raw.map((c) => {
        const days = daysUntil(c.notAfter);
        const certKey = `${c.kind}::${c.subaccountId}::${c.name}`;
        return {
          ...c,
          daysToExpiry: days,
          severity:     severityFor(days, thresholds),
          rotationOwner: c.rotationOwner || lookupOwner(c, ROTATION_OWNERS),
          acknowledged: ackByKey.has(certKey),
          ackReason:    ackByKey.get(certKey) || '',
        };
      }).sort((a, b) => (a.daysToExpiry ?? 99999) - (b.daysToExpiry ?? 99999));
    });

    this.on('getSummary', async () => {
      const certs = await this.send('getCerts');
      const t = await getThresholds();
      return {
        totalCerts:     certs.length,
        expiredCount:   certs.filter((c) => c.daysToExpiry !== null && c.daysToExpiry < 0).length,
        critical14d:    certs.filter((c) => c.daysToExpiry !== null && c.daysToExpiry >= 0 && c.daysToExpiry <= t.criticalDays).length,
        warn30d:        certs.filter((c) => c.daysToExpiry !== null && c.daysToExpiry >  t.criticalDays && c.daysToExpiry <= t.warnDays).length,
        notice90d:      certs.filter((c) => c.daysToExpiry !== null && c.daysToExpiry >  t.warnDays && c.daysToExpiry <= t.noticeDays).length,
        unacknowledged: certs.filter((c) => !c.acknowledged && c.daysToExpiry !== null && c.daysToExpiry <= t.warnDays).length,
      };
    });

    return super.init();
  }
}

async function getThresholds() {
  const r = await cds.db.run(
    SELECT.one.from('com.btpconsulting.certexpiry.AlertThreshold').where({ id: 'default' })
  );
  return r || { id: 'default', criticalDays: 14, warnDays: 30, noticeDays: 90 };
}

// ─── Per-engagement rotation-owner registry ──────────────────────────────────
//
// Keyed by (kind, subaccountId, name-pattern). The consultant edits this
// during the engagement so each cert has a named human owner. In a future
// version this becomes a CDS table editable by CertAdmin.
const ROTATION_OWNERS = [
  // { kind: 'DESTINATION', subaccountId: '*', namePattern: /^s4-/, owner: 'IT Ops' },
];

function lookupOwner(cert, registry) {
  for (const r of registry) {
    if (r.kind && r.kind !== cert.kind) continue;
    if (r.subaccountId && r.subaccountId !== '*' && r.subaccountId !== cert.subaccountId) continue;
    if (r.namePattern && !r.namePattern.test(cert.name)) continue;
    return r.owner;
  }
  return '';
}

module.exports = CertService;
module.exports.__test__ = { daysUntil, severityFor, parsePem, lookupOwner };

// ─── Mock Data ────────────────────────────────────────────────────────────────
function mockCerts() {
  return [
    { kind: 'DESTINATION', subaccountId: 'sub-001', subaccountName: 'Production',  name: 'crm-legacy', subject: 'CN=crm-old.acme.local',         issuer: 'CN=Acme Internal CA',  notBefore: '2024-05-19', notAfter: '2026-05-19', blastRadius: 'CRM destination → production' },
    { kind: 'DESTINATION', subaccountId: 'sub-001', subaccountName: 'Production',  name: 'sf-success', subject: 'CN=api.successfactors.com',     issuer: 'CN=DigiCert TLS RSA',  notBefore: '2025-03-01', notAfter: '2026-06-15', blastRadius: 'SuccessFactors → production' },
    { kind: 'IAS_SAML',    subaccountId: 'sub-001', subaccountName: 'Production',  name: 'IAS-Trust',  subject: 'CN=acme.accounts.ondemand.com', issuer: 'CN=SAP Cloud Root CA', notBefore: '2024-09-12', notAfter: '2026-07-12', blastRadius: 'All IAS-federated apps in Production' },
    { kind: 'IAS_SAML',    subaccountId: 'sub-002', subaccountName: 'QA',          name: 'IAS-Trust',  subject: 'CN=acme.accounts.ondemand.com', issuer: 'CN=SAP Cloud Root CA', notBefore: '2024-09-12', notAfter: '2026-05-22', blastRadius: 'All IAS-federated apps in QA' },
    { kind: 'XSUAA_TRUST', subaccountId: 'sub-003', subaccountName: 'Dev',         name: 'sap.default',subject: 'CN=sap.default',                issuer: 'CN=SAP Default CA',    notBefore: '2024-01-01', notAfter: '2027-01-01', blastRadius: 'XSUAA trust to default IdP' },
  ];
}
