'use strict';

const cds  = require('@sap/cds');
const fs   = require('fs');
const path = require('path');

const sa  = require('./lib/subaccount-clients');
const cis = require('./lib/cis-client');

// ─── Tier inference ───────────────────────────────────────────────────────────
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

// ─── Load full assignment graph ──────────────────────────────────────────────
//
// Walks every SUBACCOUNT_KEYS entry, lists its role-collections, then for each
// RC fetches its users. Returns flat array of { subaccount, rc, user }.
async function loadAssignments(saKeys, subsByGuid) {
  const out = [];
  for (const k of saKeys) {
    if (!k.xsuaa) continue;
    const tier = inferTier(k, subsByGuid[k.subaccountId]);
    let rcs;
    try { rcs = await sa.getRoleCollections(k); }
    catch (e) {
      cds.log('role-service').warn(`Skipping ${k.subaccountName} RCs: ${e.message}`);
      continue;
    }
    for (const rc of rcs) {
      const rcName = rc.name || rc.roleCollectionName;
      let users;
      try { users = await sa.getRoleCollectionUsers(k, rcName); }
      catch (e) {
        cds.log('role-service').warn(`Skipping users for RC ${rcName} in ${k.subaccountName}: ${e.message}`);
        continue;
      }
      for (const u of users) {
        out.push({
          subaccountId:   k.subaccountId,
          subaccountName: k.subaccountName,
          tier,
          rcName,
          rcDescription: rc.description || '',
          email:          (u.email || u.userId || u.user || '').toLowerCase(),
          displayName:    u.name || u.displayName || u.userId || '',
          origin:         u.origin || u.identityProvider || 'uaa',
        });
      }
    }
  }
  return out;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class RoleService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('role-service');
    await seedPolicies();

    this.on('getRoleCollections', async () => {
      const saKeys = sa.loadKeys();
      const cisCreds = cis.getCisCredentials();
      const subs = cisCreds ? await cis.listSubaccounts(cisCreds) : [];
      const byGuid = {}; for (const s of subs) byGuid[s.guid] = s;

      if (saKeys.length === 0) return mockAssignments().map((a) => ({
        subaccountId: a.subaccountId, subaccountName: a.subaccountName, tier: a.tier,
        rcName: a.rcName, rcDescription: a.rcDescription || ''
      })).filter((v, i, arr) =>
        arr.findIndex((x) => x.subaccountId === v.subaccountId && x.rcName === v.rcName) === i
      );

      const out = [];
      for (const k of saKeys) {
        const tier = inferTier(k, byGuid[k.subaccountId]);
        try {
          const rcs = await sa.getRoleCollections(k);
          for (const rc of rcs) {
            out.push({
              subaccountId: k.subaccountId,
              subaccountName: k.subaccountName,
              tier,
              rcName: rc.name || rc.roleCollectionName,
              rcDescription: rc.description || '',
            });
          }
        } catch (e) {
          LOG.warn(`Skipping ${k.subaccountName}: ${e.message}`);
        }
      }
      return out;
    });

    this.on('getUserMap', async () => {
      const saKeys = sa.loadKeys();
      const cisCreds = cis.getCisCredentials();
      const subs = cisCreds ? await cis.listSubaccounts(cisCreds) : [];
      const byGuid = {}; for (const s of subs) byGuid[s.guid] = s;

      const flat = saKeys.length === 0 ? mockAssignments() : await loadAssignments(saKeys, byGuid);

      // Group by email
      const byUser = {};
      for (const a of flat) {
        if (!a.email) continue;
        if (!byUser[a.email]) {
          byUser[a.email] = { email: a.email, displayName: a.displayName, origin: a.origin, assignments: [] };
        }
        byUser[a.email].assignments.push({
          subaccountId: a.subaccountId, subaccountName: a.subaccountName,
          tier: a.tier, rcName: a.rcName, rcDescription: a.rcDescription,
        });
      }

      return Object.values(byUser).map((u) => ({
        email: u.email,
        displayName: u.displayName || u.email,
        origin: u.origin,
        assignmentCount: u.assignments.length,
        subaccountCount: new Set(u.assignments.map((a) => a.subaccountId)).size,
        assignments: u.assignments,
      })).sort((a, b) => b.assignmentCount - a.assignmentCount);
    });

    this.on('getToxicFindings', async () => {
      const [users, policies, ignores] = await Promise.all([
        this.send('getUserMap'),
        cds.db.run(SELECT.from('com.btpconsulting.rolecollectionmap.ToxicComboPolicy').where({ enabled: true })),
        cds.db.run(SELECT.from('com.btpconsulting.rolecollectionmap.IgnoreRule')),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      const ignoreSet = new Map();
      for (const r of ignores) {
        if (r.expiresAt && r.expiresAt < today) continue;
        ignoreSet.set(`${r.policyId}||${r.userEmail}`, r.reason || '');
      }

      const findings = [];
      for (const u of users) {
        for (const p of policies) {
          const aMatches = u.assignments.filter((a) =>
            a.rcName === p.rcA && (p.tierA === '*' || a.tier === p.tierA));
          const bMatches = u.assignments.filter((a) =>
            a.rcName === p.rcB && (p.tierB === '*' || a.tier === p.tierB));
          if (!aMatches.length || !bMatches.length) continue;
          // For self-match policies (rcA === rcB), require different subaccounts.
          for (const aHit of aMatches) {
            for (const bHit of bMatches) {
              if (aHit.subaccountId === bHit.subaccountId && p.rcA === p.rcB) continue;
              const k = `${p.id}||${u.email}`;
              findings.push({
                policyId:      p.id,
                severity:      p.severity,
                email:         u.email,
                displayName:   u.displayName,
                rcA:           p.rcA,
                tierA:         aHit.tier,
                subaccountAId: aHit.subaccountId,
                rcB:           p.rcB,
                tierB:         bHit.tier,
                subaccountBId: bHit.subaccountId,
                summary:       `${u.email} holds "${p.rcA}" in ${aHit.subaccountName} (${aHit.tier}) AND "${p.rcB}" in ${bHit.subaccountName} (${bHit.tier})`,
                ignored:       ignoreSet.has(k),
                ignoreReason:  ignoreSet.get(k) || '',
              });
              // Avoid combinatorial explosion when a user holds the RC
              // many times: report once per (policy, user).
              break;
            }
            if (findings.length && findings[findings.length-1].policyId === p.id &&
                findings[findings.length-1].email === u.email) break;
          }
        }
      }
      return findings;
    });

    this.on('getSummary', async () => {
      const [users, rcs, findings] = await Promise.all([
        this.send('getUserMap'),
        this.send('getRoleCollections'),
        this.send('getToxicFindings'),
      ]);
      const open = findings.filter((f) => !f.ignored);
      const crossTier = users.filter((u) => new Set(u.assignments.map((a) => a.tier)).size > 1).length;
      return {
        totalUsers:           users.length,
        totalAssignments:     users.reduce((s, u) => s + u.assignmentCount, 0),
        totalRoleCollections: new Set(rcs.map((r) => r.rcName)).size,
        crossTierUsers:       crossTier,
        toxicFindings:        open.length,
        criticalFindings:     open.filter((f) => f.severity === 'error').length,
      };
    });

    return super.init();
  }
}

async function seedPolicies() {
  const seedFile = path.join(__dirname, '..', 'db', 'seed', 'policies.json');
  if (!fs.existsSync(seedFile)) return;
  const seeds = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  for (const p of seeds) {
    const existing = await cds.db.run(
      SELECT.one.from('com.btpconsulting.rolecollectionmap.ToxicComboPolicy').where({ id: p.id })
    );
    if (!existing) {
      await cds.db.run(INSERT.into('com.btpconsulting.rolecollectionmap.ToxicComboPolicy').entries(p));
    }
  }
}

module.exports = RoleService;
module.exports.__test__ = { inferTier, loadAssignments };

// ─── Mock Data ────────────────────────────────────────────────────────────────
function mockAssignments() {
  // Simulates a global account with prod/qa/dev subaccounts and a couple of
  // toxic combos for the demo.
  return [
    // alice — admin in PROD only (clean)
    { subaccountId: 'sub-001', subaccountName: 'Production',  tier: 'prod', rcName: 'Subaccount Administrator',           rcDescription: 'Full admin', email: 'alice@acme.com',   displayName: 'Alice Andersen',  origin: 'ias' },
    // bob — admin in PROD AND DEV (toxic combo!)
    { subaccountId: 'sub-001', subaccountName: 'Production',  tier: 'prod', rcName: 'Subaccount Administrator',           rcDescription: 'Full admin', email: 'bob@acme.com',     displayName: 'Bob Beck',        origin: 'ias' },
    { subaccountId: 'sub-003', subaccountName: 'Dev',         tier: 'dev',  rcName: 'Subaccount Administrator',           rcDescription: 'Full admin', email: 'bob@acme.com',     displayName: 'Bob Beck',        origin: 'ias' },
    // carol — auditor in PROD AND admin in QA (also toxic if ADMIN_AND_AUDITOR enabled)
    { subaccountId: 'sub-001', subaccountName: 'Production',  tier: 'prod', rcName: 'Audit Log Auditor',                  rcDescription: 'Audit',      email: 'carol@acme.com',   displayName: 'Carol Christensen', origin: 'ias' },
    { subaccountId: 'sub-002', subaccountName: 'QA',          tier: 'qa',   rcName: 'Subaccount Administrator',           rcDescription: 'Full admin', email: 'carol@acme.com',   displayName: 'Carol Christensen', origin: 'ias' },
    // dave — deployer in prod and dev (warning, not error)
    { subaccountId: 'sub-001', subaccountName: 'Production',  tier: 'prod', rcName: 'Cloud Foundry Space Developer',      rcDescription: 'Deploy',     email: 'dave@acme.com',    displayName: 'Dave Dam',        origin: 'ias' },
    { subaccountId: 'sub-003', subaccountName: 'Dev',         tier: 'dev',  rcName: 'Cloud Foundry Space Developer',      rcDescription: 'Deploy',     email: 'dave@acme.com',    displayName: 'Dave Dam',        origin: 'ias' },
    // erin — viewer everywhere (clean)
    { subaccountId: 'sub-001', subaccountName: 'Production',  tier: 'prod', rcName: 'BTP Subaccount Lifecycle Viewer',    rcDescription: 'Viewer',     email: 'erin@acme.com',    displayName: 'Erin Eriksen',    origin: 'ias' },
    { subaccountId: 'sub-002', subaccountName: 'QA',          tier: 'qa',   rcName: 'BTP Subaccount Lifecycle Viewer',    rcDescription: 'Viewer',     email: 'erin@acme.com',    displayName: 'Erin Eriksen',    origin: 'ias' },
    { subaccountId: 'sub-003', subaccountName: 'Dev',         tier: 'dev',  rcName: 'BTP Subaccount Lifecycle Viewer',    rcDescription: 'Viewer',     email: 'erin@acme.com',    displayName: 'Erin Eriksen',    origin: 'ias' },
  ];
}
