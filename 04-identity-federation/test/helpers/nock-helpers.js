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

function mockTrustConfigurations(baseUrl, trusts) {
  return nock(baseUrl)
    .get('/sap/rest/authorization/v2/trust-configurations')
    .reply(200, { trustConfigurations: trusts });
}

function mockRoleCollections(baseUrl, resources) {
  return nock(baseUrl)
    .get('/sap/rest/authorization/v2/role-collections')
    .reply(200, { resources });
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
  mockTrustConfigurations,
  mockRoleCollections,
  disableAllNetwork,
  restoreNetwork,
};
