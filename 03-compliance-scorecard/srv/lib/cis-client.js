'use strict';

const axios = require('axios');
const { getOAuthToken } = require('./oauth-cache');

function getCisCredentials() {
  const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
  if (vcap.cis?.[0]) return vcap.cis[0].credentials;
  if (process.env.CIS_CREDENTIALS) return JSON.parse(process.env.CIS_CREDENTIALS);
  return null;
}

async function cisGet(creds, baseKey, path) {
  const token   = await getOAuthToken(creds.uaa);
  const baseUrl = creds.endpoints?.[baseKey] || creds.url;
  const resp = await axios.get(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout: 30_000,
  });
  return resp.data;
}

async function listSubaccounts(creds) {
  const data = await cisGet(creds, 'accounts_service_url', '/accounts/v1/subaccounts');
  return data?.value ?? [];
}

module.exports = { getCisCredentials, listSubaccounts };
