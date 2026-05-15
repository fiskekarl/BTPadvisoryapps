'use strict';
const axios = require('axios');
const { getOAuthToken } = require('./oauth-cache');

function getCisCredentials() {
  const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
  if (vcap.cis?.[0]) return vcap.cis[0].credentials;
  if (process.env.CIS_CREDENTIALS) return JSON.parse(process.env.CIS_CREDENTIALS);
  return null;
}

async function listSubaccounts(creds) {
  const token = await getOAuthToken(creds.uaa);
  const url   = creds.endpoints?.accounts_service_url || creds.url;
  const resp  = await axios.get(`${url}/accounts/v1/subaccounts`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout:      30_000,
    maxRedirects: 0,
  });
  return resp.data?.value ?? [];
}

module.exports = { getCisCredentials, listSubaccounts };
