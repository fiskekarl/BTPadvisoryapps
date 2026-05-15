'use strict';

const { expect } = require('chai');
const nock = require('nock');
const { freshRequire, disableAllNetwork, restoreNetwork } = require('../helpers/nock-helpers');

const MODULE_PATH = '../../srv/lib/oauth-cache';

describe('lib/oauth-cache', () => {
  let getOAuthToken;

  beforeEach(() => {
    ({ getOAuthToken } = freshRequire(MODULE_PATH));
    disableAllNetwork();
  });

  afterEach(() => {
    restoreNetwork();
  });

  it('throws when uaa.clientid is missing', async () => {
    let err;
    try { await getOAuthToken({}); } catch (e) { err = e; }
    expect(err, 'expected an error').to.exist;
    expect(err.message).to.match(/clientid/i);
  });

  it('throws when uaa is null/undefined', async () => {
    let err;
    try { await getOAuthToken(null); } catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.message).to.match(/clientid/i);
  });

  it('fetches a token and caches it across calls', async () => {
    const scope = nock('https://uaa.example.com')
      .post('/oauth/token')
      .reply(200, { access_token: 'tok-1', expires_in: 3600 });

    const uaa = { clientid: 'cid', clientsecret: 'sec', url: 'https://uaa.example.com' };
    const t1 = await getOAuthToken(uaa);
    const t2 = await getOAuthToken(uaa);

    expect(t1).to.equal('tok-1');
    expect(t2).to.equal('tok-1');
    expect(scope.isDone()).to.equal(true);     // exactly one network call satisfied the mock
    expect(nock.pendingMocks()).to.deep.equal([]); // no other pending interceptors
  });

  it('partitions the cache by clientid', async () => {
    nock('https://uaa.example.com')
      .post('/oauth/token').reply(200, { access_token: 'token-A', expires_in: 3600 })
      .post('/oauth/token').reply(200, { access_token: 'token-B', expires_in: 3600 });

    const a = await getOAuthToken({ clientid: 'a', clientsecret: 's', url: 'https://uaa.example.com' });
    const b = await getOAuthToken({ clientid: 'b', clientsecret: 's', url: 'https://uaa.example.com' });

    expect(a).to.equal('token-A');
    expect(b).to.equal('token-B');
    expect(a).to.not.equal(b);
  });

  it('refetches when the cached token has expired', async () => {
    nock('https://uaa.example.com')
      .post('/oauth/token').reply(200, { access_token: 'first',  expires_in: 60 })
      .post('/oauth/token').reply(200, { access_token: 'second', expires_in: 3600 });

    const uaa = { clientid: 'cid', clientsecret: 'sec', url: 'https://uaa.example.com' };
    // expires_in: 60 → cache.expiresAt = now + (60 - 60) * 1000 = now → immediately stale.
    const t1 = await getOAuthToken(uaa);
    const t2 = await getOAuthToken(uaa);

    expect(t1).to.equal('first');
    expect(t2).to.equal('second');
  });
});
