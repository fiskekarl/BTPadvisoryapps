'use strict';
const axios = require('axios');
const { getOAuthToken } = require('./oauth-cache');

function getUasCredentials() {
  const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
  const binding = vcap['uas']?.[0] || vcap['usage-data-management']?.[0];
  if (binding) return binding.credentials;
  if (process.env.USAGE_API_CREDENTIALS) return JSON.parse(process.env.USAGE_API_CREDENTIALS);
  return null;
}

function ymToApiDate(yearMonth) { return parseInt(yearMonth.replace('-', ''), 10); }

async function fetchSubaccountCost(creds, yearMonth) {
  const token = await getOAuthToken(creds.uaa);
  const url   = creds.target_url || creds.url;
  const d     = ymToApiDate(yearMonth);
  const resp  = await axios.get(`${url}/reports/v1/monthlySubaccountsCost?fromDate=${d}&toDate=${d}`, {
    headers:      { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout:      30_000,
    maxRedirects: 0,
  });
  return resp.data?.content ?? [];
}

module.exports = { getUasCredentials, fetchSubaccountCost };
