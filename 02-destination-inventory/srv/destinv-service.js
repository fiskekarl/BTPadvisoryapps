'use strict';

const cds   = require('@sap/cds');
const axios = require('axios');
const crypto = require('crypto');

// ─── OAuth Token Cache ───────────────────────────────────────────────────────
// Same pattern as BTPbilling: per-clientid cache.

const _tokenCaches = {};
async function getOAuthToken(uaa) {
  const key = uaa.clientid;
  if (!_tokenCaches[key]) _tokenCaches[key] = { token: null, expiresAt: 0 };
  const cache = _tokenCaches[key];
  if (cache.token && Date.now() < cache.expiresAt) return cache.token;
  const resp = await axios.post(`${uaa.url}/oauth/token`,
    new URLSearchParams({ grant_type: 'client_credentials', client_id: uaa.clientid, client_secret: uaa.clientsecret }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  cache.token     = resp.data.access_token;
  cache.expiresAt = Date.now() + (resp.data.expires_in - 60) * 1000;
  return cache.token;
}

// ─── Destination Service Client ──────────────────────────────────────────────
//
// The subaccount-bound destination instance returns destinations of THIS
// subaccount only. To inventory the whole global account we expect the
// consultant to inject DESTINATION_KEYS env var with a JSON array of
// service-key credentials, one per subaccount, during client deploy.
//
// DESTINATION_KEYS = [
//   { "subaccountId": "guid", "subaccountName": "Production",  "uaa": {...}, "uri": "https://destination..." },
//   { "subaccountId": "guid", "subaccountName": "QA",          "uaa": {...}, "uri": "..." },
//   ...
// ]
function getDestinationKeys() {
  if (process.env.DESTINATION_KEYS) {
    try { return JSON.parse(process.env.DESTINATION_KEYS); } catch { /* ignore */ }
  }
  // Fallback: only the locally-bound destination instance.
  const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
  const own  = vcap.destination?.[0]?.credentials;
  if (own) return [{ subaccountId: 'self', subaccountName: 'Self', uaa: own.uaa, uri: own.uri }];
  return null;
}

async function destApiGet(creds, path) {
  const token = await getOAuthToken(creds.uaa);
  const resp = await axios.get(`${creds.uri}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30_000,
  });
  return resp.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseCertNotAfter(destCfg) {
  // The destination service returns x509 certs as PEM string in `KeyStoreLocation`
  // or `keystoreLocation` only as a filename — actual cert content arrives via
  // the GET /destinations/{name} endpoint as base64 in `Certificates[].Content`.
  // For the first pass we parse the PEM if present.
  const pemContainer = destCfg.Certificates?.[0]?.Content;
  if (!pemContainer) return null;
  try {
    // crypto.X509Certificate is Node 19+, available in our Node 20 baseline.
    const buf = Buffer.from(pemContainer, 'base64');
    const cert = new crypto.X509Certificate(buf);
    return cert.validToISOString
      ? cert.validToISOString.slice(0, 10)
      : new Date(cert.validTo).toISOString().slice(0, 10);
  } catch { return null; }
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  return Math.floor((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
}

// ─── Service Implementation ───────────────────────────────────────────────────
class DestinvService extends cds.ApplicationService {
  async init() {
    const LOG  = cds.log('destinv-service');
    const keys = getDestinationKeys();
    if (!keys) LOG.warn('No destination service keys — running in mock mode.');

    // ── getDestinations ──────────────────────────────────────────────────────
    this.on('getDestinations', async () => {
      if (!keys) return mockDestinations();

      const all = [];
      for (const k of keys) {
        try {
          const data = await destApiGet(k, '/destination-configuration/v1/subaccountDestinations');
          const items = Array.isArray(data) ? data : (data?.destinationConfigurations ?? []);
          for (const d of items) {
            const certNotAfter = parseCertNotAfter(d);
            all.push({
              subaccountId:   k.subaccountId,
              subaccountName: k.subaccountName,
              name:           d.Name,
              type:           d.Type || 'HTTP',
              proxyType:      d.ProxyType || 'Internet',
              url:            d.URL || '',
              authentication: d.Authentication || 'NoAuthentication',
              description:    d.Description || '',
              additionalProps: JSON.stringify(d),
              certNotAfter,
              daysToExpiry:   daysUntil(certNotAfter),
              // TODO: implement /destination-configuration/v1/destinations/{name}/check
              //       to populate lastTestStatus. Today the service does not
              //       expose a public /check endpoint — we'd need to GET the
              //       destination, follow URL with the configured auth, and
              //       report 200/401/timeout. Skipping in v1.
              lastTestStatus: 'UNKNOWN',
            });
          }
        } catch (e) {
          LOG.warn(`Skipping subaccount ${k.subaccountName}:`, e.message);
        }
      }
      return all;
    });

    // ── getFindings ──────────────────────────────────────────────────────────
    this.on('getFindings', async () => {
      const dests   = await this.send('getDestinations');
      const policy  = await getPolicy();
      const ignores = await cds.db.run(SELECT.from('com.btpconsulting.destinationinventory.IgnoreRule'));
      const today   = new Date().toISOString().slice(0, 10);
      const ignoreKey = (sa, dn, c) => `${sa}||${dn}||${c}`;
      const ignoreSet = new Map();
      for (const r of ignores) {
        if (r.expiresAt && r.expiresAt < today) continue;
        ignoreSet.set(ignoreKey(r.subaccountId, r.destinationName, r.findingCode), r.reason || '');
      }

      const findings = [];
      const isProd = (sa) => /prod/i.test(sa.subaccountName || '');

      for (const d of dests) {
        // BASIC_AUTH_IN_PROD ----------------------------------------------------
        if (policy.flagBasicAuth && d.authentication === 'BasicAuthentication' && isProd(d)) {
          const k = ignoreKey(d.subaccountId, d.name, 'BASIC_AUTH_IN_PROD');
          findings.push({
            code:            'BASIC_AUTH_IN_PROD',
            severity:        'error',
            subaccountId:    d.subaccountId,
            destinationName: d.name,
            summary:         `Destination "${d.name}" uses BasicAuth in a production subaccount`,
            detail:          JSON.stringify({ url: d.url, type: d.type, proxy: d.proxyType }),
            ignored:         ignoreSet.has(k),
            ignoreReason:    ignoreSet.get(k) || '',
          });
        }

        // CERT_EXPIRING ---------------------------------------------------------
        if (d.daysToExpiry !== null && d.daysToExpiry !== undefined) {
          let severity = null;
          if (d.daysToExpiry <= policy.maxCertExpiryCriticalDays) severity = 'error';
          else if (d.daysToExpiry <= policy.maxCertExpiryWarnDays) severity = 'warn';
          if (severity) {
            const k = ignoreKey(d.subaccountId, d.name, 'CERT_EXPIRING');
            findings.push({
              code:            'CERT_EXPIRING',
              severity,
              subaccountId:    d.subaccountId,
              destinationName: d.name,
              summary:         `Client certificate expires in ${d.daysToExpiry} days (${d.certNotAfter})`,
              detail:          JSON.stringify({ certNotAfter: d.certNotAfter }),
              ignored:         ignoreSet.has(k),
              ignoreReason:    ignoreSet.get(k) || '',
            });
          }
        }

        // TODO: DANGLING_TARGET — would require destApiTest (see TODO above)
        //       to verify last-known status; without that we cannot detect
        //       targets pointing at decommissioned systems.

        // TODO: MTLS_AVAILABLE_NOT_USED — needs catalog of which target systems
        //       support mTLS. Build a YAML registry per engagement and ship
        //       in db/seed/.
      }

      return findings;
    });

    // ── getSummary ───────────────────────────────────────────────────────────
    this.on('getSummary', async () => {
      const dests    = await this.send('getDestinations');
      const findings = await this.send('getFindings');
      const open     = findings.filter((f) => !f.ignored);
      return {
        totalDestinations: dests.length,
        basicAuthCount:    dests.filter((d) => d.authentication === 'BasicAuthentication').length,
        onPremiseCount:    dests.filter((d) => d.proxyType === 'OnPremise').length,
        certsExpiring60d:  dests.filter((d) => d.daysToExpiry !== null && d.daysToExpiry <= 60).length,
        certsExpiring14d:  dests.filter((d) => d.daysToExpiry !== null && d.daysToExpiry <= 14).length,
        findings:          open.length,
        criticalFindings:  open.filter((f) => f.severity === 'error').length,
      };
    });

    return super.init();
  }
}

async function getPolicy() {
  const rows = await cds.db.run(
    SELECT.one.from('com.btpconsulting.destinationinventory.ScanPolicy').where({ id: 'default' })
  );
  return rows || {
    id: 'default',
    flagBasicAuth: true,
    requireMtlsForProd: true,
    maxCertExpiryWarnDays: 60,
    maxCertExpiryCriticalDays: 14,
    flagDanglingTargets: true,
  };
}

module.exports = DestinvService;

// ─── Mock Data ────────────────────────────────────────────────────────────────
function mockDestinations() {
  return [
    { subaccountId: 'sub-001', subaccountName: 'Production',  name: 's4-erp',         type: 'HTTP', proxyType: 'OnPremise', url: 'https://s4.acme.local',           authentication: 'BasicAuthentication',     description: 'S/4HANA backend',  additionalProps: '{}', certNotAfter: '',           daysToExpiry: null, lastTestStatus: 'UNKNOWN' },
    { subaccountId: 'sub-001', subaccountName: 'Production',  name: 'sf-success',     type: 'HTTP', proxyType: 'Internet',  url: 'https://api.successfactors.com', authentication: 'OAuth2ClientCredentials', description: 'SuccessFactors',   additionalProps: '{}', certNotAfter: '2026-06-15', daysToExpiry: 38,   lastTestStatus: 'UNKNOWN' },
    { subaccountId: 'sub-001', subaccountName: 'Production',  name: 'crm-legacy',     type: 'HTTP', proxyType: 'OnPremise', url: 'https://crm-old.acme.local',     authentication: 'ClientCertificateAuthentication', description: 'CRM',     additionalProps: '{}', certNotAfter: '2026-05-19', daysToExpiry: 11,   lastTestStatus: 'UNKNOWN' },
    { subaccountId: 'sub-002', subaccountName: 'QA',          name: 's4-erp-qa',      type: 'HTTP', proxyType: 'OnPremise', url: 'https://s4-qa.acme.local',       authentication: 'BasicAuthentication',     description: 'S/4HANA QA',       additionalProps: '{}', certNotAfter: '',           daysToExpiry: null, lastTestStatus: 'UNKNOWN' },
    { subaccountId: 'sub-003', subaccountName: 'Dev',         name: 'mock-svc',       type: 'HTTP', proxyType: 'Internet',  url: 'https://mock.acme.dev',          authentication: 'NoAuthentication',        description: 'Mock service',     additionalProps: '{}', certNotAfter: '',           daysToExpiry: null, lastTestStatus: 'UNKNOWN' },
  ];
}
