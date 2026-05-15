'use strict';

const path = require('path');
const { expect } = require('chai');

delete process.env.SUBACCOUNT_KEYS;
delete process.env.VCAP_SERVICES;
delete process.env.CTMS_URL;
delete process.env.CTMS_TOKEN;

const cds = require('@sap/cds/lib');
const { GET } = cds.test(path.join(__dirname, '..', '..'));

describe('AuditService (integration)', () => {

  it('seeds AnomalyRules on init', async () => {
    const { data } = await GET('/odata/v4/audit/AnomalyRules');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
  });

  it('getEvents() returns mock events when no subaccount keys are configured', async () => {
    const { data } = await GET('/odata/v4/audit/getEvents(days=30,subaccountId=null,actor=null)');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('timestamp', 'subaccountId', 'actor', 'action', 'outcome');
  });

  it('getEvents() filters by subaccountId', async () => {
    const { data } = await GET("/odata/v4/audit/getEvents(days=30,subaccountId='sub-001',actor=null)");
    expect(data.value.every((e) => e.subaccountId === 'sub-001')).to.equal(true);
  });

  it('getAnomalies() returns only events with anomalyId set', async () => {
    const { data } = await GET('/odata/v4/audit/getAnomalies(days=30)');
    expect(data.value).to.be.an('array');
    expect(data.value.every((e) => e.anomalyId)).to.equal(true);
  });

  it('getSummary() returns audit KPIs', async () => {
    const { data } = await GET('/odata/v4/audit/getSummary()');
    expect(data).to.include.keys(
      'totalEvents30d', 'criticalEvents30d', 'afterHoursActions',
      'failedActions', 'activeSubaccounts', 'uniqueActors'
    );
  });

  it('getSummary() carries data-source provenance', async () => {
    const { data } = await GET('/odata/v4/audit/getSummary()');
    expect(data.dataSource).to.equal('mock');
    expect(data.lastSyncAt).to.match(/^\d{4}-\d{2}-\d{2}T/);
  });
});
