'use strict';

const path = require('path');
const { expect } = require('chai');

// Force mock-mode.
delete process.env.DESTINATION_KEYS;
delete process.env.VCAP_SERVICES;

const cds = require('@sap/cds/lib');
const { GET } = cds.test(path.join(__dirname, '..', '..'));

describe('DestinvService (integration)', () => {

  it('getDestinations() returns mock data when no destination keys are set', async () => {
    const { data } = await GET('/odata/v4/destinv/getDestinations()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('subaccountId', 'name', 'authentication', 'proxyType');
  });

  it('getFindings() flags BASIC_AUTH_IN_PROD on prod subaccounts using BasicAuth', async () => {
    const { data } = await GET('/odata/v4/destinv/getFindings()');
    const basicAuthFindings = data.value.filter((f) => f.code === 'BASIC_AUTH_IN_PROD');
    expect(basicAuthFindings.length).to.be.greaterThan(0);
    expect(basicAuthFindings[0].severity).to.equal('error');
  });

  it('getFindings() flags DANGLING_TARGET when lastTestStatus = UNREACHABLE in prod', async () => {
    const { data } = await GET('/odata/v4/destinv/getFindings()');
    const dangling = data.value.filter((f) => f.code === 'DANGLING_TARGET');
    expect(dangling).to.have.length.greaterThan(0);
    // decommissioned-erp is in sub-001 (Production) → error severity
    expect(dangling[0].severity).to.equal('error');
    expect(dangling[0].destinationName).to.equal('decommissioned-erp');
  });

  it('getFindings() flags MTLS_AVAILABLE_NOT_USED for known-mTLS targets without ClientCert auth', async () => {
    const { data } = await GET('/odata/v4/destinv/getFindings()');
    const mtls = data.value.filter((f) => f.code === 'MTLS_AVAILABLE_NOT_USED');
    expect(mtls).to.have.length.greaterThan(0);
    // sf-success is at api.successfactors.com (mTLS-capable per catalog)
    // and uses OAuth2ClientCredentials → flagged
    expect(mtls[0].destinationName).to.equal('sf-success');
    expect(mtls[0].severity).to.equal('warn');
  });

  it('getSummary() returns the destination summary shape', async () => {
    const { data } = await GET('/odata/v4/destinv/getSummary()');
    expect(data).to.include.keys(
      'totalDestinations', 'basicAuthCount', 'onPremiseCount',
      'certsExpiring60d', 'certsExpiring14d', 'findings', 'criticalFindings'
    );
    expect(data.totalDestinations).to.be.a('number').and.greaterThan(0);
    expect(data.basicAuthCount).to.be.a('number');
  });

  it('getSummary() carries data-source provenance', async () => {
    const { data } = await GET('/odata/v4/destinv/getSummary()');
    expect(data.dataSource).to.equal('mock');
    expect(data.lastSyncAt).to.match(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('ScanPolicies entity is queryable', async () => {
    const { data } = await GET('/odata/v4/destinv/ScanPolicies');
    expect(data.value).to.be.an('array');
  });
});
