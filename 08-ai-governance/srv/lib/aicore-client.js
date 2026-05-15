'use strict';

/**
 * AI Core client — talks to the SAP AI Core admin REST API.
 *
 * Env vars (set during per-client deploy from the AI Core service-key):
 *   AI_CORE_URL            base URL, e.g. https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com
 *   AI_CORE_OAUTH_URL      e.g. https://<subdomain>.authentication.eu10.hana.ondemand.com/oauth/token
 *   AI_CORE_CLIENT_ID
 *   AI_CORE_CLIENT_SECRET
 *
 * Endpoints used:
 *   GET /v2/admin/resourceGroups
 *   GET /v2/lm/deployments        (with AI-Resource-Group header)
 *   GET /v2/lm/configurations     (with AI-Resource-Group header)
 *
 * Generative AI Hub orchestration configs live under the same API space with
 * scenarioId "orchestration".
 */

const axios = require('axios');

let _token = { value: null, expiresAt: 0 };
async function getToken() {
  if (_token.value && Date.now() < _token.expiresAt) return _token.value;
  const resp = await axios.post(process.env.AI_CORE_OAUTH_URL, new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.AI_CORE_CLIENT_ID,
    client_secret: process.env.AI_CORE_CLIENT_SECRET,
  }).toString(), {
    headers:      { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout:      30_000,
    maxRedirects: 0,
  });
  _token.value     = resp.data.access_token;
  _token.expiresAt = Date.now() + (resp.data.expires_in - 60) * 1000;
  return _token.value;
}

function hasCredentials() {
  return !!(process.env.AI_CORE_URL && process.env.AI_CORE_OAUTH_URL
         && process.env.AI_CORE_CLIENT_ID && process.env.AI_CORE_CLIENT_SECRET);
}

async function aiGet(path, rgId) {
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (rgId) headers['AI-Resource-Group'] = rgId;
  const resp = await axios.get(`${process.env.AI_CORE_URL}${path}`, {
    headers,
    timeout:        30_000,
    maxRedirects:   0,
    validateStatus: (s) => s < 500,
  });
  if (resp.status >= 400) {
    const err = new Error(`AI Core ${path} → HTTP ${resp.status}`);
    err.code = resp.status; throw err;
  }
  return resp.data;
}

async function listResourceGroups() {
  const data = await aiGet('/v2/admin/resourceGroups');
  return data?.resources || data?.value || data || [];
}

async function listDeployments(rgId) {
  const data = await aiGet('/v2/lm/deployments', rgId);
  return data?.resources || data?.value || data || [];
}

async function listConfigurations(rgId) {
  const data = await aiGet('/v2/lm/configurations', rgId);
  return data?.resources || data?.value || data || [];
}

/**
 * Fetch usage metrics for one resource group between two ISO timestamps.
 * Returns the raw `value` / `resources` array of metric resources — the
 * shape varies between AI Core versions, so callers must handle the
 * payload defensively.
 *
 * Endpoint: GET /v2/lm/metrics
 * Filter:   $filter=startTime ge <fromIso> and startTime le <toIso>
 * (See SAP AI Core REST API reference, "Metrics" section.)
 */
async function fetchMetrics(rgId, fromIso, toIso) {
  const filter = encodeURIComponent(`startTime ge ${fromIso} and startTime le ${toIso}`);
  const data = await aiGet(`/v2/lm/metrics?$filter=${filter}`, rgId);
  return data?.resources || data?.value || (Array.isArray(data) ? data : []);
}

module.exports = { hasCredentials, listResourceGroups, listDeployments, listConfigurations, fetchMetrics };
