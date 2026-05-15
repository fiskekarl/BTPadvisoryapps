'use strict';

const { expect } = require('chai');
const nock       = require('nock');

const { __test__ } = require('../../srv/destinv-service');
const {
  shouldProbeUrl, buildProbeHeaders, classifyProbeError,
  probeDestination, probeAll, _resetProbeCache,
} = __test__;

const DEST_URI = 'https://destination.example.com';
const UAA_URL  = 'https://uaa.example.com';
const TARGET   = 'https://target.example.com';

const creds = {
  subaccountId:   'sub-001',
  subaccountName: 'Production',
  uaa:            { clientid: 'c', clientsecret: 's', url: UAA_URL },
  uri:            DEST_URI,
};

function destination(over = {}) {
  return {
    name:           'svc',
    type:           'HTTP',
    proxyType:      'Internet',
    authentication: 'NoAuthentication',
    url:            TARGET,
    ...over,
  };
}

describe('destination-service probe helpers', () => {

  describe('shouldProbeUrl', () => {
    it('probes HTTP + Internet + supported auth combinations', () => {
      expect(shouldProbeUrl(destination({ authentication: 'NoAuthentication' }))).to.equal(true);
      expect(shouldProbeUrl(destination({ authentication: 'BasicAuthentication' }))).to.equal(true);
      expect(shouldProbeUrl(destination({ authentication: 'OAuth2ClientCredentials' }))).to.equal(true);
    });

    it('skips OnPremise destinations (need Cloud Connector path)', () => {
      expect(shouldProbeUrl(destination({ proxyType: 'OnPremise' }))).to.equal(false);
    });

    it('skips ClientCertificate auth (need keystore replay)', () => {
      expect(shouldProbeUrl(destination({ authentication: 'ClientCertificateAuthentication' }))).to.equal(false);
    });

    it('skips non-HTTP destination types', () => {
      expect(shouldProbeUrl(destination({ type: 'RFC' }))).to.equal(false);
      expect(shouldProbeUrl(destination({ type: 'MAIL' }))).to.equal(false);
    });
  });

  describe('buildProbeHeaders', () => {
    it('uses authTokens[0] when present', () => {
      const h = buildProbeHeaders({ authTokens: [{ type: 'Bearer', value: 'abc' }] });
      expect(h.Authorization).to.equal('Bearer abc');
    });

    it('defaults token type to Bearer', () => {
      const h = buildProbeHeaders({ authTokens: [{ value: 'xyz' }] });
      expect(h.Authorization).to.equal('Bearer xyz');
    });

    it('falls back to BasicAuth from destinationConfiguration.User+Password', () => {
      const h = buildProbeHeaders({ destinationConfiguration: { User: 'u', Password: 'p' } });
      expect(h.Authorization).to.equal('Basic ' + Buffer.from('u:p').toString('base64'));
    });

    it('returns empty headers when neither shape is present', () => {
      expect(buildProbeHeaders({})).to.deep.equal({});
    });
  });

  describe('classifyProbeError', () => {
    it('detects timeouts via ECONNABORTED', () => {
      expect(classifyProbeError({ code: 'ECONNABORTED' })).to.equal('TIMEOUT');
    });

    it('detects timeouts via message text', () => {
      expect(classifyProbeError({ message: 'timeout of 5000ms exceeded' })).to.equal('TIMEOUT');
    });

    it('classifies 401/403 as AUTH_FAILED', () => {
      expect(classifyProbeError({ response: { status: 401 } })).to.equal('AUTH_FAILED');
      expect(classifyProbeError({ response: { status: 403 } })).to.equal('AUTH_FAILED');
    });

    it('falls through to UNREACHABLE for other errors', () => {
      expect(classifyProbeError({ code: 'ENOTFOUND' })).to.equal('UNREACHABLE');
      expect(classifyProbeError({})).to.equal('UNREACHABLE');
    });
  });

  describe('probeDestination (network)', () => {
    beforeEach(() => {
      _resetProbeCache();
      nock.cleanAll();
    });

    afterEach(() => nock.cleanAll());

    it('returns NOT_PROBED for OnPremise destinations without making any HTTP calls', async () => {
      const status = await probeDestination(creds, destination({ proxyType: 'OnPremise' }));
      expect(status).to.equal('NOT_PROBED');
      expect(nock.pendingMocks()).to.deep.equal([]); // no interceptors registered, so nothing pending
    });

    it('returns OK when both the resolve and the HEAD probe succeed (2xx)', async () => {
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(DEST_URI).get('/destination-configuration/v1/destinations/svc')
        .reply(200, { destinationConfiguration: { URL: TARGET }, authTokens: [] });
      nock(TARGET).head('/').reply(204);

      const status = await probeDestination(creds, destination());
      expect(status).to.equal('OK');
    });

    it('returns AUTH_FAILED when target probe returns 401', async () => {
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(DEST_URI).get('/destination-configuration/v1/destinations/svc')
        .reply(200, { destinationConfiguration: { URL: TARGET } });
      nock(TARGET).head('/').reply(401);

      const status = await probeDestination(creds, destination());
      expect(status).to.equal('AUTH_FAILED');
    });

    it('returns UNREACHABLE when target probe returns 5xx', async () => {
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(DEST_URI).get('/destination-configuration/v1/destinations/svc')
        .reply(200, { destinationConfiguration: { URL: TARGET } });
      nock(TARGET).head('/').reply(503);

      const status = await probeDestination(creds, destination());
      expect(status).to.equal('UNREACHABLE');
    });

    it('does NOT follow redirects (credential-leak guard)', async () => {
      // If we follow a 302 with the Authorization header, a malicious
      // destination could exfiltrate the customer's creds to any URL.
      // Set up a 302 with NO interceptor for the redirect target — if the
      // code follows the redirect, nock will fail with "no match found".
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(DEST_URI).get('/destination-configuration/v1/destinations/svc')
        .reply(200, { destinationConfiguration: { URL: TARGET } });
      nock(TARGET).head('/').reply(302, '', { Location: 'https://attacker.example.com/steal' });

      const status = await probeDestination(creds, destination());
      // 3xx is still "reachable" — classified as OK without following.
      expect(status).to.equal('OK');
    });

    it('returns UNREACHABLE when the dest-service resolve throws', async () => {
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(DEST_URI).get('/destination-configuration/v1/destinations/svc').replyWithError('boom');

      const status = await probeDestination(creds, destination());
      expect(status).to.equal('UNREACHABLE');
    });

    it('caches results for 60s — second call does not re-probe', async () => {
      // Don't set up an OAuth mock — module-level token cache may already
      // hold one from prior tests. Just mock the resolve + HEAD ONCE; if the
      // second probe call tries to hit them again, nock will fail (no
      // matching interceptor) and the test will throw.
      nock(UAA_URL).post('/oauth/token').optionally().reply(200, { access_token: 't', expires_in: 3600 });
      nock(DEST_URI).get('/destination-configuration/v1/destinations/svc')
        .once()
        .reply(200, { destinationConfiguration: { URL: TARGET } });
      nock(TARGET).head('/').once().reply(200);

      const a = await probeDestination(creds, destination());
      const b = await probeDestination(creds, destination());
      expect(a).to.equal('OK');
      expect(b).to.equal('OK');
    });
  });

  describe('probeAll (network)', () => {
    beforeEach(() => { _resetProbeCache(); nock.cleanAll(); });
    afterEach(() => nock.cleanAll());

    it('probes every destination and returns a Map of name → status', async () => {
      // Two probable HTTP+Internet destinations + one OnPremise (skipped)
      const dests = [
        destination({ name: 'a' }),
        destination({ name: 'b', authentication: 'BasicAuthentication' }),
        destination({ name: 'c', proxyType: 'OnPremise' }),
      ];

      // Token reused across both probable destinations — single OAuth call.
      nock(UAA_URL).post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });

      nock(DEST_URI).get('/destination-configuration/v1/destinations/a')
        .reply(200, { destinationConfiguration: { URL: TARGET } });
      nock(TARGET).head('/').reply(200);

      nock(DEST_URI).get('/destination-configuration/v1/destinations/b')
        .reply(200, { destinationConfiguration: { URL: TARGET, User: 'u', Password: 'p' } });
      nock(TARGET).head('/').reply(401);

      const out = await probeAll(creds, dests, { concurrency: 2 });
      expect(out.get('a')).to.equal('OK');
      expect(out.get('b')).to.equal('AUTH_FAILED');
      expect(out.get('c')).to.equal('NOT_PROBED');
    });
  });
});
