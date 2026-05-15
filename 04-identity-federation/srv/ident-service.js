'use strict';

const cds   = require('@sap/cds');
const axios = require('axios');
const crypto = require('crypto');

const sa  = require('./lib/subaccount-clients');
const cis = require('./lib/cis-client');

// ─── IAS Client ───────────────────────────────────────────────────────────────
const _iasTokenCache = { token: null, expiresAt: 0 };
async function getIasToken() {
  if (_iasTokenCache.token && Date.now() < _iasTokenCache.expiresAt) return _iasTokenCache.token;
  const url = process.env.IAS_OAUTH_URL || `${process.env.IAS_API_URL}/oauth2/token`;
  const resp = await axios.post(url, new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.IAS_CLIENT_ID,
    client_secret: process.env.IAS_CLIENT_SECRET,
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
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

function hasIasCredentials() {
  return !!(process.env.IAS_API_URL && process.env.IAS_CLIENT_ID && process.env.IAS_CLIENT_SECRET);
}

// ─── Cert Parsing ────────────────────────────────────────────────────────────
function pemNotAfter(pemOrBase64) {
  if (!pemOrBase64) return null;
  try {
    // Accept either raw PEM or base64-wrapped PEM.
    const s = String(pemOrBase64);
    const cert = new crypto.X509Certificate(
      s.includes('BEGIN CERTIFICATE') ? s : Buffer.from(s, 'base64')
    );
    return new Date(cert.validTo).toISOString().slice(0, 10);
  } catch { return null; }
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  return Math.floor((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
}

// ─── Service ──────────────────────────────────────────────────────────────────
class IdentService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('ident-service');
    if (!hasIasCredentials()) {
      LOG.warn('IAS_* env vars not set — IAS-side data will be empty. See README.');
    }

    // ── getTrusts ────────────────────────────────────────────────────────────
    //
    // Walks SUBACCOUNT_KEYS; for each subaccount with an `xsuaa` block, calls
    // the Authorization & Trust Management v2 trust-configurations endpoint.
    // Each trust may carry SAML/OIDC certificate material — we parse expiry.
    this.on('getTrusts', async () => {
      const saKeys   = sa.loadKeys();
      const cisCreds = cis.getCisCredentials();
      const subs     = cisCreds ? await cis.listSubaccounts(cisCreds) : [];
      const subByGuid = {}; for (const s of subs) subByGuid[s.guid] = s;

      const out = [];
      await Promise.all(saKeys.map(async (k) => {
        if (!k.xsuaa) return;
        try {
          const trusts = await sa.getTrustConfigurations(k);
          for (const t of trusts) {
            const certPem = t.samlMetadata?.signingCertificate
                          || t.signingCertificate
                          || t.certificate
                          || t.openIdConnectConfiguration?.publicKey;
            const notAfter = pemNotAfter(certPem);
            out.push({
              subaccountId:    k.subaccountId,
              subaccountName:  k.subaccountName || subByGuid[k.subaccountId]?.displayName || k.subaccountId,
              iasTenantHost:   process.env.IAS_API_URL?.replace(/^https?:\/\//, '') || '',
              trustName:       t.name || t.id || t.originKey || 'unnamed',
              type:            t.type || (t.samlMetadata ? 'SAML' : t.openIdConnectConfiguration ? 'OIDC' : 'Internal'),
              autoCreateUsers: !!(t.autoCreateUserAccount || t.autoCreateShadowUsers),
              enabled:         t.enabled !== false,
              issuer:          t.identityProvider || t.issuer || t.metadataUrl || '',
              certNotAfter:    notAfter || '',
              daysToExpiry:    daysUntil(notAfter),
            });
          }
        } catch (e) {
          LOG.warn(`Trust config skip ${k.subaccountName}: ${e.message}`);
        }
      }));

      if (out.length === 0 && saKeys.length === 0) return mockTrusts();
      return out;
    });

    // ── getAppPolicies ───────────────────────────────────────────────────────
    this.on('getAppPolicies', async () => {
      if (!hasIasCredentials()) return mockAppPolicies();
      const apps = await iasGet('/Applications');
      const out = [];
      for (const a of apps?.applications || []) {
        let mfa = null;
        try {
          const p = await iasGet(`/Applications/${a.id}/authenticationPolicies`);
          mfa = !!(p?.requireMfaForAllUsers || p?.mfa?.enabled);
        } catch { /* fall through */ }
        out.push({
          appId:            a.id,
          appName:          a.name,
          mfaEnforced:      mfa,
          riskBasedEnabled: !!a.riskBasedAuthentication,
          forwardingTo:     a.forwardingProxyConfiguration?.upstreamIdpName || '',
          description:      a.description || '',
        });
      }
      return out;
    });

    // ── getDormantUsers ──────────────────────────────────────────────────────
    this.on('getDormantUsers', async () => {
      if (!hasIasCredentials()) return mockDormantUsers();
      const data = await iasGet('/scim/Users?count=200');
      const policy = await getPolicy();
      return (data?.Resources || [])
        .map((u) => {
          const ext = u['urn:sap:cloud:scim:schemas:extension:custom:2.0:User'] || {};
          const lastLogin = ext.lastLogin || ext.last_login || u.meta?.lastModified || '';
          const ms = lastLogin ? new Date(lastLogin).getTime() : 0;
          const days = ms ? Math.floor((Date.now() - ms) / 86_400_000) : null;
          return {
            userId:        u.id,
            email:         u.emails?.[0]?.value || '',
            displayName:   u.displayName || `${u.name?.givenName || ''} ${u.name?.familyName || ''}`.trim(),
            lastLogin,
            daysSinceLogin: days,
            status:        u.active ? 'active' : 'inactive',
            iasGroupCount: u.groups?.length || 0,
          };
        })
        .filter((u) => u.daysSinceLogin === null || (u.daysSinceLogin >= policy.dormantUserDays))
        .sort((a, b) => (b.daysSinceLogin || 0) - (a.daysSinceLogin || 0));
    });

    // ── getFindings ──────────────────────────────────────────────────────────
    this.on('getFindings', async () => {
      const [trusts, apps, dormant, ignores] = await Promise.all([
        this.send('getTrusts'),
        this.send('getAppPolicies'),
        this.send('getDormantUsers'),
        cds.db.run(SELECT.from('com.btpconsulting.identityfederation.IgnoreRule')),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const ignoreSet = new Map();
      for (const r of ignores) {
        if (r.expiresAt && r.expiresAt < today) continue;
        ignoreSet.set(`${r.findingCode}||${r.target}`, r.reason || '');
      }

      const findings = [];
      const policy = await getPolicy();

      for (const t of trusts) {
        if (t.daysToExpiry !== null && t.daysToExpiry !== undefined && t.daysToExpiry <= policy.certWarnDays) {
          const k = `TRUST_CERT_EXPIRING||${t.subaccountId}:${t.trustName}`;
          findings.push({
            code: 'TRUST_CERT_EXPIRING',
            severity: t.daysToExpiry <= 14 ? 'error' : 'warn',
            target: `${t.subaccountId}:${t.trustName}`,
            summary: `Trust cert expires in ${t.daysToExpiry} days (${t.certNotAfter})`,
            detail: JSON.stringify(t),
            ignored: ignoreSet.has(k),
            ignoreReason: ignoreSet.get(k) || '',
          });
        }
      }

      for (const a of apps) {
        if (policy.requireMfaForAdmins && /admin|cockpit|ops/i.test(a.appName) && a.mfaEnforced === false) {
          const k = `MFA_MISSING_ON_ADMIN_APP||${a.appId}`;
          findings.push({
            code: 'MFA_MISSING_ON_ADMIN_APP',
            severity: 'error',
            target: a.appId,
            summary: `App "${a.appName}" appears to be admin-tier but has MFA disabled`,
            detail: JSON.stringify(a),
            ignored: ignoreSet.has(k),
            ignoreReason: ignoreSet.get(k) || '',
          });
        }
      }

      for (const u of dormant) {
        const k = `DORMANT_USER||${u.email}`;
        findings.push({
          code: 'DORMANT_USER',
          severity: 'warn',
          target: u.email,
          summary: `${u.email} dormant for ${u.daysSinceLogin ?? '?'} days`,
          detail: JSON.stringify(u),
          ignored: ignoreSet.has(k),
          ignoreReason: ignoreSet.get(k) || '',
        });
      }

      return findings;
    });

    // ── getSummary ───────────────────────────────────────────────────────────
    this.on('getSummary', async () => {
      const [trusts, apps, dormant, findings] = await Promise.all([
        this.send('getTrusts'),
        this.send('getAppPolicies'),
        this.send('getDormantUsers'),
        this.send('getFindings'),
      ]);
      const open = findings.filter((f) => !f.ignored);
      const hasIas  = hasIasCredentials();
      const hasKeys = sa.loadKeys().length > 0;
      const dataSource = hasIas && hasKeys ? 'live'
                       : hasIas || hasKeys ? 'mixed'
                       : 'mock';
      return {
        iasApps:           apps.length,
        appsWithoutMfa:    apps.filter((a) => a.mfaEnforced === false).length,
        trustConfigs:      trusts.length,
        trustsExpiring60d: trusts.filter((t) => t.daysToExpiry !== null && t.daysToExpiry <= 60).length,
        dormantUsers:      dormant.length,
        findings:          open.length,
        criticalFindings:  open.filter((f) => f.severity === 'error').length,
        dataSource,
        lastSyncAt:        new Date().toISOString(),
      };
    });

    return super.init();
  }
}

async function getPolicy() {
  const r = await cds.db.run(
    SELECT.one.from('com.btpconsulting.identityfederation.HealthPolicy').where({ id: 'default' })
  );
  return r || { id: 'default', dormantUserDays: 90, certWarnDays: 60, requireMfaForAdmins: true };
}

module.exports = IdentService;
module.exports.__test__ = { pemNotAfter, daysUntil, hasIasCredentials };

// ─── Mock Data ────────────────────────────────────────────────────────────────
function mockTrusts() {
  return [
    { subaccountId: 'sub-001', subaccountName: 'Production', iasTenantHost: 'acme.accounts.ondemand.com', trustName: 'IAS-Trust', type: 'OIDC', autoCreateUsers: true,  enabled: true, issuer: 'https://acme.accounts.ondemand.com', certNotAfter: '2026-07-12', daysToExpiry: 65 },
    { subaccountId: 'sub-002', subaccountName: 'QA',         iasTenantHost: 'acme.accounts.ondemand.com', trustName: 'IAS-Trust', type: 'OIDC', autoCreateUsers: true,  enabled: true, issuer: 'https://acme.accounts.ondemand.com', certNotAfter: '2026-05-22', daysToExpiry: 14 },
    { subaccountId: 'sub-003', subaccountName: 'Dev',        iasTenantHost: 'acme.accounts.ondemand.com', trustName: 'SAP-IDS',   type: 'SAML', autoCreateUsers: false, enabled: true, issuer: 'https://accounts.sap.com',          certNotAfter: '',           daysToExpiry: null },
  ];
}
function mockAppPolicies() {
  return [
    { appId: 'app-1', appName: 'BTP Cockpit Admin',    mfaEnforced: false, riskBasedEnabled: false, forwardingTo: '',         description: 'Admin tools' },
    { appId: 'app-2', appName: 'BTP Billing Dashboard',mfaEnforced: true,  riskBasedEnabled: true,  forwardingTo: '',         description: 'Cost reports' },
    { appId: 'app-3', appName: 'Subaccount Lifecycle', mfaEnforced: true,  riskBasedEnabled: false, forwardingTo: 'azure-ad',  description: 'Inventory'   },
  ];
}
function mockDormantUsers() {
  return [
    { userId: 'u-1', email: 'former.employee@acme.com', displayName: 'Former Employee', lastLogin: '2025-11-04T10:12:00Z', daysSinceLogin: 185, status: 'active', iasGroupCount: 3 },
    { userId: 'u-2', email: 'consultant.x@partners.io', displayName: 'Consultant X',    lastLogin: '2026-01-05T08:30:00Z', daysSinceLogin: 123, status: 'active', iasGroupCount: 2 },
  ];
}
