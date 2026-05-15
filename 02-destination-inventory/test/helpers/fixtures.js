'use strict';

const destinations = [
  { subaccountId: 'sub-001', subaccountName: 'Production', name: 's4', authentication: 'BasicAuthentication', proxyType: 'OnPremise' },
  { subaccountId: 'sub-002', subaccountName: 'QA',         name: 'sf', authentication: 'OAuth2',              proxyType: 'Internet'  },
];

module.exports = { destinations };
