'use strict';

const path = require('path');
const { expect } = require('chai');

delete process.env.VCAP_SERVICES;

const cds = require('@sap/cds/lib');
const { GET, POST } = cds.test(path.join(__dirname, '..', '..'));

describe('CleanCoreService (integration)', () => {

  it('getExtensions() returns mock data when no scan results have been persisted', async () => {
    const { data } = await GET("/odata/v4/clean-core/getExtensions(systemId=null)");
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('objectType', 'objectName', 'classification', 'severity');
  });

  it('getSummary() returns the clean-core KPI shape', async () => {
    const { data } = await GET('/odata/v4/clean-core/getSummary()');
    expect(data).to.include.keys(
      'totalExtensions', 'cleanCount', 'keyUserCount', 'sideBySideCount',
      'inStackModCount', 'unreleasedApiCount', 'compliancePct'
    );
    expect(data.compliancePct).to.be.within(0, 100);
  });

  it('getSummary() carries data-source provenance', async () => {
    const { data } = await GET('/odata/v4/clean-core/getSummary()');
    expect(data.dataSource).to.equal('mock');
    expect(data.lastSyncAt).to.match(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('runScan persists a ScanRun and returns a run id', async () => {
    const before = (await GET('/odata/v4/clean-core/ScanRuns')).data.value.length;
    const { data: result } = await POST('/odata/v4/clean-core/runScan', { systemId: 'TEST' });
    const id = typeof result === 'string' ? result : result.value;
    expect(id).to.match(/^run-/);

    const after = (await GET('/odata/v4/clean-core/ScanRuns')).data.value;
    expect(after.length).to.equal(before + 1);
    const newRun = after.find((r) => r.id === id);
    expect(newRun).to.exist;
    expect(newRun.systemId).to.equal('TEST');
    expect(newRun.totalObjects).to.be.greaterThan(0);
  });
});
