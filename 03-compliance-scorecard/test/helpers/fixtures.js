'use strict';

const subaccounts = [
  { subaccountId: 'sub-001', displayName: 'Production',  tier: 'prod', usedForProd: 'USED_FOR_PRODUCTION',     costCenter: 'CC-1001', department: 'IT Ops',       daysInactive: 0   },
  { subaccountId: 'sub-002', displayName: 'QA',          tier: 'qa',   usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: 'CC-1002', department: 'Software',     daysInactive: 2   },
  { subaccountId: 'sub-003', displayName: 'Dev',         tier: 'dev',  usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: 'CC-1002', department: 'Software',     daysInactive: 0   },
  { subaccountId: 'sub-004', displayName: 'Integration', tier: 'prod', usedForProd: 'USED_FOR_PRODUCTION',     costCenter: 'CC-1004', department: 'Architecture', daysInactive: 5   },
  { subaccountId: 'sub-005', displayName: 'Sandbox',     tier: 'dev',  usedForProd: 'NOT_USED_FOR_PRODUCTION', costCenter: '',        department: '',             daysInactive: 120 },
];

const destinations = [
  { subaccountId: 'sub-001', name: 's4-erp',     authentication: 'BasicAuthentication',     tier: 'prod' },
  { subaccountId: 'sub-001', name: 'sf-success', authentication: 'OAuth2ClientCredentials', tier: 'prod' },
  { subaccountId: 'sub-002', name: 's4-qa',      authentication: 'BasicAuthentication',     tier: 'qa'   },
  { subaccountId: 'sub-003', name: 'mock-svc',   authentication: 'NoAuthentication',        tier: 'dev'  },
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
