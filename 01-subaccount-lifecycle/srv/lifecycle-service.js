'use strict';

const cds    = require('@sap/cds');
const crypto = require('crypto');

const sa  = require('./lib/subaccount-clients');
const cis = require('./lib/cis-client');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isoToday() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function fingerprint(parts) {
  return crypto.createHash('sha256').update(parts.join('||')).digest('hex').slice(0, 24);
}

function inferTier(saKey, sub) {
  if (saKey?.tier) return saKey.tier;
  const labels = sub?.labels || {};
  const get = (k) => Array.isArray(labels[k]) ? labels[k][0] : labels[k];
  const t = (get('tier') || get('environment-tier') || get('landscape')) || '';
  if (t) return t.toLowerCase();
  const n = (sub?.displayName || saKey?.subaccountName || '').toLowerCase();
  if (n.includes('prod')) return 'prod';
  if (n.includes('qa') || n.includes('test')) return 'qa';
  if (n.includes('dev') || n.includes('sandbox')) return 'dev';
  return 'unknown';
}

function envFor(envs) {
  if (envs?.includes('cloudfoundry')) return 'CF';
  if (envs?.includes('kyma'))         return 'Kyma';
  return envs?.[0] || 'Other';
}

// ─── Aggregate audit events per-subaccount ────────────────────────────────────
async function collectLastActivity(saKeys) {
  const lastActivity = {};
  await Promise.all(saKeys.map(async (k) => {
    if (!k.auditLog) return;
    try {
      const events = await sa.getAuditEvents(k, `${isoDaysAgo(90)}T00:00:00.000Z`);
      let latest = '';
      for (const r of events) {
        const ts = r.time || r.recordedAt;
        if (ts && ts > latest) latest = ts;
      }
      if (latest) lastActivity[k.subaccountId] = latest;
    } catch (e) {
      cds.log('lifecycle-service').warn(`Audit skip ${k.subaccountName}: ${e.message}`);
    }
  }));
  return lastActivity;
}

// ─── Per-subaccount enrichment counts ─────────────────────────────────────────
//
// For each subaccount key we collect three independent integers:
//   services       — service instances visible via Service Manager
//   rcs            — role collections in the subaccount XSUAA tenant
//   activeUsers    — distinct users assigned to at least one RC in this
//                    subaccount (cross-RC dedup by email)
//
// The activeUsers count replicates app #5's enumeration rather than calling
// it over OData — each app stays independent (no cross-app trust setup),
// matching the existing pattern in srv/score-service.js for app #3.
async function collectCounts(saKeys) {
  const counts = {};
  await Promise.all(saKeys.map(async (k) => {
    counts[k.subaccountId] = { services: 0, rcs: 0, activeUsers: 0 };
    if (k.serviceManager) {
      try {
        const items = await sa.getServiceInstances(k);
        counts[k.subaccountId].services = items.length;
      } catch (e) {
        cds.log('lifecycle-service').warn(`SM skip ${k.subaccountName}: ${e.message}`);
      }
    }
    if (k.xsuaa) {
      try {
        const rcs = await sa.getRoleCollections(k);
        counts[k.subaccountId].rcs = rcs.length;
        counts[k.subaccountId].activeUsers = await uniqueUserCount(k, rcs);
      } catch (e) {
        cds.log('lifecycle-service').warn(`RC skip ${k.subaccountName}: ${e.message}`);
      }
    }
  }));
  return counts;
}

// Walk every RC, fetch its users, dedup by email. Per-RC failures are
// logged and skipped so one broken RC doesn't zero out the whole count.
async function uniqueUserCount(k, rcs) {
  const seen = new Set();
  await Promise.all(rcs.map(async (rc) => {
    const rcName = rc.name || rc.roleCollectionName;
    if (!rcName) return;
    try {
      const users = await sa.getRoleCollectionUsers(k, rcName);
      for (const u of users) {
        const email = (u.email || u.userId || u.user || '').toLowerCase();
        if (email) seen.add(email);
      }
    } catch (e) {
      cds.log('lifecycle-service').warn(`Users skip ${k.subaccountName}/${rcName}: ${e.message}`);
    }
  }));
  return seen.size;
}

