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

// ─── Reachability probe ─────────────────────────────────────────────────────
//
// "Live reachability" for a destination means two things:
//   1. The destination service can RESOLVE the destination (auth flow OK,
//      target URL produced).
//   2. The target URL itself responds to a HEAD/GET within the timeout.
//
// We probe (1) for every destination — that catches expired OAuth client
// secrets, broken IdP federations, and similar cred-side rot. We probe (2)
// only for safe combinations (HTTP + Internet + auth we can replay from a
// HEAD), because:
//   - OnPremise destinations require the Cloud Connector path; reaching
//     them from this BTP service would always fail and produce noise.
//   - ClientCertificateAuthentication would require us to load the
//     keystore client-side, which destination service abstracts away.
//   - RFC / LDAP / MAIL types use protocols we don't speak from CAP.
// All non-probable combinations report 'NOT_PROBED' so the UI tells the
// truth instead of showing a misleading 'UNKNOWN'.
//
// Status values: OK | UNREACHABLE | AUTH_FAILED | TIMEOUT | NOT_PROBED
//
// Results are cached in-memory keyed by (subaccountId::destName) with a
// 60-second TTL so a noisy refresh button doesn't fan out probes.

const _probeCache = new Map();
const PROBE_TTL_MS = 60_000;

function shouldProbeUrl(d) {
  if (d.type !== 'HTTP') return false;
  if (d.proxyType !== 'Internet') return false;
  return ['NoAuthentication', 'BasicAuthentication', 'OAuth2ClientCredentials'].includes(d.authentication);
}

function buildProbeHeaders(resolved) {
  const h = {};
  const tokens = resolved?.authTokens || [];
  if (tokens.length > 0 && tokens[0].value) {
    h.Authorization = `${tokens[0].type || 'Bearer'} ${tokens[0].value}`;
    return h;
  }
  const cfg = resolved?.destinationConfiguration || {};
  if (cfg.User && cfg.Password) {
    h.Authorization = 'Basic ' + Buffer.from(`${cfg.User}:${cfg.Password}`).toString('base64');
  }
  return h;
}

function classifyProbeError(err) {
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) return 'TIMEOUT';
  if (err?.response?.status === 401 || err?.response?.status === 403)     return 'AUTH_FAILED';
  return 'UNREACHABLE';
}

async function probeDestination(creds, dest, { timeoutMs = 5_000 } = {}) {
  if (!shouldProbeUrl(dest)) return 'NOT_PROBED';

  const cacheKey = `${creds.subaccountId}::${dest.name}`;
  const cached = _probeCache.get(cacheKey);
  if (cached && Date.now() - cached.t < PROBE_TTL_MS) return cached.v;

  let status;
  try {
    // Step 1: resolve via destination service. If this fails the destination
    // itself is broken (creds rot, missing fields, IdP gone) and we report
    // AUTH_FAILED / UNREACHABLE without ever touching the target URL.
    const token = await getOAuthToken(creds.uaa);
    const resolved = await axios.get(
      `${creds.uri}/destination-configuration/v1/destinations/${encodeURIComponent(dest.name)}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: timeoutMs }
    );
    const url = resolved.data?.destinationConfiguration?.URL || dest.url;
    if (!url) return 'UNREACHABLE';

    // Step 2: HEAD the resolved URL with the resolved auth.
    //
    // maxRedirects=0 on purpose: axios would otherwise forward the
    // Authorization header to the redirect target. A compromised or
    // misconfigured destination URL returning 302 → attacker.example.com
    // would leak the customer's BasicAuth user/password or OAuth bearer.
    // A 3xx is still "reachable" — we classify it as OK below.
    const probe = await axios.head(url, {
      headers:        buildProbeHeaders(resolved.data),
      timeout:        timeoutMs,
      validateStatus: () => true,
      maxRedirects:   0,
    });
    if (probe.status >= 200 && probe.status < 400) status = 'OK';
    else if (probe.status === 401 || probe.status === 403) status = 'AUTH_FAILED';
    else status = 'UNREACHABLE';
  } catch (e) {
    status = classifyProbeError(e);
  }

  _probeCache.set(cacheKey, { t: Date.now(), v: status });
  return status;
}

async function probeAll(creds, dests, { concurrency = 5 } = {}) {
  // Bounded parallelism: each "lane" pulls work off a shared queue. Keeps
  // total wall-clock down on a 50-destination subaccount without melting
  // the target systems with simultaneous probes.
  const queue = [...dests];
  const results = new Map();
  const worker = async () => {
    while (queue.length) {
      const d = queue.shift();
      results.set(d.name, await probeDestination(creds, d));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, dests.length) }, worker));
  return results;
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
      const perSubaccount = []; // [{ creds, dests }] for the probe pass below
      for (const k of keys) {
        try {
          const data = await destApiGet(k, '/destination-configuration/v1/subaccountDestinations');
          const items = Array.isArray(data) ? data : (data?.destinationConfigurations ?? []);
          const dests = [];
          for (const d of items) {
            const certNotAfter = parseCertNotAfter(d);
            const row = {
              subaccountId:    k.subaccountId,
              subaccountName:  k.subaccountName,
              name:            d.Name,
              type:            d.Type || 'HTTP',
              proxyType:       d.ProxyType || 'Internet',
              url:             d.URL || '',
              authentication:  d.Authentication || 'NoAuthentication',
              description:     d.Description || '',
              additionalProps: JSON.stringify(d),
              certNotAfter,
              daysToExpiry:    daysUntil(certNotAfter),
              lastTestStatus:  'UNKNOWN', // overwritten by the probe pass
            };
            all.push(row);
            dests.push(row);
          }
          if (dests.length) perSubaccount.push({ creds: k, dests });
        } catch (e) {
          LOG.warn(`Skipping subaccount ${k.subaccountName}:`, e.message);
        }
      }

      // Reachability probe — bounded parallel per subaccount. Failures are
      // swallowed; the row's lastTestStatus stays 'UNKNOWN' if the probe
      // pass itself crashes. Per-destination errors map to UNREACHABLE /
      // AUTH_FAILED / TIMEOUT inside probeDestination.
      await Promise.all(perSubaccount.map(async ({ creds, dests }) => {
        try {
          const statuses = await probeAll(creds, dests);
          for (const d of dests) d.lastTestStatus = statuses.get(d.name) || 'UNKNOWN';
        } catch (e) {
          LOG.warn(`Probe pass failed for ${creds.subaccountName}: ${e.message}`);
        }
      }));

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
        dataSource:        keys && keys.length > 0 ? 'live' : 'mock',
        lastSyncAt:        new Date().toISOString(),
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
module.exports.__test__ = {
  daysUntil, parseCertNotAfter, getDestinationKeys,
  shouldProbeUrl, buildProbeHeaders, classifyProbeError, probeDestination, probeAll,
  _resetProbeCache: () => _probeCache.clear(),
};

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
