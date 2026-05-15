'use strict';

/**
 * notification.js — Alert Notification Service (ANS) producer client.
 *
 * Each app duplicates this file (matching the existing srv/lib/ convention).
 * When ANS_URL is unset the library no-ops silently — apps stay demo-able
 * without configuring ANS.
 *
 * ANS architecture (from SAP docs):
 *   • One ANS instance receives events from many producers.
 *   • Routing to Slack / Teams / email / webhook is configured on the ANS
 *     side via subscription rules (matching eventType / severity / tags).
 *     This client only produces events; we don't manage subscriptions.
 *   • Endpoint: POST {ANS_URL}/cf/producer/v1/resource-events
 *   • Auth:    OAuth2 client-credentials, same pattern as other lib clients.
 *
 * Env vars (per-app deploy):
 *   ANS_URL              base URL of the ANS instance
 *   ANS_OAUTH_URL        OAuth token endpoint
 *   ANS_CLIENT_ID
 *   ANS_CLIENT_SECRET
 *
 * In-process dedup keeps the same finding from re-notifying on every
 * dashboard refresh — keyed by (eventType, resource, severity) with a
 * 12-hour TTL. Clear via _resetDedup() in tests.
 */

const axios = require('axios');

const DEDUP_TTL_MS = 12 * 60 * 60 * 1000;
const _dedup = new Map();
let _token = { value: null, expiresAt: 0 };

function hasCredentials() {
  return !!(process.env.ANS_URL && process.env.ANS_OAUTH_URL
         && process.env.ANS_CLIENT_ID && process.env.ANS_CLIENT_SECRET);
}

async function getToken() {
  if (_token.value && Date.now() < _token.expiresAt) return _token.value;
  // maxRedirects=0 is critical: this POST body carries client_secret.
  // A misconfigured / malicious ANS_OAUTH_URL returning 30x would
  // otherwise cause axios to follow with the secret intact.
  const resp = await axios.post(process.env.ANS_OAUTH_URL, new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.ANS_CLIENT_ID,
    client_secret: process.env.ANS_CLIENT_SECRET,
  }).toString(), {
    headers:      { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout:      30_000,
    maxRedirects: 0,
  });
  _token.value     = resp.data.access_token;
  _token.expiresAt = Date.now() + (resp.data.expires_in - 60) * 1000;
  return _token.value;
}

function dedupKey(evt) {
  return `${evt.eventType}|${evt.severity}|${evt.resource?.resourceName || ''}|${evt.resource?.resourceInstance || ''}`;
}

// True when neither resourceName nor resourceInstance is set. Such an
// event has a dedup key of `${eventType}|${severity}||`, which would
// silently collapse distinct events that share that key shape. We
// refuse to dedup these (every emit goes through) — and log a warning
// so the producer is reminded to set a resource.
function hasUsableResourceKey(evt) {
  return !!(evt.resource?.resourceName || evt.resource?.resourceInstance);
}

function isDuplicate(evt) {
  if (!hasUsableResourceKey(evt)) return false;
  const k = dedupKey(evt);
  const e = _dedup.get(k);
  return e && (Date.now() - e) < DEDUP_TTL_MS;
}

function markSent(evt) {
  if (!hasUsableResourceKey(evt)) return; // don't pollute the cache with collapsed keys
  _dedup.set(dedupKey(evt), Date.now());
}

/**
 * Produce a single event.
 *
 * @param {object} opts
 * @param {string} opts.eventType — e.g. 'cert.expiry.critical', 'destination.dangling'
 * @param {'INFO'|'NOTICE'|'WARNING'|'ERROR'|'FATAL'} opts.severity
 * @param {string} opts.subject  — short headline (max ~80 chars)
 * @param {string} opts.body     — longer description
 * @param {object} opts.resource — { resourceName, resourceType, resourceInstance, tags? }
 * @param {object} [opts.tags]   — extra string→string map
 *
 * Returns { sent: boolean, reason?: string }
 */
async function notify(opts) {
  if (!hasCredentials()) return { sent: false, reason: 'ans-unconfigured' };
  const event = {
    eventType:   opts.eventType,
    severity:    opts.severity || 'WARNING',
    category:    opts.category || 'ALERT',
    subject:     opts.subject,
    body:        opts.body,
    priority:    opts.priority || severityToPriority(opts.severity),
    resource:    opts.resource || {},
    tags:        opts.tags || {},
    eventTimestamp: Math.floor(Date.now() / 1000),
  };
  if (isDuplicate(event)) return { sent: false, reason: 'dedup' };

  try {
    const token = await getToken();
    // maxRedirects=0: the Authorization header would otherwise forward
    // on a 30x. Standard hygiene for any credential-bearing request.
    await axios.post(`${process.env.ANS_URL}/cf/producer/v1/resource-events`, event, {
      headers:      { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout:      30_000,
      maxRedirects: 0,
    });
    markSent(event);
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: 'transport-error', error: e.message };
  }
}

/**
 * Bulk-notify a list of findings. Maps each finding via the supplied
 * `toEvent` function. Returns { attempted, sent, deduped }.
 */
async function notifyFindings(findings, toEvent) {
  let attempted = 0, sent = 0, deduped = 0;
  for (const f of findings) {
    const evt = toEvent(f);
    if (!evt) continue;
    attempted++;
    const r = await notify(evt);
    if (r.sent)                       sent++;
    else if (r.reason === 'dedup')    deduped++;
  }
  return { attempted, sent, deduped };
}

function severityToPriority(s) {
  switch (s) {
    case 'FATAL':   return 1;
    case 'ERROR':   return 2;
    case 'WARNING': return 3;
    case 'NOTICE':  return 4;
    default:        return 5;
  }
}

module.exports = {
  hasCredentials, notify, notifyFindings,
  _resetDedup:      () => _dedup.clear(),
  _resetTokenCache: () => { _token = { value: null, expiresAt: 0 }; },
  _dedupKey:        dedupKey,
};
