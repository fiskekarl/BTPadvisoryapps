'use strict';

const cisSubaccounts = [
  { guid: 'sub-001', displayName: 'Production', labels: { costCenter: ['CC-1001'], department: ['IT Operations'] } },
  { guid: 'sub-002', displayName: 'QA',          labels: { costCenter: ['CC-1002'], department: ['Software Eng'] } },
  { guid: 'sub-009', displayName: 'Unlabeled',   labels: {} },
];

const uasCostRows = [
  { subaccountId: 'sub-001', subaccountName: 'Production', serviceName: 'SAP HANA Cloud', planName: 'hana', cost: 1280, currency: 'EUR' },
  { subaccountId: 'sub-002', subaccountName: 'QA',         serviceName: 'SAP HANA Cloud', planName: 'hana', cost: 640,  currency: 'EUR' },
];

module.exports = { cisSubaccounts, uasCostRows };
