'use strict';

const path = require('path');
const { expect } = require('chai');

// Ensure mock-mode: the service's loadSubaccounts/loadDestinations fall back
// to built-in mock data when these env vars are unset.
delete process.env.CIS_CREDENTIALS;
delete process.env.SUBACCOUNT_KEYS;
delete process.env.VCAP_SERVICES;

const cds = require('@sap/cds/lib');
const { GET, POST } = cds.test(path.join(__dirname, '..', '..'));

describe('ScoreService (integration)', () => {

  it('seeds the canonical rules on init', async () => {
    const { data } = await GET('/odata/v4/score/Rules');
    expect(data.value).to.be.an('array').with.length.greaterThan(0);
    const ids = data.value.map((r) => r.id);
    expect(ids).to.include('PROD_NO_BASIC_AUTH');
    expect(ids).to.include('PROD_REQUIRES_LABEL_COSTCENTER');
  });

  it('getScorecard() returns the full Scorecard shape', async () => {
    const { data } = await GET('/odata/v4/score/getScorecard()');
    expect(data).to.include.keys(
      'overallGrade', 'overallScore', 'subaccountCount', 'ruleCount', 'perSubaccount', 'findings'
    );
    expect(data.subaccountCount).to.equal(5);          // matches mockSubaccounts() in score-service.js
    expect(data.perSubaccount).to.be.an('array').with.length(5);
    expect(data.overallGrade).to.match(/^[A-F]$/);
  });

  it('runScan persists a ScoreSnapshot and returns a UUID', async () => {
    const before = (await GET('/odata/v4/score/ScoreSnapshots')).data.value.length;

    const { data: result } = await POST('/odata/v4/score/runScan', { label: 'unit-test-baseline' });
    // CAP wraps unbound action results as { value: <UUID> } in OData v4.
    const id = typeof result === 'string' ? result : result.value;
    expect(id).to.match(/^[0-9a-f-]{36}$/i);

    const after = (await GET('/odata/v4/score/ScoreSnapshots')).data.value;
    expect(after.length).to.equal(before + 1);
    const newSnap = after.find((s) => s.id === id);
    expect(newSnap).to.exist;
    expect(newSnap.label).to.equal('unit-test-baseline');
    expect(newSnap.overallGrade).to.match(/^[A-F]$/);
  });

  it('runScan defaults the label when omitted', async () => {
    const { data: result } = await POST('/odata/v4/score/runScan', {});
    const id = typeof result === 'string' ? result : result.value;
    const { data: snap } = await GET(`/odata/v4/score/ScoreSnapshots(${id})`);
    expect(snap.label).to.match(/^Scan /);
  });
});
