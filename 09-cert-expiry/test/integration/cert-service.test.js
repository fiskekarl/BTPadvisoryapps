'use strict';

const path = require('path');
const { expect } = require('chai');

delete process.env.DESTINATION_KEYS;
delete process.env.IAS_API_URL;
delete process.env.IAS_CLIENT_ID;
delete process.env.IAS_CLIENT_SECRET;
delete process.env.VCAP_SERVICES;

const cds = require('@sap/cds/lib');
const { GET } = cds.test(path.join(__dirname, '..', '..'));

describe('CertService (integration)', () => {

  it('getCerts() returns mock certs when no upstream sources are configured', async () => {
    const { data } = await GET('/odata/v4/cert/getCerts()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('kind', 'subaccountId', 'name', 'notAfter', 'severity', 'daysToExpiry');
  });

  it('getCerts() result is sorted by daysToExpiry ascending', async () => {
    const { data } = await GET('/odata/v4/cert/getCerts()');
    const days = data.value.map((c) => c.daysToExpiry ?? Number.POSITIVE_INFINITY);
    for (let i = 1; i < days.length; i++) {
      expect(days[i] >= days[i - 1]).to.equal(true);
    }
  });

  it('getSummary() returns the cert summary shape', async () => {
    const { data } = await GET('/odata/v4/cert/getSummary()');
    expect(data).to.include.keys(
      'totalCerts', 'expiredCount', 'critical14d', 'warn30d', 'notice90d', 'unacknowledged'
    );
    expect(data.totalCerts).to.be.greaterThan(0);
  });

  it('AlertThresholds entity is queryable', async () => {
    const { data } = await GET('/odata/v4/cert/AlertThresholds');
    expect(data.value).to.be.an('array');
  });
});
