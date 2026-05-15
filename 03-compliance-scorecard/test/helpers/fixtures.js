'use strict';

const subaccounts = [
  { subaccountId: 'sub-001', displayName: 'Production',  tier: 'prod',    usedForProd: 'USED_FOR_PRODUCTION',     costCenter: 'CC-1001', department: 'IT Ops',       parentName: 'EU Cloud Directory', daysInactive: 0   },
  { subaccountId: 'sub-002', displayName: 'QA',          tier: 'qa',      usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: 'CC-1002', department: 'Software',     parentName: 'EU Cloud Directory', daysInactive: 2   },
  { subaccountId: 'sub-003', displayName: 'Dev',         tier: 'dev',     usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: 'CC-1002', department: 'Software',     parentName: 'EU Cloud Directory', daysInactive: 0   },
  { subaccountId: 'sub-004', displayName: 'Integration', tier: 'prod',    usedForProd: 'USED_FOR_PRODUCTION',     costCenter: 'CC-1004', department: 'Architecture', parentName: 'EU Cloud Directory', daysInactive: 5   },
  { subaccountId: 'sub-005', displayName: 'Sandbox',     tier: 'dev',     usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: '',        department: '',             parentName: 'Global Account',     daysInactive: 120 },
  { subaccountId: 'sub-006', displayName: 'Unlabeled',   tier: 'unknown', usedForProd: 'UNSET',                   costCenter: '',        department: '',             parentName: '',                   daysInactive: 0   },
];

const destinations = [
  { subaccountId: 'sub-001', name: 's4-erp',     authentication: 'BasicAuthentication',     url: 'https://s4.acme.local',          proxyType: 'OnPremise', tier: 'prod' },
  { subaccountId: 'sub-001', name: 'sf-success', authentication: 'OAuth2ClientCredentials', url: 'https://api.successfactors.com', proxyType: 'Internet',  tier: 'prod' },
  { subaccountId: 'sub-001', name: 'leaked-old', authentication: 'NoAuthentication',        url: 'http://insecure.example.com',    proxyType: 'Internet',  tier: 'prod' },
  { subaccountId: 'sub-002', name: 's4-qa',      authentication: 'BasicAuthentication',     url: 'https://s4-qa.acme.local',       proxyType: 'OnPremise', tier: 'qa'   },
  { subaccountId: 'sub-003', name: 'mock-svc',   authentication: 'NoAuthentication',        url: 'https://mock.acme.dev',          proxyType: 'Internet',  tier: 'dev'  },
];

const canonicalRules = {
  costCenterRequired: {
    id: 'CC', title: 'Cost center', category: 'governance', severity: 'error',
    enabled: true, kind: 'label-required',
    paramsJson: '{"scope":"prod","label":"costCenter"}',
  },
  noBasicAuthProd: {
    id: 'BA', title: 'No basic auth in prod', category: 'identity', severity: 'error',
    enabled: true, kind: 'destination-auth-forbidden',
    paramsJson: '{"scope":"prod","forbidden":["BasicAuthentication"]}',
  },
  inactive90: {
    id: 'IN', title: 'Inactive 90d', category: 'cost', severity: 'warn',
    enabled: true, kind: 'max-days-inactive',
    paramsJson: '{"maxDays":90}',
  },
  namePattern: {
    id: 'NP', title: 'Tier in name', category: 'governance', severity: 'info',
    enabled: true, kind: 'name-pattern',
    paramsJson: '{"pattern":"(prod|qa|test|dev|sandbox)","flags":"i"}',
  },
};

module.exports = { subaccounts, destinations, canonicalRules };