// ─── Service Implementation ───────────────────────────────────────────────────
class LifecycleService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('lifecycle-service');
    const cisCreds = cis.getCisCredentials();
    if (!cisCreds) LOG.warn('No CIS credentials — running in mock mode for inventory.');

    // ── getSubaccounts ───────────────────────────────────────────────────────
    this.on('getSubaccounts', async () => {
      if (!cisCreds) return mockSubaccounts();

      const [accounts, saKeys] = await Promise.all([
        cis.listSubaccounts(cisCreds),
        Promise.resolve(sa.loadKeys()),
      ]);

      const [lastActivity, counts] = await Promise.all([
        collectLastActivity(saKeys),
        collectCounts(saKeys),
      ]);

      const keysByGuid = {};
      for (const k of saKeys) keysByGuid[k.subaccountId] = k;

      return accounts.map((subRow) => {
        const labels  = subRow.labels || {};
        const getLbl  = (k) => Array.isArray(labels[k]) ? labels[k][0] : labels[k];
        const k       = keysByGuid[subRow.guid] || null;
        const tier    = inferTier(k, subRow);
        const last    = lastActivity[subRow.guid];
        const days    = last
          ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000)
          : null;
        const c       = counts[subRow.guid] || { services: 0, rcs: 0, activeUsers: 0 };

        return {
          subaccountId:        subRow.guid,
          displayName:         subRow.displayName || subRow.guid,
          state:               subRow.state || 'UNKNOWN',
          region:              subRow.region || '',
          environment:         envFor(subRow.enabledEnvironments),
          tier,
          parentName:          subRow.parentDisplayName || subRow.parentGuid || '',
          costCenter:          getLbl('costCenter') || getLbl('cost-center') || '',
          department:          getLbl('department') || getLbl('dept') || '',
          createdAt:           subRow.createdDate ? new Date(subRow.createdDate).toISOString().slice(0, 10) : '',
          lastActivityAt:      last ? new Date(last).toISOString().slice(0, 10) : '',
          daysInactive:        days,
          usedForProd:         subRow.usedForProduction || 'UNSET',
          serviceInstanceCount: c.services,
          roleCollectionCount:  c.rcs,
          activeUserCount:     c.activeUsers,
        };
      });
    });

    // ── getDrift ─────────────────────────────────────────────────────────────
    this.on('getDrift', async (req) => {
      const tierFilter = req.data?.tier || null;
      const subs       = await this.send('getSubaccounts');
      const saKeys     = sa.loadKeys();
      const keysByGuid = {};
      for (const k of saKeys) keysByGuid[k.subaccountId] = k;

      const baselines = await cds.db.run(
        SELECT.from('com.btpconsulting.subaccountlifecycle.DriftBaseline')
      );
      const ignores = await cds.db.run(
        SELECT.from('com.btpconsulting.subaccountlifecycle.IgnoreRule')
      );

      const today = isoToday();
      const ignoreByFp = {};
      for (const r of ignores) {
        if (r.expiresAt && r.expiresAt < today) continue;
        ignoreByFp[r.fingerprint] = r;
      }

      const baselineByKey = {};
      for (const b of baselines) {
        baselineByKey[`${b.tier}||${b.resourceType}`] = b;
      }

      const findings = [];
      for (const subRow of subs) {
        if (tierFilter && subRow.tier !== tierFilter) continue;
        const k = keysByGuid[subRow.subaccountId];

        // ── LABEL drift ─────────────────────────────────────────────────────
        const labelBase = baselineByKey[`${subRow.tier}||label`];
        if (labelBase) {
          let expected;
          try { expected = JSON.parse(labelBase.expectedJson || '{}'); }
          catch { expected = {}; }
          for (const lbl of expected.requiredLabels || []) {
            const present = (lbl === 'costCenter' && subRow.costCenter)
                         || (lbl === 'department' && subRow.department);
            if (!present) {
              const fp = fingerprint([subRow.subaccountId, 'label', lbl]);
              findings.push({
                fingerprint:  fp,
                subaccountId: subRow.subaccountId,
                tier:         subRow.tier,
                resourceType: 'label',
                severity:     'warn',
                summary:      `Required label "${lbl}" missing on ${subRow.displayName}`,
                detail:       JSON.stringify({ missingLabel: lbl }),
                ignored:      !!ignoreByFp[fp],
                ignoreReason: ignoreByFp[fp]?.reason || '',
              });
            }
          }
        }

        // ── SERVICE-INSTANCE drift ──────────────────────────────────────────
        const svcBase = baselineByKey[`${subRow.tier}||service-instance`];
        if (svcBase && k?.serviceManager) {
          let expected;
          try { expected = JSON.parse(svcBase.expectedJson || '{}'); }
          catch { expected = {}; }
          const required = expected.requiredServices || []; // array of "<offering>:<plan>"
          try {
            const items = await sa.getServiceInstances(k);
            const observed = new Set(items.map((s) => `${s.service_offering_name || s.offering}:${s.service_plan_name || s.plan}`));
            for (const need of required) {
              if (!observed.has(need)) {
                const fp = fingerprint([subRow.subaccountId, 'service-instance', need]);
                findings.push({
                  fingerprint:  fp,
                  subaccountId: subRow.subaccountId,
                  tier:         subRow.tier,
                  resourceType: 'service-instance',
                  severity:     'error',
                  summary:      `Required service "${need}" not found in ${subRow.displayName}`,
                  detail:       JSON.stringify({ requiredService: need, observed: [...observed] }),
                  ignored:      !!ignoreByFp[fp],
                  ignoreReason: ignoreByFp[fp]?.reason || '',
                });
              }
            }
          } catch (e) {
            LOG.warn(`Service-instance drift skip ${subRow.displayName}: ${e.message}`);
          }
        }

        // ── ROLE-COLLECTION drift ───────────────────────────────────────────
        const rcBase = baselineByKey[`${subRow.tier}||role-collection`];
        if (rcBase && k?.xsuaa) {
          let expected;
          try { expected = JSON.parse(rcBase.expectedJson || '{}'); }
          catch { expected = {}; }
          const required = expected.requiredRoleCollections || [];
          try {
            const rcs = await sa.getRoleCollections(k);
            const observed = new Set(rcs.map((r) => r.name || r.roleCollectionName));
            for (const need of required) {
              if (!observed.has(need)) {
                const fp = fingerprint([subRow.subaccountId, 'role-collection', need]);
                findings.push({
                  fingerprint:  fp,
                  subaccountId: subRow.subaccountId,
                  tier:         subRow.tier,
                  resourceType: 'role-collection',
                  severity:     'warn',
                  summary:      `Required role collection "${need}" missing in ${subRow.displayName}`,
                  detail:       JSON.stringify({ requiredRC: need }),
                  ignored:      !!ignoreByFp[fp],
                  ignoreReason: ignoreByFp[fp]?.reason || '',
                });
              }
            }
          } catch (e) {
            LOG.warn(`RC drift skip ${subRow.displayName}: ${e.message}`);
          }
        }
      }
      return findings;
    });

    // ── getAuditActivity ─────────────────────────────────────────────────────
    this.on('getAuditActivity', async (req) => {
      const days         = Math.min(Math.max(req.data.days || 30, 1), 90);
      const subaccountId = req.data.subaccountId;
      const saKeys       = sa.loadKeys();
      const fromIso      = `${isoDaysAgo(days)}T00:00:00.000Z`;

      const targets = subaccountId
        ? saKeys.filter((k) => k.subaccountId === subaccountId)
        : saKeys.filter((k) => k.auditLog);

      if (targets.length === 0) return mockAuditEntries(subaccountId, days);

      const all = [];
      await Promise.all(targets.map(async (k) => {
        try {
          const events = await sa.getAuditEvents(k, fromIso);
          for (const r of events) {
            all.push({
              timestamp:    r.time || r.recordedAt || '',
              subaccountId: k.subaccountId,
              actor:        r.user || r.actor || '',
              action:       r.action || r.message || '',
              resourceType: r.object?.type || r.objectType || '',
              resourceId:   r.object?.id || r.objectId || '',
              sourceIp:     r.ipAddress || r.source_ip || '',
              outcome:      r.status === 'success' || r.outcome === 'success' ? 'success' : 'failure',
            });
          }
        } catch (e) {
          LOG.warn(`Audit skip ${k.subaccountName}: ${e.message}`);
        }
      }));

      return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });

    // ── getSummary ───────────────────────────────────────────────────────────
    this.on('getSummary', async () => {
      const subs  = await this.send('getSubaccounts');
      const drift = await this.send('getDrift', { tier: null });
      const open  = drift.filter((d) => !d.ignored);

      const audit30d = await this.send('getAuditActivity', { subaccountId: null, days: 30 });

      const hasCis  = !!cisCreds;
      const hasKeys = sa.loadKeys().length > 0;
      const dataSource = hasCis && hasKeys ? 'live'
                       : hasCis || hasKeys ? 'mixed'
                       : 'mock';

      return {
        totalSubaccounts:    subs.length,
        activeSubaccounts:   subs.filter((s) => s.state === 'STARTED' && (s.daysInactive ?? 0) < 30).length,
        inactiveSubaccounts: subs.filter((s) => s.state === 'STARTED' && (s.daysInactive ?? 0) >= 90).length,
        stoppedSubaccounts:  subs.filter((s) => s.state === 'STOPPED').length,
        driftFindings:       open.length,
        criticalDrifts:      open.filter((d) => d.severity === 'error').length,
        auditEvents30d:      audit30d.length,
        dataSource,
        lastSyncAt:          new Date().toISOString(),
      };
    });

    return super.init();
  }
}

