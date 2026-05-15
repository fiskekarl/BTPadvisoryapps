'use strict';

const cds = require('@sap/cds');
const axios = require('axios');
const crypto = require('crypto');
const ans = require('./lib/notification');

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
// IAS exposes its trust-configurations (the SPs that trust IAS as IdP, and
// the upstream IdPs IAS itself trusts) at:
//   GET /Trust   → list of trust configurations with embedded cert material
//
// Cert material lives at one of several locations depending on the trust
// type (SAML vs OIDC, inline vs metadata-derived). We probe all known
// shapes and skip any candidate that doesn't decode to a valid X.509 cert,
// so a partial response from a single trust never poisons the whole scan.
//
// Auth: re-uses the IAS_* env vars from app #4. When unset the scan
// returns []; the service then falls back to mock data for demo mode.
const _iasTokenCache = { token: null, expiresAt: 0 };
async function getIasToken() {
  if (_iasTokenCache.token && Date.now() < _iasTokenCache.expiresAt) return _iasTokenCache.token;
  const url = process.env.IAS_OAUTH_URL || `${process.env.IAS_API_URL}/oauth2/token`;
  const resp = await axios.post(url, new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.IAS_CLIENT_ID,
    client_secret: process.env.IAS_CLIENT_SECRET,
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30_000 });
  _iasTokenCache.token     = resp.data.access_token;
  _iasTokenCache.expiresAt = Date.now() + (resp.data.expires_in - 60) * 1000;
  return _iasTokenCache.token;
}

