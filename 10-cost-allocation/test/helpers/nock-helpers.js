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

function mockUasSubaccountCost(baseUrl, fromDate, toDate, content) {
  return nock(baseUrl)
    .get('/reports/v1/monthlySubaccountsCost')
    .query({ fromDate: String(fromDate), toDate: String(toDate) })
    .reply(200, { content });
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
  mockUasSubaccountCost,
  disableAllNetwork,
  restoreNetwork,
};
