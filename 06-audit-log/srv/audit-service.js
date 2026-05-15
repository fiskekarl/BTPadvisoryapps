'use strict';

const cds  = require('@sap/cds');
const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const sa = require('./lib/subaccount-clients');

// ─── cTMS integration ────────────────────────────────────────────────────────
// Cloud Transport Management Service exposes a Node Imports / Deployments API
// at the configured CTMS_URL with OAuth2 token from CTMS_TOKEN.
async function fetchCtmsDeployments(fromIso) {
  if (!process.env.CTMS_URL || !process.env.CTMS_TOKEN) return [];
  try {
    const resp = await axios.get(
      `${process.env.CTMS_URL}/v2/nodes/imports?from=${encodeURIComponent(fromIso)}`,
      {
        headers:      { Authorization: `Bearer ${process.env.CTMS_TOKEN}` },
        timeout:      30_000,
        maxRedirects: 0,
      }
    );
    return resp.data?.value || resp.data || [];
  } catch (e) {
    cds.log('audit-service').warn(`cTMS skip: ${e.message}`);
    return [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isoDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString();
}

function inWindow(ts, rule) {
  const d = new Date(ts);
  const day = d.getDay();      // 0=Sun, 6=Sat
  const isWeekend = day === 0 || day === 6;
  // If event is on weekend and rule.onWeekend is true → matches as anomaly.
  if (isWeekend && rule.onWeekend) return true;
  if (!rule.changeWindowStart || !rule.changeWindowEnd) return false;
  const hhmm = d.getHours() * 60 + d.getMinutes();
  const [sh, sm] = rule.changeWindowStart.split(':').map(Number);
  const [eh, em] = rule.changeWindowEnd.split(':').map(Number);
  return hhmm < sh * 60 + sm || hhmm > eh * 60 + em;
}

function applyAnomalyRules(event, rules) {
  for (const r of rules) {
    if (!r.enabled) continue;
    if (!new RegExp(r.actionPattern, 'i').test(event.action)) continue;
    // Action matched — check the time window or failure heuristic.
    if (r.id === 'FAILED_LOGIN_BURST' && event.outcome === 'failure') {
      return { anomalyId: r.id, anomalySeverity: r.severity };
    }
    if (inWindow(event.timestamp, r)) {
      return { anomalyId: r.id, anomalySeverity: r.severity };
    }
  }
  return { anomalyId: '', anomalySeverity: '' };
}

// ─── Service ──────────────────────────────────────────────────────────────────
class AuditService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('audit-service');
    await seedAnomalyRules();

    // ── getEvents ────────────────────────────────────────────────────────────
    this.on('getEvents', async (req) => {
      const days         = Math.min(Math.max(req.data.days || 30, 1), 90);
      const subaccountId = req.data.subaccountId;
      const actor        = req.data.actor;
      const saKeys       = sa.loadKeys();
      const rules        = await cds.db.run(
        SELECT.from('com.btpconsulting.auditlog.AnomalyRule').where({ enabled: true })
      );

      const targets = subaccountId
        ? saKeys.filter((k) => k.subaccountId === subaccountId)
        : saKeys.filter((k) => k.auditLog);

      if (targets.length === 0) return enrichWithAnomalies(mockEvents(days, subaccountId), rules);

      const fromIso = isoDaysAgo(days);
      const all = [];
      await Promise.all(targets.map(async (k) => {
        try {
          const events = await sa.getAuditEvents(k, fromIso);
          for (const r of events) {
            const ev = {
              timestamp:     r.time || r.recordedAt || '',
              subaccountId:  k.subaccountId,
              subaccountName: k.subaccountName,
              actor:         r.user || r.actor || '',
              action:        r.action || r.message || '',
              resourceType:  r.object?.type || r.objectType || '',
              resourceId:    r.object?.id || r.objectId || '',
              sourceIp:      r.ipAddress || r.source_ip || '',
              outcome:       r.status === 'success' || r.outcome === 'success' ? 'success' : 'failure',
            };
            if (actor && !ev.actor.toLowerCase().includes(actor.toLowerCase())) continue;
            const anomaly = applyAnomalyRules(ev, rules);
            all.push({ ...ev, ...anomaly });
          }
        } catch (e) {
          LOG.warn(`Audit skip ${k.subaccountName}: ${e.message}`);
        }
      }));

      return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });

    // ── getAnomalies ─────────────────────────────────────────────────────────
    this.on('getAnomalies', async (req) => {
      const events = await this.send('getEvents', { days: req.data?.days || 30 });
      return events.filter((e) => e.anomalyId);
    });

    // ── getChangeTimeline ────────────────────────────────────────────────────
    //
    // Merges audit-log events with cTMS deployment records into a single
    // timeline view useful for change-window walkthroughs.
    this.on('getChangeTimeline', async (req) => {
      const days = Math.min(Math.max(req.data?.days || 30, 1), 90);
      const fromIso = isoDaysAgo(days);
      const [events, ctms] = await Promise.all([
        this.send('getEvents', { days }),
        fetchCtmsDeployments(fromIso),
      ]);
      const auditRows = events
        .filter((e) => /deploy|destination|trust|role-collection/i.test(e.action))
        .map((e) => ({
          timestamp: e.timestamp, source: 'audit',
          subaccountId: e.subaccountId, actor: e.actor,
          summary: `${e.action} on ${e.resourceType || 'resource'}${e.resourceId ? ' ' + e.resourceId : ''}`,
          detail: JSON.stringify(e),
        }));
      const ctmsRows = ctms.map((r) => ({
        timestamp: r.completedAt || r.startedAt || '',
        source: 'ctms', subaccountId: r.targetNode || '', actor: r.initiator || '',
        summary: `${r.action || 'import'} ${r.mtaId || r.fileName || ''} → ${r.targetNode || ''}`,
        detail: JSON.stringify(r),
      }));
      return [...auditRows, ...ctmsRows].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });

    // ── getSummary ───────────────────────────────────────────────────────────
    this.on('getSummary', async () => {
      const events = await this.send('getEvents', { days: 30 });
      const anomalies = events.filter((e) => e.anomalyId);
      const hasAuditKeys = sa.loadKeys().some((k) => k.auditLog);
      const hasCtms = !!(process.env.CTMS_URL && process.env.CTMS_TOKEN);
      const dataSource = hasAuditKeys && hasCtms ? 'live'
                       : hasAuditKeys || hasCtms ? 'mixed'
                       : 'mock';
      return {
        totalEvents30d:    events.length,
        criticalEvents30d: anomalies.filter((e) => e.anomalySeverity === 'error').length,
        afterHoursActions: anomalies.filter((e) => /OFF_HOURS|WEEKEND/.test(e.anomalyId)).length,
        failedActions:     events.filter((e) => e.outcome === 'failure').length,
        activeSubaccounts: new Set(events.map((e) => e.subaccountId)).size,
        uniqueActors:      new Set(events.map((e) => e.actor).filter(Boolean)).size,
        dataSource,
        lastSyncAt:        new Date().toISOString(),
      };
    });

    return super.init();
  }
}

