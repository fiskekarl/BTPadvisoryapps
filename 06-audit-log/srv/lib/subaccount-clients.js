'use strict';

const axios = require('axios');
const { getOAuthToken } = require('./oauth-cache');

function loadKeys() {
  const out = [];
  if (process.env.SUBACCOUNT_KEYS) {
    try { out.push(...JSON.parse(process.env.SUBACCOUNT_KEYS)); } catch (e) { /* fall through */ }
  }
  if (out.length === 0) {
    const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
    const aud = vcap['auditlog-management']?.[0]?.credentials || vcap['auditlog-api']?.[0]?.credentials;
    if (aud) out.push({ subaccountId: 'self', subaccountName: 'Local subaccount',
                        auditLog: { uaa: aud.uaa, url: aud.url } });
  }
  return out;
}

async function authedGet(uaa, baseUrl, path) {
  const token = await getOAuthToken(uaa);
  const resp = await axios.get(`${baseUrl}${path}`, {
    headers:        { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout:        30_000,
    maxRedirects:   0,
    validateStatus: (s) => s < 500,
  });
  if (resp.status >= 400) {
    const err = new Error(`${baseUrl}${path} → HTTP ${resp.status}`);
    err.code = resp.status; throw err;
  }
  return resp.data;
}

async function getAuditEvents(saKey, fromIso) {
  if (!saKey.auditLog) return [];
  const path = `/audit-log/v2/auditlogrecords?time_from=${encodeURIComponent(fromIso)}`;
  const data = await authedGet(saKey.auditLog.uaa, saKey.auditLog.url, path);
  return Array.isArray(data) ? data : (data?.value ?? []);
}

module.exports = { loadKeys, getAuditEvents };
