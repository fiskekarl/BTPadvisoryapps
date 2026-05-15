'use strict';

const path = require('path');
const { expect } = require('chai');

// Force mock-mode: loadKeys() returns [] when neither SUBACCOUNT_KEYS nor
// VCAP_SERVICES are set, which triggers the mockAssignments() fallback inside
// the service handlers.
delete process.env.CIS_CREDENTIALS;
delete process.env.SUBACCOUNT_KEYS;
delete process.env.VCAP_SERVICES;

const cds = require('@sap/cds/lib');
const { GET } = cds.test(path.join(__dirname, '..', '..'));

describe('RoleService (integration)', () => {

  it('seeds the canonical toxic-combo policies on init', async () => {
    const { data } = await GET('/odata/v4/role/ToxicComboPolicies');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    const ids = data.value.map((p) => p.id);
    expect(ids).to.include('PROD_DEV_COCKPIT_ADMIN');
    expect(ids).to.include('ADMIN_AND_AUDITOR');
  });

  it('getRoleCollections() returns distinct (subaccount, RC) rows in mock-mode', async () => {
    const { data } = await GET('/odata/v4/role/getRoleCollections()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    // Each entry has the expected RcAssignment shape.
    expect(data.value[0]).to.include.keys('subaccountId', 'subaccountName', 'tier', 'rcName');
    // Distinct (subaccount, rc) — no duplicates.
    const keys = data.value.map((r) => `${r.subaccountId}||${r.rcName}`);
    expect(new Set(keys).size).to.equal(keys.length);
  });

  it('getUserMap() aggregates assignments by email', async () => {
    const { data } = await GET('/odata/v4/role/getUserMap()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    const u = data.value[0];
    expect(u).to.include.keys('email', 'assignmentCount', 'subaccountCount', 'assignments');
    expect(u.assignmentCount).to.equal(u.assignments.length);
    // Sorted by assignmentCount descending.
    for (let i = 1; i < data.value.length; i++) {
      expect(data.value[i - 1].assignmentCount).to.be.at.least(data.value[i].assignmentCount);
    }
  });

  it('getToxicFindings() flags users matching the seeded policies', async () => {
    const { data } = await GET('/odata/v4/role/getToxicFindings()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    // mockAssignments has bob in prod+dev as Subaccount Administrator — that
    // matches PROD_DEV_COCKPIT_ADMIN.
    const bobFinding = data.value.find((f) => f.email === 'bob@acme.com' && f.policyId === 'PROD_DEV_COCKPIT_ADMIN');
    expect(bobFinding).to.exist;
    expect(bobFinding.severity).to.equal('error');
    // carol is both auditor and admin — ADMIN_AND_AUDITOR finding.
    const carolFinding = data.value.find((f) => f.email === 'carol@acme.com' && f.policyId === 'ADMIN_AND_AUDITOR');
    expect(carolFinding).to.exist;
  });

  it('getSummary() returns the RoleSummary shape', async () => {
    const { data } = await GET('/odata/v4/role/getSummary()');
    expect(data).to.include.keys(
      'totalUsers', 'totalAssignments', 'totalRoleCollections',
      'crossTierUsers', 'toxicFindings', 'criticalFindings'
    );
    expect(data.totalUsers).to.be.greaterThan(0);
    expect(data.totalAssignments).to.be.greaterThan(0);
    expect(data.criticalFindings).to.be.at.least(1); // bob + carol scenarios
  });

  it('IgnoreRules entity is queryable (empty by default)', async () => {
    const { data } = await GET('/odata/v4/role/IgnoreRules');
    expect(data.value).to.be.an('array');
  });
});
