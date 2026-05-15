'use strict';

const cds  = require('@sap/cds');
const fs   = require('fs');
const path = require('path');

const sa  = require('./lib/subaccount-clients');
const cis = require('./lib/cis-client');

const { evaluators } = require('./rules/registry');

// ─── Inventory loaders ────────────────────────────────────────────────────────
//
// The scorecard now reads the *same* upstream APIs as apps #1 (CIS Accounts)
// and #2 (per-subaccount Destination Service). It does NOT call sister apps
// over OData — keeps each app independent and avoids cross-app trust setup.
//
// When CIS_CREDENTIALS / SUBACCOUNT_KEYS are unset, the app falls back to
// rich mock data so the demo runs end-to-end on a laptop.

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

async function loadSubaccounts() {
  const cisCreds = cis.getCisCredentials();
  if (!cisCreds) return mockSubaccounts();

  const [accounts, saKeys] = await Promise.all([
    cis.listSubaccounts(cisCreds),
    Promise.resolve(sa.loadKeys()),
  ]);
  const keyByGuid = {};
  for (const k of saKeys) keyByGuid[k.subaccountId] = k;

  return accounts.map((s) => {
    const labels = s.labels || {};
    const get = (k) => Array.isArray(labels[k]) ? labels[k][0] : labels[k];
    const k = keyByGuid[s.guid];
    return {
      subaccountId: s.guid,
      displayName:  s.displayName || s.guid,
      tier:         inferTier(k, s),
      usedForProd:  s.usedForProduction || 'UNSET',
      costCenter:   get('costCenter') || get('cost-center') || '',
      department:   get('department') || get('dept') || '',
      // daysInactive is derived from audit-log activity in app #1; the
      // scorecard could call the audit-log API itself but the latency of
      // walking every subaccount audit-log is high. Defer until needed.
      daysInactive: 0,
    };
  });
}

async function loadDestinations() {
  const saKeys = sa.loadKeys();
  if (saKeys.length === 0) return mockDestinations();

  const out = [];
  for (const k of saKeys) {
    if (!k.destination) continue;
    try {
      const dests = await sa.getDestinations(k);
      const tier = inferTier(k, null);
      for (const d of dests) {
        out.push({
          subaccountId:   k.subaccountId,
          subaccountName: k.subaccountName,
          name:           d.Name,
          authentication: d.Authentication || 'NoAuthentication',
          tier,
        });
      }
    } catch (e) {
      cds.log('score-service').warn(`Destination skip ${k.subaccountName}: ${e.message}`);
    }
  }
  return out;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class ScoreService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('score-service');
    await seedRules();

    this.on('getScorecard', async () => buildScorecard(await loadAll()));

    this.on('runScan', async (req) => {
      const label = req.data?.label || `Scan ${new Date().toISOString()}`;
      const snap  = buildScorecard(await loadAll());
      const id    = require('crypto').randomUUID();
      await cds.db.run(
        INSERT.into('com.btpconsulting.compliancescorecard.ScoreSnapshot').entries({
          id,
          label,
          overallGrade:    snap.overallGrade,
          overallScore:    snap.overallScore,
          subaccountCount: snap.subaccountCount,
          ruleCount:       snap.ruleCount,
          findingsJson:    JSON.stringify(snap.findings),
        })
      );
      LOG.info(`Snapshot saved: ${label} (${id}) → ${snap.overallGrade}`);
      return id;
    });

    return super.init();
  }
}

async function loadAll() {
  const [rules, subaccounts, destinations] = await Promise.all([
    cds.db.run(SELECT.from('com.btpconsulting.compliancescorecard.Rule').where({ enabled: true })),
    loadSubaccounts(),
    loadDestinations(),
  ]);
  return { rules, subaccounts, destinations };
}

