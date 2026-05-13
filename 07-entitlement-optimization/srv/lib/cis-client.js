'use strict';

const axios = require('axios');
const { getOAuthToken } = require('./oauth-cache');

function getCisCredentials() {
  const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
  if (vcap.cis?.[0]) return vcap.cis[0].credentials;
  if (process.env.CIS_CREDENTIALS) return JSON.parse(process.env.CIS_CREDENTIALS);
  return null;
}

async function listEntitlements(creds) {
  const token = await getOAuthToken(creds.uaa);
  const url   = creds.endpoints?.entitlements_service_url || creds.url;
  const resp  = await axios.get(`${url}/entitlements/v1/globalAccountAssignments`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout: 30_000,
  });
  return resp.data?.entitledServices ?? [];
}

module.exports = { getCisCredentials, listEntitlements };