function enrichWithAnomalies(events, rules) {
  return events.map((e) => ({ ...e, ...applyAnomalyRules(e, rules) }));
}

async function seedAnomalyRules() {
  const seedFile = path.join(__dirname, '..', 'db', 'seed', 'anomalyRules.json');
  if (!fs.existsSync(seedFile)) return;
  const seeds = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  for (const r of seeds) {
    const existing = await cds.db.run(
      SELECT.one.from('com.btpconsulting.auditlog.AnomalyRule').where({ id: r.id })
    );
    if (!existing) {
      await cds.db.run(INSERT.into('com.btpconsulting.auditlog.AnomalyRule').entries(r));
    }
  }
}

module.exports = AuditService;
module.exports.__test__ = { isoDaysAgo, inWindow, applyAnomalyRules, enrichWithAnomalies };

// ─── Mock data ───────────────────────────────────────────────────────────────
function mockEvents(_days, subaccountFilter) {
  const all = [
    { timestamp: new Date(Date.now() -   1 * 3600_000).toISOString(), subaccountId: 'sub-001', subaccountName: 'Production', actor: 'alice@acme.com',  action: 'role-collection.assign',  resourceType: 'role-collection', resourceId: 'BTP Cockpit Admin',  sourceIp: '10.0.0.5',  outcome: 'success' },
    { timestamp: new Date(Date.now() -   3 * 3600_000).toISOString(), subaccountId: 'sub-001', subaccountName: 'Production', actor: 'svc-deploy-bot', action: 'mta.deploy',              resourceType: 'application',     resourceId: 'order-srv',          sourceIp: '10.0.0.6',  outcome: 'success' },
    { timestamp: new Date(Date.now() -  18 * 3600_000).toISOString(), subaccountId: 'sub-001', subaccountName: 'Production', actor: 'erin@acme.com',   action: 'destination.update',      resourceType: 'destination',     resourceId: 's4-prod',            sourceIp: '212.13.4.9', outcome: 'success' },
    { timestamp: new Date(Date.now() -  26 * 3600_000).toISOString(), subaccountId: 'sub-002', subaccountName: 'QA',         actor: 'bob@acme.com',    action: 'service-instance.create', resourceType: 'service',         resourceId: 'hana-cloud-qa',      sourceIp: '10.0.0.7',  outcome: 'success' },
    { timestamp: new Date(Date.now() -  50 * 3600_000).toISOString(), subaccountId: 'sub-003', subaccountName: 'Dev',        actor: 'carol@acme.com',  action: 'destination.update',      resourceType: 'destination',     resourceId: 's4-prod',            sourceIp: '10.0.0.8',  outcome: 'failure' },
    // Weekend admin grant — should trigger ADMIN_GRANT_OFF_HOURS
    { timestamp: weekendNight(),                                       subaccountId: 'sub-001', subaccountName: 'Production', actor: 'bob@acme.com',    action: 'role-collection.assign',  resourceType: 'role-collection', resourceId: 'Subaccount Administrator', sourceIp: '78.45.21.9', outcome: 'success' },
    { timestamp: new Date(Date.now() - 168 * 3600_000).toISOString(), subaccountId: 'sub-005', subaccountName: 'Sandbox',    actor: 'dave@acme.com',   action: 'subaccount.label.set',    resourceType: 'subaccount',      resourceId: 'sub-005',            sourceIp: '10.0.0.9',  outcome: 'success' },
    { timestamp: new Date(Date.now() -  72 * 3600_000).toISOString(), subaccountId: 'sub-002', subaccountName: 'QA',         actor: 'svc-deploy-bot', action: 'mta.deploy',              resourceType: 'application',     resourceId: 'crm-srv',            sourceIp: '10.0.0.6',  outcome: 'success' },
    { timestamp: new Date(Date.now() - 100 * 3600_000).toISOString(), subaccountId: 'sub-003', subaccountName: 'Dev',        actor: 'carol@acme.com',  action: 'user.create',             resourceType: 'user',            resourceId: 'newhire@acme.com',   sourceIp: '10.0.0.8',  outcome: 'success' },
    { timestamp: new Date(Date.now() - 200 * 3600_000).toISOString(), subaccountId: 'sub-001', subaccountName: 'Production', actor: 'trust-admin',     action: 'trust.update',            resourceType: 'trust-configuration', resourceId: 'IAS-Trust',      sourceIp: '10.0.0.5',  outcome: 'success' },
  ];
  return subaccountFilter ? all.filter((e) => e.subaccountId === subaccountFilter) : all;
}

function weekendNight() {
  const d = new Date();
  // Wind back to last Saturday at 02:14 local
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  d.setHours(2, 14, 0, 0);
  return d.toISOString();
}