module.exports = LifecycleService;
module.exports.__test__ = { isoToday, isoDaysAgo, fingerprint, inferTier, envFor, collectLastActivity, collectCounts, uniqueUserCount };

// ─── Mock Data ────────────────────────────────────────────────────────────────
function mockSubaccounts() {
  return [
    { subaccountId: 'sub-001', displayName: 'Production',  state: 'STARTED', region: 'eu10', environment: 'CF',   tier: 'prod', parentName: 'Global Account', costCenter: 'CC-1001', department: 'IT Operations', createdAt: '2023-01-15', lastActivityAt: isoDaysAgo(0),   daysInactive: 0,    usedForProd: 'USED_FOR_PRODUCTION',     serviceInstanceCount: 18, roleCollectionCount: 12, activeUserCount: 24 },
    { subaccountId: 'sub-002', displayName: 'QA',          state: 'STARTED', region: 'eu10', environment: 'CF',   tier: 'qa',   parentName: 'Global Account', costCenter: 'CC-1002', department: 'Software Eng',  createdAt: '2023-02-01', lastActivityAt: isoDaysAgo(2),   daysInactive: 2,    usedForProd: 'NOT_USED_FOR_PRODUCTION', serviceInstanceCount: 14, roleCollectionCount: 10, activeUserCount: 18 },
    { subaccountId: 'sub-003', displayName: 'Dev',         state: 'STARTED', region: 'eu10', environment: 'CF',   tier: 'dev',  parentName: 'Global Account', costCenter: 'CC-1002', department: 'Software Eng',  createdAt: '2023-02-01', lastActivityAt: isoDaysAgo(0),   daysInactive: 0,    usedForProd: 'NOT_USED_FOR_PRODUCTION', serviceInstanceCount: 22, roleCollectionCount: 14, activeUserCount: 22 },
    { subaccountId: 'sub-004', displayName: 'Integration', state: 'STARTED', region: 'eu10', environment: 'Kyma', tier: 'prod', parentName: 'Global Account', costCenter: 'CC-1004', department: 'Architecture',  createdAt: '2023-04-01', lastActivityAt: isoDaysAgo(5),   daysInactive: 5,    usedForProd: 'USED_FOR_PRODUCTION',     serviceInstanceCount: 9,  roleCollectionCount: 7,  activeUserCount: 6  },
    { subaccountId: 'sub-005', displayName: 'Sandbox',     state: 'STARTED', region: 'eu10', environment: 'CF',   tier: 'dev',  parentName: 'Global Account', costCenter: '',        department: '',              createdAt: '2024-01-01', lastActivityAt: isoDaysAgo(120), daysInactive: 120,  usedForProd: 'NOT_USED_FOR_PRODUCTION', serviceInstanceCount: 3,  roleCollectionCount: 2,  activeUserCount: 2  },
    { subaccountId: 'sub-006', displayName: 'QA-Old',      state: 'STOPPED', region: 'eu10', environment: 'CF',   tier: 'qa',   parentName: 'Global Account', costCenter: 'CC-1002', department: 'Software Eng',  createdAt: '2022-11-01', lastActivityAt: isoDaysAgo(200), daysInactive: 200,  usedForProd: 'NOT_USED_FOR_PRODUCTION', serviceInstanceCount: 0,  roleCollectionCount: 5,  activeUserCount: 0  },
  ];
}

