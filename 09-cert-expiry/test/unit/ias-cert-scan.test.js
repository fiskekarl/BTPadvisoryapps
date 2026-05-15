'use strict';

const { expect } = require('chai');
const nock       = require('nock');

const { __test__ } = require('../../srv/cert-service');
const { sampleSelfSignedPem, sampleSelfSignedB64 } = require('../helpers/fixtures');

const { collectCertCandidates, parseCertCandidate, loadIasCerts, _resetIasTokenCache } = __test__;

const IAS_HOST  = 'https://acme.accounts.ondemand.com';
const TOKEN_URL = `${IAS_HOST}/oauth2/token`;

describe('cert-service IAS scan', () => {

  describe('collectCertCandidates', () => {
    it('returns [] for an empty trust', () => {
      expect(collectCertCandidates({})).to.deep.equal([]);
    });

    it('picks up signingCertificate at the top level', () => {
      expect(collectCertCandidates({ signingCertificate: 'pem-1' })).to.deep.equal(['pem-1']);
    });

    it('picks up samlMetadata.signingCertificate + encryptionCertificate', () => {
      const out = collectCertCandidates({ samlMetadata: { signingCertificate: 'a', encryptionCertificate: 'b' } });
      expect(out).to.have.members(['a', 'b']);
    });

    it('flattens signingCertificates arrays', () => {
      const out = collectCertCandidates({
        signingCertificates: ['x', 'y'],
        samlMetadata: { signingCertificates: ['z'] },
      });
      expect(out).to.have.members(['x', 'y', 'z']);
    });

    it('picks up openIdConnectConfiguration.publicKey', () => {
      expect(collectCertCandidates({ openIdConnectConfiguration: { publicKey: 'oidc-pem' } }))
        .to.deep.equal(['oidc-pem']);
    });
  });

  describe('parseCertCandidate', () => {
    it('returns null for empty / non-string input', () => {
      expect(parseCertCandidate(null)).to.equal(null);
      expect(parseCertCandidate('')).to.equal(null);
      expect(parseCertCandidate({})).to.equal(null);
      expect(parseCertCandidate(42)).to.equal(null);
    });

    it('parses a raw PEM string', () => {
      const r = parseCertCandidate(sampleSelfSignedPem);
      expect(r).to.be.an('object');
      expect(r.notAfter).to.match(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.subject).to.include('localhost');
    });

    it('parses a base64-wrapped PEM', () => {
      const r = parseCertCandidate(sampleSelfSignedB64);
      expect(r).to.be.an('object');
      expect(r.notAfter).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('extracts cert from {value: ...} envelope', () => {
      const r = parseCertCandidate({ value: sampleSelfSignedPem });
      expect(r).to.not.equal(null);
    });

    it('returns null for malformed PEM', () => {
      expect(parseCertCandidate('-----BEGIN CERTIFICATE-----\nGARBAGE\n-----END CERTIFICATE-----')).to.equal(null);
    });
  });

  describe('loadIasCerts (network)', () => {
    beforeEach(() => {
      _resetIasTokenCache();
      delete process.env.IAS_OAUTH_URL;
      process.env.IAS_API_URL       = IAS_HOST;
      process.env.IAS_CLIENT_ID     = 'test-client';
      process.env.IAS_CLIENT_SECRET = 'test-secret';
      nock.cleanAll();
    });

    afterEach(() => {
      nock.cleanAll();
      delete process.env.IAS_API_URL;
      delete process.env.IAS_CLIENT_ID;
      delete process.env.IAS_CLIENT_SECRET;
    });

    it('returns [] when env vars are unset', async () => {
      delete process.env.IAS_API_URL;
      const out = await loadIasCerts();
      expect(out).to.deep.equal([]);
    });

    it('returns [] when /Trust call errors out (network failure path)', async () => {
      nock(IAS_HOST).post('/oauth2/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(IAS_HOST).get('/Trust').replyWithError('boom');
      const out = await loadIasCerts();
      expect(out).to.deep.equal([]);
    });

    it('extracts certs from a /Trust response (values shape)', async () => {
      nock(IAS_HOST).post('/oauth2/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(IAS_HOST).get('/Trust').reply(200, {
        values: [
          { name: 'corporate-ad', samlMetadata: { signingCertificate: sampleSelfSignedPem } },
          { displayName: 'partner-x', signingCertificate: sampleSelfSignedB64 },
        ],
      });

      const out = await loadIasCerts();
      expect(out).to.have.length(2);

      const ad = out.find((c) => c.name === 'corporate-ad');
      expect(ad).to.exist;
      expect(ad.kind).to.equal('IAS_SAML');
      expect(ad.subaccountId).to.equal('ias-tenant');
      expect(ad.subaccountName).to.equal('acme.accounts.ondemand.com');
      expect(ad.notAfter).to.match(/^\d{4}-\d{2}-\d{2}$/);
      expect(ad.blastRadius).to.include('IAS trust');

      const partner = out.find((c) => c.name === 'partner-x');
      expect(partner).to.exist;
    });

    it('handles array-shaped /Trust response and skips trusts with no cert material', async () => {
      nock(IAS_HOST).post('/oauth2/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(IAS_HOST).get('/Trust').reply(200, [
        { name: 't-with-cert',  certificate: sampleSelfSignedPem },
        { name: 't-no-cert' /* no cert anywhere */ },
        { name: 't-bad-cert',   signingCertificate: 'not-a-real-pem' },
      ]);

      const out = await loadIasCerts();
      expect(out.map((c) => c.name)).to.deep.equal(['t-with-cert']);
    });

    it('respects IAS_OAUTH_URL when set (separate token endpoint)', async () => {
      process.env.IAS_OAUTH_URL = 'https://oauth.example.com/token';
      nock('https://oauth.example.com').post('/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(IAS_HOST).get('/Trust').reply(200, { values: [] });

      const out = await loadIasCerts();
      expect(out).to.deep.equal([]);
      expect(nock.pendingMocks()).to.deep.equal([]); // both interceptors consumed
    });
  });
});
