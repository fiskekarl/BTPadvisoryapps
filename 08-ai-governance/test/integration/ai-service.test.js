'use strict';

const path = require('path');
const { expect } = require('chai');

delete process.env.AI_CORE_URL;
delete process.env.AI_CORE_OAUTH_URL;
delete process.env.AI_CORE_CLIENT_ID;
delete process.env.AI_CORE_CLIENT_SECRET;
delete process.env.VCAP_SERVICES;

const cds = require('@sap/cds/lib');
const { GET } = cds.test(path.join(__dirname, '..', '..'));

describe('AiService (integration)', () => {

  it('getDeployments() returns mock deployments when AI Core not configured', async () => {
    const { data } = await GET('/odata/v4/ai/getDeployments()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('id', 'scenarioId', 'modelName', 'modelProvider', 'status');
  });

  it('getOrchestrationConfigs() returns mock configs', async () => {
    const { data } = await GET('/odata/v4/ai/getOrchestrationConfigs()');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    expect(data.value[0]).to.include.keys('configId', 'hasInputFilter', 'hasOutputFilter', 'hasMasking', 'compliant');
  });

  it('getOrchestrationConfigs() includes both compliant and non-compliant configs', async () => {
    const { data } = await GET('/odata/v4/ai/getOrchestrationConfigs()');
    const compliant = data.value.filter((c) => c.compliant);
    const nonCompliant = data.value.filter((c) => !c.compliant);
    expect(compliant.length).to.be.greaterThan(0);
    expect(nonCompliant.length).to.be.greaterThan(0);
  });

  it('getSpend() returns rows for the requested month count', async () => {
    const { data } = await GET('/odata/v4/ai/getSpend(months=3)');
    // mockSpend emits 4 rows per month
    expect(data.value).to.have.length(12);
    expect(data.value[0]).to.include.keys('yearMonth', 'modelProvider', 'modelName', 'costEur');
  });

  it('getSummary() returns the AI governance KPIs', async () => {
    const { data } = await GET('/odata/v4/ai/getSummary()');
    expect(data).to.include.keys(
      'activeDeployments', 'modelsInUse', 'monthlySpendEur',
      'configsWithoutFilter', 'configsWithoutMasking', 'promptInjectionAlerts7d'
    );
  });
});
