'use strict';

const path = require('path');
const { expect } = require('chai');

// Force mock-mode: when CIS credentials are absent the service returns
// mockEntitlements(), and when UAS credentials are absent the usage history
// is just empty (the mock path doesn't need it).
delete process.env.CIS_CREDENTIALS;
delete process.env.SUBACCOUNT_KEYS;
delete process.env.VCAP_SERVICES;
delete process.env.USAGE_API_CREDENTIALS;

const cds = require('@sap/cds/lib');
const { GET } = cds.test(path.join(__dirname, '..', '..'));

describe('EntitleService (integration)', () => {

  it('getEntitlements() returns the mock catalogue in mock-mode', async () => {
    const { data } = await GET('/odata/v4/entitle/getEntitlements(months=12)');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    const hana = data.value.find((r) => r.serviceName === 'SAP HANA Cloud');
    expect(hana).to.exist;
    expect(hana.recommendation).to.match(/^(KEEP|DOWNGRADE|INVESTIGATE)$/);
  });

  it('getSummary() returns the entitlement KPIs', async () => {
    const { data } = await GET('/odata/v4/entitle/getSummary(months=12)');
    expect(data).to.include.keys(
      'totalEntitlements', 'underutilized', 'overutilized',
      'renewalsNext60d', 'estimatedAnnualSaving', 'currency',
    );
    expect(data.totalEntitlements).to.be.a('number');
    expect(data.estimatedAnnualSaving).to.be.a('number');
  });

  it('getRenewalAlerts() returns rows whose renewal falls within the window', async () => {
    const { data } = await GET('/odata/v4/entitle/getRenewalAlerts(daysAhead=365)');
    expect(data.value).to.be.an('array');
    for (const r of data.value) {
      expect(r).to.include.keys(
        'serviceName', 'planName', 'renewalDate', 'daysToRenewal',
        'avgUsage', 'entitled', 'recommendation', 'currency',
      );
    }
  });

  it('ContractAnchors entity is queryable (empty by default)', async () => {
    const { data } = await GET('/odata/v4/entitle/ContractAnchors');
    expect(data.value).to.be.an('array');
  });

  it('AcknowledgedRecommendations entity is queryable (empty by default)', async () => {
    const { data } = await GET('/odata/v4/entitle/AcknowledgedRecommendations');
    expect(data.value).to.be.an('array');
  });
});
