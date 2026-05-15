'use strict';

const entitledServices = [
  {
    name: 'hana-cloud',
    displayName: 'SAP HANA Cloud',
    servicePlans: [
      { name: 'hana', displayName: 'hana', amount: 100, unlimited: false, metric: 'GB', category: 'ELASTIC_SERVICE' },
    ],
  },
  {
    name: 'xsuaa',
    displayName: 'XSUAA',
    servicePlans: [
      { name: 'application', displayName: 'application', unlimited: true, category: 'ELASTIC_SERVICE' },
    ],
  },
];

const monthlyUsageMonth = [
  { serviceName: 'SAP HANA Cloud', planName: 'hana', usage: 40 },
];

const monthlyCostMonth = [
  { subaccountId: 'sub-001', subaccountName: 'Production', serviceName: 'SAP HANA Cloud', planName: 'hana', cost: 1280, currency: 'EUR' },
];

module.exports = { entitledServices, monthlyUsageMonth, monthlyCostMonth };
