'use strict';

/**
 * UAS (Usage Data Management) client.
 *
 * Endpoints used:
 *   GET /reports/v1/monthlyUsage?fromDate=YYYYMM&toDate=YYYYMM
 *   GET /reports/v1/monthlySubaccountsCost?fromDate=YYYYMM&toDate=YYYYMM
 *
 * Service label in VCAP_SERVICES: "uas"
 * Plan: reporting-ga-admin (grants $XSAPPNAME.reporting.GA_Admin)
 * Base URL: credentials.target_url (sometimes credentials.url)
 *
 * Rate limit: UAS throttles long windows. Multi-month fetches are batched
 * by callers — see fetchMonthlyUsage().
 */

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

function lastNMonths(n, endMonth) {
  const results = [];
  const now = endMonth ? endMonth.split('-').map(Number)
                       : [new Date().getFullYear(), new Date().getMonth() + 1];
  const d = new Date(now[0], now[1] - 1, 1);
  for (let i = 0; i < n; i++) {
    results.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return results.reverse();   // ascending chronological order
}

async function uasGet(creds, path) {
  const token = await getOAuthToken(creds.uaa);
  const url   = creds.target_url || creds.url;
  const resp  = await axios.get(`${url}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout: 30_000,
  });
  return resp.data;
}

/**
 * Return monthlyUsage for each of N months ending now. Returns:
 *   [{ yearMonth, content: [...] }]
 * Batched in groups of 6 to respect rate limits.
 */
async function fetchMonthlyUsage(creds, months) {
  const monthList = lastNMonths(months);
  const BATCH = 6;
  const all = [];
  for (let i = 0; i < monthList.length; i += BATCH) {
    const batch = monthList.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async (ym) => {
      const d = ymToApiDate(ym);
      const data = await uasGet(creds, `/reports/v1/monthlyUsage?fromDate=${d}&toDate=${d}`);
      return { yearMonth: ym, content: data?.content ?? [] };
    }));
    for (const r of results) if (r.status === 'fulfilled') all.push(r.value);
  }
  return all.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

/** Same shape as fetchMonthlyUsage but for cost data. */
async function fetchMonthlyCost(creds, months) {
  const monthList = lastNMonths(months);
  const BATCH = 6;
  const all = [];
  for (let i = 0; i < monthList.length; i += BATCH) {
    const batch = monthList.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async (ym) => {
      const d = ymToApiDate(ym);
      const data = await uasGet(creds, `/reports/v1/monthlySubaccountsCost?fromDate=${d}&toDate=${d}`);
      return { yearMonth: ym, content: data?.content ?? [] };
    }));
    for (const r of results) if (r.status === 'fulfilled') all.push(r.value);
  }
  return all.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

module.exports = { getUasCredentials, fetchMonthlyUsage, fetchMonthlyCost, lastNMonths };
