'use strict';

const path = require('path');
const { expect } = require('chai');

// Force mock-mode: getSubaccounts falls back to mockSubaccounts() when CIS
// credentials aren't available, and getAuditActivity falls back to mock data
// when no subaccount keys are loaded.
delete process.env.CIS_CREDENTIALS;
delete process.env.SUBACCOUNT_KEYS;
delete process.env.VCAP_SERVICES;

const cds = require('@sap/cds/lib');
const { GET, POST } = cds.test(path.join(__dirname, '..', '..'));

describe('LifecycleService (integration)', () => {

  it('getSubaccounts() returns the mock inventory in mock-mode', async () => {
    const { data } = await GET('/odata/v4/lifecycle/getSubaccounts()');
    expect(data.value).to.be.an('array').with.length(6); // mockSubaccounts has 6 rows
    const prod = data.value.find((r) => r.subaccountId === 'sub-001');
    expect(prod.displayName).to.equal('Production');
    expect(prod.tier).to.equal('prod');
    expect(prod.usedForProd).to.equal('USED_FOR_PRODUCTION');
  });

  it('getSummary() returns lifecycle KPIs', async () => {
    const { data } = await GET('/odata/v4/lifecycle/getSummary()');
    expect(data).to.include.keys(
      'totalSubaccounts', 'activeSubaccounts', 'inactiveSubaccounts',
      'stoppedSubaccounts', 'driftFindings', 'criticalDrifts', 'auditEvents30d'
    );
    expect(data.totalSubaccounts).to.equal(6);
    expect(data.stoppedSubaccounts).to.be.a('number');
  });

  it('getSummary() carries data-source provenance', async () => {
    const { data } = await GET('/odata/v4/lifecycle/getSummary()');
    expect(data.dataSource).to.equal('mock'); // no creds in test env
    expect(data.lastSyncAt).to.match(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('getAuditActivity() returns mock events when subaccount keys are absent', async () => {
    const { data } = await GET("/odata/v4/lifecycle/getAuditActivity(subaccountId=null,days=30)");
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('timestamp', 'subaccountId', 'actor', 'action', 'outcome');
  });

  it('getAuditActivity() filters mock events by subaccountId', async () => {
    const { data } = await GET("/odata/v4/lifecycle/getAuditActivity(subaccountId='sub-001',days=30)");
    expect(data.value.every((e) => e.subaccountId === 'sub-001')).to.equal(true);
  });

  it('DriftBaselines entity is queryable (empty by default)', async () => {
    const { data } = await GET('/odata/v4/lifecycle/DriftBaselines');
    expect(data.value).to.be.an('array');
  });

  it('importBaseline() upserts DriftBaselines from a pack payload', async () => {
    const pack = {
      version: 'test-2026.05',
      '01-subaccount-lifecycle': {
        driftBaselines: [
          { tier: 'prod', resourceType: 'label', expectedJson: '{"requiredLabels":["costCenter"]}', note: 'Test' },
          { tier: 'qa',   resourceType: 'label', expectedJson: '{"requiredLabels":["department"]}', note: 'Test QA' },
        ],
      },
    };
    const { data } = await POST('/odata/v4/lifecycle/importBaseline', { packJson: JSON.stringify(pack) });
    const msg = typeof data === 'string' ? data : data.value;
    expect(msg).to.match(/Imported 2 DriftBaseline.*test-2026\.05/);

    const after = await GET('/odata/v4/lifecycle/DriftBaselines');
    expect(after.data.value.length).to.be.at.least(2);
  });

  it('exportBaseline() returns a JSON pack containing the driftBaselines section', async () => {
    const { data } = await GET('/odata/v4/lifecycle/exportBaseline()');
    const raw = typeof data === 'string' ? data : data.value;
    const parsed = JSON.parse(raw);
    expect(parsed['01-subaccount-lifecycle'].driftBaselines).to.be.an('array');
    expect(parsed.version).to.match(/^export-\d{4}-\d{2}-\d{2}$/);
  });
});
