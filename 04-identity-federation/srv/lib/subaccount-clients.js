'use strict';

const axios = require('axios');
const { getOAuthToken } = require('./oauth-cache');

function loadKeys() {
  const out = [];
  if (process.env.SUBACCOUNT_KEYS) {
    try { out.push(...JSON.parse(process.env.SUBACCOUNT_KEYS)); }
    catch (e) { /* fall through */ }
  }
  if (out.length === 0) {
    const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
    const xs = vcap['authorization']?.[0]?.credentials || vcap['xsuaa']?.[0]?.credentials;
    if (xs) {
      out.push({
        subaccountId:   'self',
        subaccountName: 'Local subaccount',
        xsuaa: { uaa: xs.uaa, apiurl: xs.apiurl },
      });
    }
  }
  return out;
}

async function authedGet(uaa, baseUrl, path) {
  const token = await getOAuthToken(uaa);
  const resp  = await axios.get(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout:      30_000,
    maxRedirects: 0,
    validateStatus: (s) => s < 500,
  });
  if (resp.status >= 400) {
    const err = new Error(`${baseUrl}${path} → HTTP ${resp.status}`);
    err.code = resp.status;
    throw err;
  }
  return resp.data;
}

async function getTrustConfigurations(saKey) {
  if (!saKey.xsuaa) return [];
  const data = await authedGet(saKey.xsuaa.uaa, saKey.xsuaa.apiurl,
                               '/sap/rest/authorization/v2/trust-configurations');
  return data?.trustConfigurations || data || [];
}

async function getRoleCollections(saKey) {
  if (!saKey.xsuaa) return [];
  const data = await authedGet(saKey.xsuaa.uaa, saKey.xsuaa.apiurl,
                               '/sap/rest/authorization/v2/role-collections');
  return data?.resources || data || [];
}

module.exports = { loadKeys, getTrustConfigurations, getRoleCollections };
