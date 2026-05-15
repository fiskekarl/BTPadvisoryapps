'use strict';

const cisSubaccounts = [
  {
    guid: 'sub-001', displayName: 'Production', state: 'STARTED', region: 'eu10',
    parentDisplayName: 'Global Account', usedForProduction: 'USED_FOR_PRODUCTION',
    labels: { tier: ['prod'] },
  },
  {
    guid: 'sub-002', displayName: 'QA', state: 'STARTED', region: 'eu10',
    parentDisplayName: 'Global Account', usedForProduction: 'NOT_USED_FOR_PRODUCTION',
    labels: { tier: ['qa'] },
  },
  {
    guid: 'sub-003', displayName: 'Dev', state: 'STARTED', region: 'eu10',
    parentDisplayName: 'Global Account', usedForProduction: 'NOT_USED_FOR_PRODUCTION',
    labels: { tier: ['dev'] },
  },
];

const saKeys = [
  {
    subaccountId: 'sub-001',
    subaccountName: 'Production',
    tier: 'prod',
    xsuaa: {
      uaa: { clientid: 'c', clientsecret: 's', url: 'https://uaa.example.com' },
      apiurl: 'https://xsuaa-prod.example.com',
    },
  },
  {
    subaccountId: 'sub-003',
    subaccountName: 'Dev',
    tier: 'dev',
    xsuaa: {
      uaa: { clientid: 'c', clientsecret: 's', url: 'https://uaa.example.com' },
      apiurl: 'https://xsuaa-dev.example.com',
    },
  },
];

module.exports = { cisSubaccounts, saKeys };
