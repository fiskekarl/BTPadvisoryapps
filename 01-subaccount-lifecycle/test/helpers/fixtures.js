'use strict';

const cisSubaccounts = [
  {
    guid: 'sub-001', displayName: 'Production', state: 'STARTED', region: 'eu10',
    enabledEnvironments: ['cloudfoundry'], parentDisplayName: 'Global Account',
    usedForProduction: 'USED_FOR_PRODUCTION', createdDate: '2023-01-15T00:00:00Z',
    labels: { costCenter: ['CC-1001'], department: ['IT Operations'] },
  },
  {
    guid: 'sub-002', displayName: 'Dev', state: 'STARTED', region: 'eu10',
    enabledEnvironments: ['kyma'], parentDisplayName: 'Global Account',
    usedForProduction: 'NOT_USED_FOR_PRODUCTION', createdDate: '2023-02-01T00:00:00Z',
    labels: { tier: ['dev'] },
  },
];

const saKeys = [
  { subaccountId: 'sub-001', subaccountName: 'Production', tier: 'prod',
    auditLog: { uaa: { clientid: 'c', clientsecret: 's', url: 'https://uaa.example.com' }, url: 'https://audit.example.com' },
    serviceManager: { uaa: { clientid: 'c', clientsecret: 's', url: 'https://uaa.example.com' }, sm_url: 'https://sm.example.com' },
    xsuaa: { uaa: { clientid: 'c', clientsecret: 's', url: 'https://uaa.example.com' }, apiurl: 'https://xsuaa.example.com' } },
];

module.exports = { cisSubaccounts, saKeys };