async function iasGet(path) {
  const token = await getIasToken();
  const resp = await axios.get(`${process.env.IAS_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout: 30_000,
  });
  return resp.data;
}

function collectCertCandidates(trust) {
  const c = [];
  const push = (v) => { if (v) c.push(v); };
  push(trust.signingCertificate);
  push(trust.certificate);
  push(trust.samlMetadata?.signingCertificate);
  push(trust.samlMetadata?.encryptionCertificate);
  push(trust.openIdConnectConfiguration?.publicKey);
  if (Array.isArray(trust.signingCertificates))                  c.push(...trust.signingCertificates);
  if (Array.isArray(trust.samlMetadata?.signingCertificates))    c.push(...trust.samlMetadata.signingCertificates);
  if (Array.isArray(trust.samlMetadata?.encryptionCertificates)) c.push(...trust.samlMetadata.encryptionCertificates);
  return c;
}

function parseCertCandidate(candidate) {
  // A candidate may be a raw PEM string, a base64-wrapped PEM, or an object
  // with the cert under .value / .certificate / .content. We coerce all of
  // these into a Buffer that crypto.X509Certificate can ingest.
  const raw = typeof candidate === 'string'
    ? candidate
    : (candidate?.value || candidate?.certificate || candidate?.content);
  if (!raw || typeof raw !== 'string') return null;
  try {
    const buf = raw.includes('BEGIN CERTIFICATE') ? Buffer.from(raw) : Buffer.from(raw, 'base64');
    return parsePem(buf);
  } catch { return null; }
}

async function loadIasCerts() {
  if (!process.env.IAS_API_URL || !process.env.IAS_CLIENT_ID || !process.env.IAS_CLIENT_SECRET) return [];
  const tenantHost = process.env.IAS_API_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const out = [];

  let data;
  try { data = await iasGet('/Trust'); }
  catch (e) {
    cds.log('cert-service').warn(`IAS /Trust fetch failed: ${e.message}`);
    return [];
  }

  const items = Array.isArray(data) ? data
              : (data?.values || data?.trustConfigurations || []);
  for (const t of items) {
    const trustName = t.name || t.displayName || t.id || t.providerId || 'unnamed-trust';
    for (const cand of collectCertCandidates(t)) {
      const parsed = parseCertCandidate(cand);
      if (!parsed) continue;
      out.push({
        kind:           'IAS_SAML',
        subaccountId:   'ias-tenant',
        subaccountName: tenantHost,
        name:           trustName,
        ...parsed,
        blastRadius:    `IAS trust "${trustName}" — affects all federated apps relying on this trust`,
      });
    }
  }
  return out;
}

// ─── Source: XSUAA trust configs ─────────────────────────────────────────────
//
// Per subaccount: GET <xsuaa-api>/sap/rest/authorization/v2/trust-configurations
// Each trust may carry SAML or OIDC signing cert material — we reuse the
// IAS cert candidate / parse helpers to handle the field-shape variants.
//
// Keys: prefer the dedicated XSUAA_KEYS env var if present (a JSON array of
// { subaccountId, subaccountName, uaa: {clientid, clientsecret, url}, apiurl }
// entries — same shape DESTINATION_KEYS uses). Falls back to the multi-purpose
// SUBACCOUNT_KEYS envelope used by apps #1/#4/#5/#6, mapping each entry's
// `.xsuaa` block into the same shape. Either source works; whichever exists.
function getXsuaaKeys() {
  if (process.env.XSUAA_KEYS) {
    try {
      const arr = JSON.parse(process.env.XSUAA_KEYS);
      if (Array.isArray(arr) && arr.length) return arr;
    } catch { /* fall through */ }
  }
  if (process.env.SUBACCOUNT_KEYS) {
    try {
      return JSON.parse(process.env.SUBACCOUNT_KEYS)
        .filter((k) => k.xsuaa?.uaa && k.xsuaa?.apiurl)
        .map((k) => ({
          subaccountId:   k.subaccountId,
          subaccountName: k.subaccountName,
          uaa:            k.xsuaa.uaa,
          apiurl:         k.xsuaa.apiurl,
        }));
    } catch { /* fall through */ }
  }
  return [];
}

async function loadXsuaaTrustCerts() {
  const keys = getXsuaaKeys();
  if (keys.length === 0) return [];
  const out = [];
  for (const k of keys) {
    try {
      const token = await getOAuthToken(k.uaa);
      const resp = await axios.get(`${k.apiurl}/sap/rest/authorization/v2/trust-configurations`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30_000,
      });
      const trusts = resp.data?.trustConfigurations
                  || resp.data?.value
                  || (Array.isArray(resp.data) ? resp.data : []);
      for (const t of trusts) {
        const trustName = t.originKey || t.name || t.id || t.identityProvider || 'unnamed';
        for (const cand of collectCertCandidates(t)) {
          const parsed = parseCertCandidate(cand);
          if (!parsed) continue;
          out.push({
            kind:           'XSUAA_TRUST',
            subaccountId:   k.subaccountId,
            subaccountName: k.subaccountName || k.subaccountId,
            name:           trustName,
            ...parsed,
            blastRadius:    `XSUAA trust "${trustName}" in ${k.subaccountName || k.subaccountId} — every app in the subaccount that federates via this trust`,
          });
        }
      }
    } catch (e) {
      cds.log('cert-service').warn(`XSUAA trust scan failed ${k.subaccountName || k.subaccountId}: ${e.message}`);
    }
  }
  return out;
}

// ─── Source: cTMS signing keys ───────────────────────────────────────────────
//
// cTMS (Cloud Transport Management Service) exposes its landscape signing
// identities at /v2/landscapeIdentities. Each identity is an X.509 cert
// used to sign transport packages between landscape nodes. Same auth
// pattern as app #6: long-lived bearer token in CTMS_TOKEN.
//
// Note: full cert content (notBefore / notAfter) requires Admin scope on
// the cTMS service binding. Without it the response includes metadata
// (id, name) but the cert PEM may be elided — those rows just don't have
// a parsable candidate and we skip them.
async function loadCtmsCerts() {
  if (!process.env.CTMS_URL || !process.env.CTMS_TOKEN) return [];
  const out = [];
  let resp;
  try {
    resp = await axios.get(`${process.env.CTMS_URL}/v2/landscapeIdentities`, {
      headers: { Authorization: `Bearer ${process.env.CTMS_TOKEN}` },
      timeout: 30_000,
    });
  } catch (e) {
    cds.log('cert-service').warn(`cTMS landscapeIdentities scan failed: ${e.message}`);
    return [];
  }
  const items = resp.data?.landscapeIdentities
             || resp.data?.value
             || (Array.isArray(resp.data) ? resp.data : []);
  let host = 'ctms';
  try { host = new URL(process.env.CTMS_URL).hostname; } catch { /* keep fallback */ }

  for (const it of items) {
    const name = it.name || it.id || it.identityName || 'unnamed-identity';
    const candidates = collectCertCandidates(it);
    // cTMS-specific shapes that collectCertCandidates doesn't know about
    if (it.publicKey)                 candidates.push(it.publicKey);
    if (it.signingCertificateContent) candidates.push(it.signingCertificateContent);
    if (it.publicKeyPem)              candidates.push(it.publicKeyPem);
    for (const cand of candidates) {
      const parsed = parseCertCandidate(cand);
      if (!parsed) continue;
      out.push({
        kind:           'CTMS',
        subaccountId:   'ctms-tenant',
        subaccountName: host,
        name,
        ...parsed,
        blastRadius:    `cTMS signing identity "${name}" — every transport import that verifies against this key`,
      });
    }
  }
  return out;
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

      const enriched = raw.map((c) => {
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

      // Fire ANS notifications for unacknowledged certs in the critical
      // band (severity = 'error' or 'expired'). The library no-ops when
      // ANS isn't configured and de-dups within a 12-hour window so a
      // dashboard refresh doesn't re-page on-call.
      const alertable = enriched.filter((c) => !c.acknowledged && ['error', 'expired'].includes(c.severity));
      if (alertable.length && ans.hasCredentials()) {
        ans.notifyFindings(alertable, (c) => ({
          eventType: c.severity === 'expired' ? 'cert.expiry.expired' : 'cert.expiry.critical',
          severity:  c.severity === 'expired' ? 'FATAL' : 'ERROR',
          subject:   `${c.kind} cert "${c.name}" — ${c.severity === 'expired' ? 'EXPIRED' : `${c.daysToExpiry}d left`}`,
          body:      `${c.kind} cert "${c.name}" (subject: ${c.subject || '?'}) expires ${c.notAfter}. Blast radius: ${c.blastRadius || 'see dashboard'}. Rotation owner: ${c.rotationOwner || 'unassigned'}.`,
          resource: {
            resourceName:     c.name,
            resourceType:     `btp.cert.${c.kind.toLowerCase()}`,
            resourceInstance: `${c.subaccountId}/${c.name}`,
          },
          tags: { subaccount: c.subaccountId, kind: c.kind, severity: c.severity },
        })).catch((e) => LOG.warn(`ANS notify failed: ${e.message}`));
      }

      return enriched;
    });

    this.on('getSummary', async () => {
      const certs = await this.send('getCerts');
      const t = await getThresholds();
      const hasDest  = !!process.env.DESTINATION_KEYS;
      const hasIas   = !!(process.env.IAS_API_URL && process.env.IAS_CLIENT_ID && process.env.IAS_CLIENT_SECRET);
      const hasXsuaa = getXsuaaKeys().length > 0;
      const hasCtms  = !!(process.env.CTMS_URL && process.env.CTMS_TOKEN);
      const sources = [hasDest, hasIas, hasXsuaa, hasCtms].filter(Boolean).length;
      const dataSource = sources === 0 ? 'mock'
                       : sources >= 2 ? 'live'
                       : 'mixed';
      return {
        totalCerts:     certs.length,
        expiredCount:   certs.filter((c) => c.daysToExpiry !== null && c.daysToExpiry < 0).length,
        critical14d:    certs.filter((c) => c.daysToExpiry !== null && c.daysToExpiry >= 0 && c.daysToExpiry <= t.criticalDays).length,
        warn30d:        certs.filter((c) => c.daysToExpiry !== null && c.daysToExpiry >  t.criticalDays && c.daysToExpiry <= t.warnDays).length,
        notice90d:      certs.filter((c) => c.daysToExpiry !== null && c.daysToExpiry >  t.warnDays && c.daysToExpiry <= t.noticeDays).length,
        unacknowledged: certs.filter((c) => !c.acknowledged && c.daysToExpiry !== null && c.daysToExpiry <= t.warnDays).length,
        dataSource,
        lastSyncAt:     new Date().toISOString(),
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
module.exports.__test__ = {
  daysUntil, severityFor, parsePem, lookupOwner,
  collectCertCandidates, parseCertCandidate, loadIasCerts,
  getXsuaaKeys, loadXsuaaTrustCerts, loadCtmsCerts,
  // expose so tests can clear the IAS OAuth cache between runs
  _resetIasTokenCache: () => { _iasTokenCache.token = null; _iasTokenCache.expiresAt = 0; },
  _resetOAuthTokenCache: () => { for (const k of Object.keys(_tokenCaches)) delete _tokenCaches[k]; },
};

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
