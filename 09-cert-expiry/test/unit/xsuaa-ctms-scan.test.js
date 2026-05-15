'use strict';

const { expect } = require('chai');
const nock       = require('nock');

const { __test__ } = require('../../srv/cert-service');
const { sampleSelfSignedPem, sampleSelfSignedB64 } = require('../helpers/fixtures');

const {
  getXsuaaKeys, loadXsuaaTrustCerts, loadCtmsCerts, _resetOAuthTokenCache,
} = __test__;

const XSUAA_API = 'https://xsuaa.example.com';
const UAA_URL   = 'https://uaa.example.com';
const CTMS_URL  = 'https://ctms.example.com';

describe('cert-service XSUAA + cTMS scans', () => {

  describe('getXsuaaKeys', () => {
    afterEach(() => {
      delete process.env.XSUAA_KEYS;
      delete process.env.SUBACCOUNT_KEYS;
    });

    it('returns [] when neither env var is set', () => {
      expect(getXsuaaKeys()).to.deep.equal([]);
    });

    it('parses XSUAA_KEYS as the primary source', () => {
      process.env.XSUAA_KEYS = JSON.stringify([{
        subaccountId: 'sub-A', subaccountName: 'A',
        uaa: { clientid: 'c', clientsecret: 's', url: UAA_URL },
        apiurl: XSUAA_API,
      }]);
      const out = getXsuaaKeys();
      expect(out).to.have.length(1);
      expect(out[0].subaccountId).to.equal('sub-A');
    });

    it('falls back to SUBACCOUNT_KEYS (.xsuaa block) when XSUAA_KEYS absent', () => {
      process.env.SUBACCOUNT_KEYS = JSON.stringify([
        { subaccountId: 'sub-B', subaccountName: 'B', xsuaa: {
            uaa: { clientid: 'c', clientsecret: 's', url: UAA_URL },
            apiurl: XSUAA_API,
        }},
        { subaccountId: 'sub-C', subaccountName: 'C' /* no xsuaa block */ },
      ]);
      const out = getXsuaaKeys();
      expect(out).to.have.length(1);
      expect(out[0].subaccountId).to.equal('sub-B');
      expect(out[0].apiurl).to.equal(XSUAA_API);
    });

    it('ignores malformed JSON in either env var', () => {
      process.env.XSUAA_KEYS = 'not-json';
      process.env.SUBACCOUNT_KEYS = '{also not}';
      expect(getXsuaaKeys()).to.deep.equal([]);
    });

    it('prefers XSUAA_KEYS even when SUBACCOUNT_KEYS is also set', () => {
      process.env.XSUAA_KEYS = JSON.stringify([{
        subaccountId: 'pri', uaa: { clientid: 'c', clientsecret: 's', url: UAA_URL }, apiurl: XSUAA_API,
      }]);
      process.env.SUBACCOUNT_KEYS = JSON.stringify([{
        subaccountId: 'fallback', xsuaa: { uaa: { clientid: 'c2', clientsecret: 's', url: UAA_URL }, apiurl: XSUAA_API },
      }]);
      const out = getXsuaaKeys();
      expect(out).to.have.length(1);
      expect(out[0].subaccountId).to.equal('pri');
    });
  });

  describe('loadXsuaaTrustCerts (network)', () => {
    beforeEach(() => {
      _resetOAuthTokenCache();
      nock.cleanAll();
      process.env.XSUAA_KEYS = JSON.stringify([{
        subaccountId: 'sub-A', subaccountName: 'Production',
        uaa: { clientid: 'c', clientsecret: 's', url: UAA_URL },
        apiurl: XSUAA_API,
      }]);
    });
    afterEach(() => {
      nock.cleanAll();
      delete process.env.XSUAA_KEYS;
    });

    it('returns [] when no XSUAA keys are configured', async () => {
      delete process.env.XSUAA_KEYS;
      expect(await loadXsuaaTrustCerts()).to.deep.equal([]);
    });

    it('returns [] when the trust-configurations call errors', async () => {
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(XSUAA_API).get('/sap/rest/authorization/v2/trust-configurations').replyWithError('boom');
      expect(await loadXsuaaTrustCerts()).to.deep.equal([]);
    });

    it('extracts trust-config certs and attaches subaccount metadata', async () => {
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(XSUAA_API).get('/sap/rest/authorization/v2/trust-configurations').reply(200, {
        trustConfigurations: [
          { originKey: 'sap.default', samlMetadata: { signingCertificate: sampleSelfSignedPem } },
          { name:      'corporate-idp', certificate: sampleSelfSignedB64 },
        ],
      });

      const out = await loadXsuaaTrustCerts();
      expect(out).to.have.length(2);
      expect(out[0].kind).to.equal('XSUAA_TRUST');
      expect(out[0].subaccountId).to.equal('sub-A');
      expect(out[0].subaccountName).to.equal('Production');
      expect(out[0].name).to.equal('sap.default');
      expect(out[0].notAfter).to.match(/^\d{4}-\d{2}-\d{2}$/);
      expect(out[1].name).to.equal('corporate-idp');
    });

    it('handles array-shaped response and skips trusts with no cert', async () => {
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(XSUAA_API).get('/sap/rest/authorization/v2/trust-configurations').reply(200, [
        { originKey: 'has-cert',   signingCertificate: sampleSelfSignedPem },
        { originKey: 'no-cert' },
        { originKey: 'bad-cert',   signingCertificate: 'garbage' },
      ]);
      const out = await loadXsuaaTrustCerts();
      expect(out.map((c) => c.name)).to.deep.equal(['has-cert']);
    });
  });

  describe('loadCtmsCerts (network)', () => {
    beforeEach(() => {
      nock.cleanAll();
      process.env.CTMS_URL   = CTMS_URL;
      process.env.CTMS_TOKEN = 'bearer-token-here';
    });
    afterEach(() => {
      nock.cleanAll();
      delete process.env.CTMS_URL;
      delete process.env.CTMS_TOKEN;
    });

    it('returns [] when CTMS_URL / CTMS_TOKEN unset', async () => {
      delete process.env.CTMS_URL;
      expect(await loadCtmsCerts()).to.deep.equal([]);
    });

    it('returns [] on transport error', async () => {
      nock(CTMS_URL).get('/v2/landscapeIdentities').replyWithError('cTMS down');
      expect(await loadCtmsCerts()).to.deep.equal([]);
    });

    it('sends the configured bearer token', async () => {
      const scope = nock(CTMS_URL, { reqheaders: { Authorization: 'Bearer bearer-token-here' } })
        .get('/v2/landscapeIdentities')
        .reply(200, { landscapeIdentities: [] });
      await loadCtmsCerts();
      expect(scope.isDone()).to.equal(true);
    });

    it('parses landscapeIdentities + cTMS-specific shapes (publicKey, signingCertificateContent)', async () => {
      nock(CTMS_URL).get('/v2/landscapeIdentities').reply(200, {
        landscapeIdentities: [
          { id: 'prod-signer',   name: 'PROD-Signer',  publicKey: sampleSelfSignedPem },
          { id: 'qa-signer',     name: 'QA-Signer',    signingCertificateContent: sampleSelfSignedB64 },
          { id: 'no-cert-here',  name: 'Empty-Identity' },
        ],
      });

      const out = await loadCtmsCerts();
      expect(out).to.have.length(2);
      expect(out.every((c) => c.kind === 'CTMS')).to.equal(true);
      expect(out.every((c) => c.subaccountName === 'ctms.example.com')).to.equal(true);
      expect(out.map((c) => c.name)).to.have.members(['PROD-Signer', 'QA-Signer']);
    });
  });
});
