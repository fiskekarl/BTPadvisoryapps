'use strict';

const { expect } = require('chai');
const nock = require('nock');
const sinon = require('sinon');
const {
  freshRequire,
  disableAllNetwork,
  restoreNetwork,
  mockUaaToken,
} = require('../helpers/nock-helpers');

const MODULE_PATH = '../../srv/lib/uas-client';

const UAA_URL = 'https://uaa.example.com';
const UAS_URL = 'https://uas.example.com';
const CREDS = {
  uaa: { clientid: 'cid', clientsecret: 'sec', url: UAA_URL },
  target_url: UAS_URL,
};

function ymToApiDate(ym) { return parseInt(ym.replace('-', ''), 10); }

describe('lib/uas-client', () => {
  let uas;
  let clock;

  beforeEach(() => {
    freshRequire('../../srv/lib/oauth-cache');
    uas = freshRequire(MODULE_PATH);
    disableAllNetwork();
  });

  afterEach(() => {
    if (clock) { clock.restore(); clock = null; }
    restoreNetwork();
    delete process.env.VCAP_SERVICES;
    delete process.env.USAGE_API_CREDENTIALS;
  });

  describe('getUasCredentials', () => {
    it('returns null when no credentials are bound', () => {
      delete process.env.VCAP_SERVICES;
      delete process.env.USAGE_API_CREDENTIALS;
      expect(uas.getUasCredentials()).to.equal(null);
    });

    it('reads from VCAP_SERVICES.uas when bound', () => {
      process.env.VCAP_SERVICES = JSON.stringify({ uas: [{ credentials: { target_url: 'https://uas.a' } }] });
      const creds = uas.getUasCredentials();
      expect(creds.target_url).to.equal('https://uas.a');
    });

    it('reads from VCAP_SERVICES["usage-data-management"] when bound', () => {
      process.env.VCAP_SERVICES = JSON.stringify({ 'usage-data-management': [{ credentials: { target_url: 'https://uas.b' } }] });
      const creds = uas.getUasCredentials();
      expect(creds.target_url).to.equal('https://uas.b');
    });

    it('falls back to USAGE_API_CREDENTIALS env var', () => {
      delete process.env.VCAP_SERVICES;
      process.env.USAGE_API_CREDENTIALS = JSON.stringify({ target_url: 'https://uas.env' });
      const creds = uas.getUasCredentials();
      expect(creds.target_url).to.equal('https://uas.env');
    });
  });

  describe('lastNMonths', () => {
    it('returns N entries in ascending chronological order', () => {
      const result = uas.lastNMonths(3, '2024-06');
      expect(result).to.deep.equal(['2024-04', '2024-05', '2024-06']);
    });

    it('returns N=1 (just the end month) when n=1', () => {
      const result = uas.lastNMonths(1, '2024-06');
      expect(result).to.deep.equal(['2024-06']);
    });

    it('crosses year boundary correctly', () => {
      const result = uas.lastNMonths(3, '2024-02');
      expect(result).to.deep.equal(['2023-12', '2024-01', '2024-02']);
    });

    it('returns YYYY-MM format strings', () => {
      const result = uas.lastNMonths(2, '2024-06');
      for (const m of result) expect(m).to.match(/^\d{4}-\d{2}$/);
    });
  });

  describe('fetchMonthlyUsage', () => {
    it('fetches usage for each month and returns sorted results', async () => {
      // Pin the clock so lastNMonths picks a deterministic window.
      clock = sinon.useFakeTimers({ now: new Date('2024-06-15T00:00:00Z').getTime(), toFake: ['Date'] });
      // .persist() — both batch promises race past the oauth-cache check and
      // each fire a UAA call; one mock isn't enough.
      nock(UAA_URL).persist().post('/oauth/token').reply(200, { access_token: 'tok', expires_in: 3600 });
      const months = uas.lastNMonths(2);
      for (const ym of months) {
        const d = ymToApiDate(ym);
        nock(UAS_URL)
          .get('/reports/v1/monthlyUsage')
          .query({ fromDate: String(d), toDate: String(d) })
          .reply(200, { content: [{ serviceName: 'svc', planName: 'p', usage: d }] });
      }
      const result = await uas.fetchMonthlyUsage(CREDS, 2);
      expect(result).to.have.length(2);
      expect(result[0].yearMonth).to.equal(months[0]);
      expect(result[1].yearMonth).to.equal(months[1]);
      expect(result[0].content).to.be.an('array').with.length(1);
    });

    it('returns empty content array when API responds without content field', async () => {
      clock = sinon.useFakeTimers({ now: new Date('2024-06-15T00:00:00Z').getTime(), toFake: ['Date'] });
      mockUaaToken(UAA_URL);
      const months = uas.lastNMonths(1);
      const d = ymToApiDate(months[0]);
      nock(UAS_URL)
        .get('/reports/v1/monthlyUsage')
        .query({ fromDate: String(d), toDate: String(d) })
        .reply(200, {});
      const result = await uas.fetchMonthlyUsage(CREDS, 1);
      expect(result).to.have.length(1);
      expect(result[0].content).to.deep.equal([]);
    });

    it('drops failed months (Promise.allSettled)', async () => {
      clock = sinon.useFakeTimers({ now: new Date('2024-06-15T00:00:00Z').getTime(), toFake: ['Date'] });
      nock(UAA_URL).persist().post('/oauth/token').reply(200, { access_token: 'tok', expires_in: 3600 });
      const months = uas.lastNMonths(2);
      const d1 = ymToApiDate(months[0]);
      const d2 = ymToApiDate(months[1]);
      nock(UAS_URL).get('/reports/v1/monthlyUsage').query({ fromDate: String(d1), toDate: String(d1) }).reply(200, { content: [{ usage: 1 }] });
      nock(UAS_URL).get('/reports/v1/monthlyUsage').query({ fromDate: String(d2), toDate: String(d2) }).reply(500, 'boom');
      const result = await uas.fetchMonthlyUsage(CREDS, 2);
      expect(result).to.have.length(1);
      expect(result[0].yearMonth).to.equal(months[0]);
    });

    it('uses creds.url when target_url is missing', async () => {
      clock = sinon.useFakeTimers({ now: new Date('2024-06-15T00:00:00Z').getTime(), toFake: ['Date'] });
      const creds = { uaa: CREDS.uaa, url: UAS_URL };
      mockUaaToken(UAA_URL);
      const months = uas.lastNMonths(1);
      const d = ymToApiDate(months[0]);
      nock(UAS_URL)
        .get('/reports/v1/monthlyUsage')
        .query({ fromDate: String(d), toDate: String(d) })
        .reply(200, { content: [] });
      const result = await uas.fetchMonthlyUsage(creds, 1);
      expect(result).to.have.length(1);
    });
  });

  describe('fetchMonthlyCost', () => {
    it('fetches cost for each month and returns sorted results', async () => {
      clock = sinon.useFakeTimers({ now: new Date('2024-06-15T00:00:00Z').getTime(), toFake: ['Date'] });
      nock(UAA_URL).persist().post('/oauth/token').reply(200, { access_token: 'tok', expires_in: 3600 });
      const months = uas.lastNMonths(2);
      for (const ym of months) {
        const d = ymToApiDate(ym);
        nock(UAS_URL)
          .get('/reports/v1/monthlySubaccountsCost')
          .query({ fromDate: String(d), toDate: String(d) })
          .reply(200, { content: [{ subaccountId: 'sub', cost: 100 }] });
      }
      const result = await uas.fetchMonthlyCost(CREDS, 2);
      expect(result).to.have.length(2);
      expect(result[0].yearMonth).to.equal(months[0]);
      expect(result[1].yearMonth).to.equal(months[1]);
    });
  });
});