function buildScorecard({ rules, subaccounts, destinations }) {
  const findings = [];
  const subAgg   = {};
  for (const sub of subaccounts) subAgg[sub.subaccountId] = { passed: 0, failed: 0, errors: 0, warns: 0, sa: sub };

  for (const rule of rules) {
    const evaluator = evaluators[rule.kind];
    if (!evaluator) continue;
    let params; try { params = JSON.parse(rule.paramsJson || '{}'); } catch { params = {}; }
    const ruleFindings = evaluator(params, { subaccounts, destinations });
    for (const f of ruleFindings) {
      const sub = subaccounts.find((s) => s.subaccountId === f.subaccountId);
      findings.push({
        ruleId:        rule.id,
        ruleTitle:     rule.title,
        category:      rule.category,
        severity:      rule.severity,
        subaccountId:  f.subaccountId,
        subaccountName: sub?.displayName || f.subaccountId,
        passed:        f.passed,
        summary:       f.summary,
        detail:        f.detailJson || '{}',
      });
      const agg = subAgg[f.subaccountId];
      if (!agg) continue;
      if (f.passed) agg.passed++;
      else {
        agg.failed++;
        if (rule.severity === 'error') agg.errors++;
        if (rule.severity === 'warn')  agg.warns++;
      }
    }
  }

  const perSubaccount = Object.values(subAgg).map(({ sa, passed, failed, errors, warns }) => {
    const total = passed + failed;
    const score = total ? (passed / total) * 100 : 100;
    return {
      subaccountId:   sa.subaccountId,
      subaccountName: sa.displayName,
      grade:          gradeFor(score, errors),
      score:          round2(score),
      passed, failed, errorCount: errors, warnCount: warns,
    };
  });

  const totalPassed = perSubaccount.reduce((s, r) => s + r.passed, 0);
  const totalRun    = perSubaccount.reduce((s, r) => s + r.passed + r.failed, 0);
  const overallScore = totalRun ? (totalPassed / totalRun) * 100 : 100;
  const totalErrors = perSubaccount.reduce((s, r) => s + r.errorCount, 0);

  return {
    overallGrade:    gradeFor(overallScore, totalErrors),
    overallScore:    round2(overallScore),
    subaccountCount: subaccounts.length,
    ruleCount:       rules.length,
    perSubaccount,
    findings,
  };
}

function gradeFor(score, errorCount) {
  if (errorCount > 0) return score >= 90 ? 'B' : score >= 75 ? 'C' : 'D';
  if (score >= 95) return 'A';
  if (score >= 85) return 'B';
  if (score >= 70) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function round2(n) { return Math.round(n * 100) / 100; }

async function seedRules() {
  const seedFile = path.join(__dirname, '..', 'db', 'seed', 'rules.json');
  if (!fs.existsSync(seedFile)) return;
  const seeds = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  for (const r of seeds) {
    const existing = await cds.db.run(
      SELECT.one.from('com.btpconsulting.compliancescorecard.Rule').where({ id: r.id })
    );
    if (!existing) {
      await cds.db.run(INSERT.into('com.btpconsulting.compliancescorecard.Rule').entries(r));
    }
  }
}

module.exports = ScoreService;
module.exports.__test__ = { buildScorecard, gradeFor, loadAll, inferTier, round2 };

// ─── Mocks (used when CIS / SUBACCOUNT_KEYS unset) ───────────────────────────
function mockSubaccounts() {
  return [
    { subaccountId: 'sub-001', displayName: 'Production',  tier: 'prod', usedForProd: 'USED_FOR_PRODUCTION', costCenter: 'CC-1001', department: 'IT Ops',     daysInactive: 0   },
    { subaccountId: 'sub-002', displayName: 'QA',          tier: 'qa',   usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: 'CC-1002', department: 'Software', daysInactive: 2   },
    { subaccountId: 'sub-003', displayName: 'Dev',         tier: 'dev',  usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: 'CC-1002', department: 'Software', daysInactive: 0   },
    { subaccountId: 'sub-004', displayName: 'Integration', tier: 'prod', usedForProd: 'USED_FOR_PRODUCTION', costCenter: 'CC-1004', department: 'Architecture', daysInactive: 5   },
    { subaccountId: 'sub-005', displayName: 'Sandbox',     tier: 'dev',  usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: '',        department: '',         daysInactive: 120 },
  ];
}

function mockDestinations() {
  return [
    { subaccountId: 'sub-001', name: 's4-erp',     authentication: 'BasicAuthentication',         tier: 'prod' },
    { subaccountId: 'sub-001', name: 'sf-success', authentication: 'OAuth2ClientCredentials',     tier: 'prod' },
    { subaccountId: 'sub-002', name: 's4-qa',      authentication: 'BasicAuthentication',         tier: 'qa'   },
    { subaccountId: 'sub-003', name: 'mock-svc',   authentication: 'NoAuthentication',            tier: 'dev'  },
  ];
}
