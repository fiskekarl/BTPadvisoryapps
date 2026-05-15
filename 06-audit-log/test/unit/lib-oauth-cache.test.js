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
    expect(err).to.exist;
    expect(err.message).to.match(/clientid/i);
  });

  it('fetches a token and caches it', async () => {
    const scope = nock('https://uaa.example.com')
      .post('/oauth/token')
      .reply(200, { access_token: 'tok-1', expires_in: 3600 });

    const uaa = { clientid: 'cid', clientsecret: 'sec', url: 'https://uaa.example.com' };
    const t1 = await getOAuthToken(uaa);
    const t2 = await getOAuthToken(uaa);

    expect(t1).to.equal('tok-1');
    expect(t2).to.equal('tok-1');
    expect(scope.isDone()).to.equal(true);
  });
});
