'use strict';

const { expect } = require('chai');
const nock = require('nock');
const {
  freshRequire,
  disableAllNetwork,
  restoreNetwork,
  mockUaaToken,
  mockUasSubaccountCost,
} = require('../helpers/nock-helpers');

const MODULE_PATH = '../../srv/lib/uas-client';

const UAA_URL = 'https://uaa.example.com';
const UAS_URL = 'https://uas.example.com';
const CREDS = {
  uaa: { clientid: 'cid', clientsecret: 'sec', url: UAA_URL },
  target_url: UAS_URL,
};

describe('lib/uas-client', () => {
  let uas;

  beforeEach(() => {
    freshRequire('../../srv/lib/oauth-cache');
    uas = freshRequire(MODULE_PATH);
    disableAllNetwork();
  });

  afterEach(() => {
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

  describe('fetchSubaccountCost', () => {
    it('hits /reports/v1/monthlySubaccountsCost with the right fromDate/toDate', async () => {
      mockUaaToken(UAA_URL);
      mockUasSubaccountCost(UAS_URL, 202405, 202405, [
        { subaccountId: 'sub-001', cost: 1280 },
        { subaccountId: 'sub-002', cost: 640 },
      ]);
      const rows = await uas.fetchSubaccountCost(CREDS, '2024-05');
      expect(rows).to.have.length(2);
      expect(rows[0].subaccountId).to.equal('sub-001');
      expect(rows[0].cost).to.equal(1280);
    });

    it('returns empty array when no content field is present', async () => {
      mockUaaToken(UAA_URL);
      nock(UAS_URL)
        .get('/reports/v1/monthlySubaccountsCost')
        .query({ fromDate: '202405', toDate: '202405' })
        .reply(200, {});
      const rows = await uas.fetchSubaccountCost(CREDS, '2024-05');
      expect(rows).to.deep.equal([]);
    });

    it('uses creds.url when target_url is missing', async () => {
      const creds = { uaa: CREDS.uaa, url: UAS_URL };
      mockUaaToken(UAA_URL);
      mockUasSubaccountCost(UAS_URL, 202406, 202406, [{ subaccountId: 'sub-x', cost: 10 }]);
      const rows = await uas.fetchSubaccountCost(creds, '2024-06');
      expect(rows).to.have.length(1);
    });

    it('passes the OAuth bearer token in the Authorization header', async () => {
      const tokenScope = mockUaaToken(UAA_URL, 'sentinel-token');
      let observedAuth = '';
      nock(UAS_URL)
        .get('/reports/v1/monthlySubaccountsCost')
        .query({ fromDate: '202407', toDate: '202407' })
        .reply(function () {
          observedAuth = this.req.headers.authorization;
          return [200, { content: [] }];
        });
      await uas.fetchSubaccountCost(CREDS, '2024-07');
      expect(tokenScope.isDone()).to.equal(true);
      expect(observedAuth).to.equal('Bearer sentinel-token');
    });
  });
});
