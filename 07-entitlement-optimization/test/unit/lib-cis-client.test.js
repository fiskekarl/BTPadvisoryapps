'use strict';

const { expect } = require('chai');
const nock = require('nock');
const {
  freshRequire,
  disableAllNetwork,
  restoreNetwork,
  mockUaaToken,
  mockCisEntitlements,
} = require('../helpers/nock-helpers');

const MODULE_PATH = '../../srv/lib/cis-client';

const UAA_URL = 'https://uaa.example.com';
const CIS_URL = 'https://cis.example.com';
const CREDS = {
  uaa: { clientid: 'cid', clientsecret: 'sec', url: UAA_URL },
  endpoints: { entitlements_service_url: CIS_URL },
};

describe('lib/cis-client', () => {
  let cis;

  beforeEach(() => {
    freshRequire('../../srv/lib/oauth-cache');
    cis = freshRequire(MODULE_PATH);
    disableAllNetwork();
  });

  afterEach(() => {
    restoreNetwork();
    delete process.env.VCAP_SERVICES;
    delete process.env.CIS_CREDENTIALS;
  });

  describe('getCisCredentials', () => {
    it('returns null when no credentials are bound', () => {
      delete process.env.VCAP_SERVICES;
      delete process.env.CIS_CREDENTIALS;
      expect(cis.getCisCredentials()).to.equal(null);
    });

    it('reads from VCAP_SERVICES.cis when bound', () => {
      process.env.VCAP_SERVICES = JSON.stringify({ cis: [{ credentials: { uaa: { clientid: 'vcap' } } }] });
      const creds = cis.getCisCredentials();
      expect(creds.uaa.clientid).to.equal('vcap');
    });

    it('falls back to CIS_CREDENTIALS env var', () => {
      delete process.env.VCAP_SERVICES;
      process.env.CIS_CREDENTIALS = JSON.stringify({ uaa: { clientid: 'env' } });
      const creds = cis.getCisCredentials();
      expect(creds.uaa.clientid).to.equal('env');
    });
  });

  describe('listEntitlements', () => {
    it('returns the entitledServices array from the CIS Entitlements API', async () => {
      mockUaaToken(UAA_URL);
      mockCisEntitlements(CIS_URL, [{ name: 'hana-cloud' }, { name: 'destination' }]);
      const result = await cis.listEntitlements(CREDS);
      expect(result).to.have.length(2);
      expect(result[0].name).to.equal('hana-cloud');
    });

    it('returns empty array when no entitledServices field present', async () => {
      mockUaaToken(UAA_URL);
      nock(CIS_URL).get('/entitlements/v1/globalAccountAssignments').reply(200, {});
      const result = await cis.listEntitlements(CREDS);
      expect(result).to.deep.equal([]);
    });

    it('uses creds.url when endpoints.entitlements_service_url is missing', async () => {
      const credsNoEndpoints = {
        uaa: { clientid: 'cid', clientsecret: 'sec', url: UAA_URL },
        url: CIS_URL,
      };
      mockUaaToken(UAA_URL);
      mockCisEntitlements(CIS_URL, [{ name: 'svc' }]);
      const result = await cis.listEntitlements(credsNoEndpoints);
      expect(result).to.have.length(1);
    });
  });
});