function mockAuditEntries(subaccountId, _days) {
  const all = [
    { timestamp: new Date(Date.now() -    3600_000).toISOString(), subaccountId: 'sub-001', actor: 'alice@acme.com',   action: 'role-collection.assign',  resourceType: 'role-collection', resourceId: 'BTP Cockpit Admin', sourceIp: '10.0.0.5',  outcome: 'success' },
    { timestamp: new Date(Date.now() -   86400_000).toISOString(), subaccountId: 'sub-001', actor: 'svc-deploy-bot',   action: 'mta.deploy',              resourceType: 'application',     resourceId: 'order-srv',         sourceIp: '10.0.0.6',  outcome: 'success' },
    { timestamp: new Date(Date.now() -  172800_000).toISOString(), subaccountId: 'sub-002', actor: 'bob@acme.com',     action: 'service-instance.create', resourceType: 'service',         resourceId: 'hana-cloud-qa',     sourceIp: '10.0.0.7',  outcome: 'success' },
    { timestamp: new Date(Date.now() -  259200_000).toISOString(), subaccountId: 'sub-003', actor: 'carol@acme.com',   action: 'destination.update',      resourceType: 'destination',     resourceId: 's4-prod',           sourceIp: '10.0.0.8',  outcome: 'failure' },
    { timestamp: new Date(Date.now() - 1209600_000).toISOString(), subaccountId: 'sub-005', actor: 'dave@acme.com',    action: 'subaccount.label.set',    resourceType: 'subaccount',      resourceId: 'sub-005',           sourceIp: '10.0.0.9',  outcome: 'success' },
  ];
  return subaccountId ? all.filter((e) => e.subaccountId === subaccountId) : all;
}
