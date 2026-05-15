'use strict';

const axios = require('axios');
const _caches = {};

async function getOAuthToken(uaa) {
  if (!uaa?.clientid) throw new Error('Missing uaa.clientid');
  const key = uaa.clientid;
  if (!_caches[key]) _caches[key] = { token: null, expiresAt: 0 };
  const cache = _caches[key];
  if (cache.token && Date.now() < cache.expiresAt) return cache.token;
  const resp = await axios.post(`${uaa.url}/oauth/token`,
    new URLSearchParams({
      grant_type: 'client_credentials', client_id: uaa.clientid, client_secret: uaa.clientsecret,
    }).toString(),
    {
      headers:      { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout:      30_000,
      maxRedirects: 0,
    });
  cache.token     = resp.data.access_token;
  cache.expiresAt = Date.now() + (resp.data.expires_in - 60) * 1000;
  return cache.token;
}

module.exports = { getOAuthToken };
