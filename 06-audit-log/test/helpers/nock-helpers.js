'use strict';

const nock = require('nock');

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function mockUaaToken(uaaUrl, token = 'mock-token', ttl = 3600) {
  return nock(uaaUrl)
    .post('/oauth/token')
    .reply(200, { access_token: token, expires_in: ttl });
}

function mockCisSubaccounts(baseUrl, value) {
  return nock(baseUrl)
    .get('/accounts/v1/subaccounts')
    .reply(200, { value });
}

function mockCisEntitlements(baseUrl, entitledServices) {
  return nock(baseUrl)
    .get('/entitlements/v1/globalAccountAssignments')
    .reply(200, { entitledServices });
}

function disableAllNetwork() {
  nock.disableNetConnect();
}

function restoreNetwork() {
  nock.cleanAll();
  nock.enableNetConnect();
}

module.exports = {
  freshRequire,
  mockUaaToken,
  mockCisSubaccounts,
  mockCisEntitlements,
  disableAllNetwork,
  restoreNetwork,
};
