'use strict';

const path = require('path');
const { expect } = require('chai');

// Force mock-mode: getTrusts falls back to mockTrusts() when no SUBACCOUNT_KEYS
// are loaded; getAppPolicies / getDormantUsers return mock data when IAS_*
// env vars are unset.
delete process.env.CIS_CREDENTIALS;
delete process.env.SUBACCOUNT_KEYS;
delete process.env.VCAP_SERVICES;
delete process.env.IAS_API_URL;
delete process.env.IAS_CLIENT_ID;
delete process.env.IAS_CLIENT_SECRET;
delete process.env.IAS_OAUTH_URL;

const cds = require('@sap/cds/lib');
const { GET } = cds.test(path.join(__dirname, '..', '..'));

describe('IdentService (integration)', () => {

  it('getTrusts() returns the mock trust list in mock-mode', async () => {
    const { data } = await GET('/odata/v4/ident/getTrusts()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    const t = data.value.find((r) => r.subaccountId === 'sub-001');
    expect(t).to.exist;
    expect(t.trustName).to.be.a('string');
    expect(t).to.include.keys('type', 'enabled', 'autoCreateUsers', 'daysToExpiry');
  });

  it('getAppPolicies() returns the mock app policy rows in mock-mode', async () => {
    const { data } = await GET('/odata/v4/ident/getAppPolicies()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('appId', 'appName', 'mfaEnforced', 'riskBasedEnabled');
  });

  it('getDormantUsers() returns the mock dormant users in mock-mode', async () => {
    const { data } = await GET('/odata/v4/ident/getDormantUsers()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('userId', 'email', 'daysSinceLogin', 'status');
  });

  it('getSummary() returns the IdentSummary shape', async () => {
    const { data } = await GET('/odata/v4/ident/getSummary()');
    expect(data).to.include.keys(
      'iasApps', 'appsWithoutMfa', 'trustConfigs', 'trustsExpiring60d',
      'dormantUsers', 'findings', 'criticalFindings'
    );
    expect(data.iasApps).to.be.a('number');
    expect(data.trustConfigs).to.be.a('number');
  });

  it('getFindings() returns an array including dormant-user findings', async () => {
    const { data } = await GET('/odata/v4/ident/getFindings()');
    expect(data.value).to.be.an('array');
    // mockDormantUsers returns 2 users, each becomes a DORMANT_USER finding
    const dormantFindings = data.value.filter((f) => f.code === 'DORMANT_USER');
    expect(dormantFindings.length).to.be.greaterThan(0);
  });

  it('HealthPolicies entity is queryable (empty until written)', async () => {
    const { data } = await GET('/odata/v4/ident/HealthPolicies');
    expect(data.value).to.be.an('array');
  });

  it('IgnoreRules entity is queryable (empty by default)', async () => {
    const { data } = await GET('/odata/v4/ident/IgnoreRules');
    expect(data.value).to.be.an('array');
  });
});
