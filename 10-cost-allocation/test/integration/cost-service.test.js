'use strict';

const path = require('path');
const { expect } = require('chai');

// Force mock-mode: when CIS and UAS credentials are absent the service falls
// back to mockSubs() and mockCostRows().
delete process.env.CIS_CREDENTIALS;
delete process.env.SUBACCOUNT_KEYS;
delete process.env.VCAP_SERVICES;
delete process.env.USAGE_API_CREDENTIALS;

const cds = require('@sap/cds/lib');
const { GET } = cds.test(path.join(__dirname, '..', '..'));

describe('CostService (integration)', () => {

  it('getSummary() returns cost KPIs', async () => {
    const { data } = await GET('/odata/v4/cost/getSummary()');
    expect(data).to.include.keys(
      'totalCost', 'currency', 'allocatedPct',
      'costCenters', 'businessUnits', 'departments', 'unallocatedCost',
    );
    expect(data.totalCost).to.be.a('number').and.greaterThan(0);
    expect(data.currency).to.equal('EUR');
  });

  it('getCostTree() returns hierarchical node rollups', async () => {
    const { data } = await GET('/odata/v4/cost/getCostTree()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    const types = new Set(data.value.map((n) => n.nodeType));
    // Without OrgHierarchy seeded, BU/product names default to "(Unassigned)";
    // costcenter nodes should still exist (mock subs carry labels).
    expect(types.has('costcenter')).to.equal(true);
    for (const n of data.value) {
      expect(n).to.include.keys('nodeType', 'nodeId', 'nodeName', 'parentId', 'cost', 'currency');
    }
  });

  it('getInvoices() returns one row per cost-center sorted desc by totalCost', async () => {
    const { data } = await GET('/odata/v4/cost/getInvoices()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    for (const inv of data.value) {
      expect(inv).to.include.keys(
        'costCenter', 'yearMonth', 'directCost', 'sharedCost', 'totalCost', 'currency', 'lineItems',
      );
      expect(inv.lineItems).to.be.an('array');
    }
    for (let i = 1; i < data.value.length; i++) {
      expect(data.value[i - 1].totalCost).to.be.gte(data.value[i].totalCost);
    }
  });

  it('getInvoices(yearMonth=\'2024-06\') stamps that yearMonth on each invoice', async () => {
    const { data } = await GET("/odata/v4/cost/getInvoices(yearMonth='2024-06')");
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    for (const inv of data.value) expect(inv.yearMonth).to.equal('2024-06');
  });

  it('ChargebackPolicies entity is queryable (empty by default)', async () => {
    const { data } = await GET('/odata/v4/cost/ChargebackPolicies');
    expect(data.value).to.be.an('array');
  });

  it('OrgHierarchyEntries entity is queryable (empty by default)', async () => {
    const { data } = await GET('/odata/v4/cost/OrgHierarchyEntries');
    expect(data.value).to.be.an('array');
  });
});
