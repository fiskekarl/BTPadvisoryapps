'use strict';

const { expect } = require('chai');
const nock       = require('nock');
const ans        = require('../../srv/lib/notification');

const ANS_URL   = 'https://ans.example.com';
const OAUTH_URL = 'https://uaa.example.com/oauth/token';

function setCreds() {
  process.env.ANS_URL           = ANS_URL;
  process.env.ANS_OAUTH_URL     = OAUTH_URL;
  process.env.ANS_CLIENT_ID     = 'cid';
  process.env.ANS_CLIENT_SECRET = 'sec';
}

function clearCreds() {
  delete process.env.ANS_URL;
  delete process.env.ANS_OAUTH_URL;
  delete process.env.ANS_CLIENT_ID;
  delete process.env.ANS_CLIENT_SECRET;
}

describe('lib/notification (ANS producer)', () => {
  beforeEach(() => { ans._resetDedup(); ans._resetTokenCache(); nock.cleanAll(); });
  afterEach(()  => { clearCreds();      nock.cleanAll(); });

  describe('hasCredentials', () => {
    it('returns true when all four env vars are set', () => {
      setCreds();
      expect(ans.hasCredentials()).to.equal(true);
    });

    it('returns false when any one env var is missing', () => {
      setCreds();
      delete process.env.ANS_CLIENT_SECRET;
      expect(ans.hasCredentials()).to.equal(false);
    });
  });

  describe('notify', () => {
    it('returns { sent: false, reason: "ans-unconfigured" } when no env vars', async () => {
      const r = await ans.notify({ eventType: 'x', subject: 's', body: 'b' });
      expect(r).to.deep.equal({ sent: false, reason: 'ans-unconfigured' });
    });

    it('posts a resource event with bearer token when credentials are present', async () => {
      setCreds();
      nock('https://uaa.example.com').post('/oauth/token')
        .reply(200, { access_token: 'tok-1', expires_in: 3600 });
      const scope = nock(ANS_URL, { reqheaders: { Authorization: 'Bearer tok-1' } })
        .post('/cf/producer/v1/resource-events', (body) => body.subject === 'hi')
        .reply(202, { eventId: 'e-1' });

      const r = await ans.notify({
        eventType: 'cert.expiry.critical', severity: 'ERROR',
        subject: 'hi', body: 'something is wrong',
        resource: { resourceName: 'r1', resourceType: 't', resourceInstance: 'i' },
      });

      expect(r.sent).to.equal(true);
      expect(scope.isDone()).to.equal(true);
    });

    it('dedups identical events within the TTL window', async () => {
      setCreds();
      nock('https://uaa.example.com').post('/oauth/token').optionally()
        .reply(200, { access_token: 'tok', expires_in: 3600 });
      nock(ANS_URL).post('/cf/producer/v1/resource-events').once().reply(202);

      const evt = {
        eventType: 'cert.expiry.critical', severity: 'ERROR',
        subject:   'hi', body: 'b',
        resource: { resourceName: 'r1', resourceType: 't', resourceInstance: 'i' },
      };
      const a = await ans.notify(evt);
      const b = await ans.notify(evt);

      expect(a.sent).to.equal(true);
      expect(b).to.deep.equal({ sent: false, reason: 'dedup' });
    });

    it('different resources produce different dedup keys', async () => {
      setCreds();
      nock('https://uaa.example.com').post('/oauth/token').optionally()
        .reply(200, { access_token: 'tok', expires_in: 3600 });
      nock(ANS_URL).post('/cf/producer/v1/resource-events').twice().reply(202);

      const a = await ans.notify({ eventType: 't', severity: 'ERROR', subject: 's', body: 'b',
        resource: { resourceName: 'r1', resourceInstance: 'i1' } });
      const b = await ans.notify({ eventType: 't', severity: 'ERROR', subject: 's', body: 'b',
        resource: { resourceName: 'r1', resourceInstance: 'i2' } });

      expect(a.sent).to.equal(true);
      expect(b.sent).to.equal(true);
    });

    it('returns { sent: false, reason: "transport-error" } on network failure', async () => {
      setCreds();
      nock('https://uaa.example.com').post('/oauth/token')
        .reply(200, { access_token: 'tok', expires_in: 3600 });
      nock(ANS_URL).post('/cf/producer/v1/resource-events').replyWithError('boom');

      const r = await ans.notify({ eventType: 'x', severity: 'ERROR', subject: 's', body: 'b' });
      expect(r.sent).to.equal(false);
      expect(r.reason).to.equal('transport-error');
    });
  });

  describe('notifyFindings', () => {
    it('counts attempted / sent / deduped', async () => {
      setCreds();
      nock('https://uaa.example.com').post('/oauth/token').optionally()
        .reply(200, { access_token: 'tok', expires_in: 3600 });
      nock(ANS_URL).post('/cf/producer/v1/resource-events').twice().reply(202);

      // Same resource × 3 → first sent, second + third deduped.
      const findings = [1, 2, 3, 4].map((i) => ({ id: i, name: i === 4 ? 'distinct' : 'same' }));
      const result = await ans.notifyFindings(findings, (f) => ({
        eventType: 'x', severity: 'ERROR', subject: 's', body: 'b',
        resource: { resourceName: f.name, resourceInstance: f.name },
      }));

      expect(result.attempted).to.equal(4);
      expect(result.sent).to.equal(2);    // 'same' once, 'distinct' once
      expect(result.deduped).to.equal(2); // two duplicates of 'same'
    });

    it('skips findings whose toEvent returns null', async () => {
      setCreds();
      const result = await ans.notifyFindings([1, 2, 3], (n) => (n === 2 ? null : {
        eventType: 'x', severity: 'ERROR', subject: 's', body: 'b',
        resource: { resourceName: String(n) },
      }));
      // Only n=1 and n=3 produced events; both would actually try to post
      // but ANS isn't configured here so they return { sent: false }.
      // What we're really asserting: skip n=2 entirely.
      expect(result.attempted).to.equal(2);
    });
  });
});
