'use strict';

const { expect } = require('chai');
const nock = require('nock');
const { freshRequire, disableAllNetwork, restoreNetwork } = require('../helpers/nock-helpers');

const MODULE_PATH = '../../srv/lib/aicore-client';

const AI_URL    = 'https://ai.example.com';
const OAUTH_URL = 'https://uaa.example.com/oauth/token';

describe('lib/aicore-client', () => {
  let aicore;

  beforeEach(() => {
    process.env.AI_CORE_URL           = AI_URL;
    process.env.AI_CORE_OAUTH_URL     = OAUTH_URL;
    process.env.AI_CORE_CLIENT_ID     = 'cid';
    process.env.AI_CORE_CLIENT_SECRET = 'sec';
    aicore = freshRequire(MODULE_PATH);
    disableAllNetwork();
  });

  afterEach(() => {
    restoreNetwork();
    delete process.env.AI_CORE_URL;
    delete process.env.AI_CORE_OAUTH_URL;
    delete process.env.AI_CORE_CLIENT_ID;
    delete process.env.AI_CORE_CLIENT_SECRET;
  });

  describe('hasCredentials', () => {
    it('returns true when all four env vars are set', () => {
      expect(aicore.hasCredentials()).to.equal(true);
    });

    it('returns false when AI_CORE_URL missing', () => {
      delete process.env.AI_CORE_URL;
      // freshRequire to re-read env
      aicore = freshRequire(MODULE_PATH);
      expect(aicore.hasCredentials()).to.equal(false);
    });
  });

  describe('listResourceGroups', () => {
    it('returns the resources array', async () => {
      nock('https://uaa.example.com').post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(AI_URL).get('/v2/admin/resourceGroups').reply(200, { resources: [{ id: 'rg-1' }] });

      const result = await aicore.listResourceGroups();
      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('rg-1');
    });
  });

  describe('listDeployments', () => {
    it('sends AI-Resource-Group header', async () => {
      nock('https://uaa.example.com').post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      const scope = nock(AI_URL, { reqheaders: { 'ai-resource-group': 'finance' } })
        .get('/v2/lm/deployments').reply(200, { resources: [{ id: 'dep-1' }] });
      const result = await aicore.listDeployments('finance');
      expect(result[0].id).to.equal('dep-1');
      expect(scope.isDone()).to.equal(true);
    });

    it('throws for HTTP 4xx', async () => {
      nock('https://uaa.example.com').post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(AI_URL).get('/v2/lm/deployments').reply(404, { error: 'not found' });

      let err;
      try { await aicore.listDeployments('rg-x'); } catch (e) { err = e; }
      expect(err).to.exist;
      expect(err.code).to.equal(404);
    });
  });

  describe('listConfigurations', () => {
    it('returns the resources array', async () => {
      nock('https://uaa.example.com').post('/oauth/token').reply(200, { access_token: 't', expires_in: 3600 });
      nock(AI_URL).get('/v2/lm/configurations').reply(200, { resources: [{ id: 'cfg-1' }] });

      const result = await aicore.listConfigurations('rg-1');
      expect(result[0].id).to.equal('cfg-1');
    });
  });
});
