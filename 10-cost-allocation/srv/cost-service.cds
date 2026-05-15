using { com.btpconsulting.costallocation as db } from '../db/schema';

/**
 * CostService — hierarchical cost tree + per-cost-center chargeback invoices.
 *
 * Data sources:
 *   • UAS /reports/v1/monthlySubaccountsCost for the actual costs.
 *   • CIS subaccount labels (costCenter, department) for attribution.
 *   • OrgHierarchyEntry for BU → Product → CostCenter rollups.
 *   • ChargebackPolicy for split rules on shared services.
 */
@requires: 'CostViewer'
service CostService {

  type LeafCost {
    subaccountId   : String(100);
    subaccountName : String(200);
    costCenter     : String(50);
    department     : String(200);
    buName         : String(200);
    productLine    : String(200);
    serviceName    : String(200);
    planName       : String(200);
    cost           : Decimal(18, 2);
    currency       : String(10);
    shared         : Boolean;   // true if cost-center came from chargeback split, not source label
  }

  type TreeNode {
    nodeType   : String(20);    // bu | product | department | costcenter | subaccount
    nodeId     : String(200);
    nodeName   : String(200);
    parentId   : String(200);
    cost       : Decimal(18, 2);
    currency   : String(10);
    childCount : Integer;
  }

  type Invoice {
    costCenter : String(50);
    buName     : String(200);
    department : String(200);
    yearMonth  : String(7);
    directCost : Decimal(18, 2);
    sharedCost : Decimal(18, 2);
    totalCost  : Decimal(18, 2);
    currency   : String(10);
    lineItems  : array of LeafCost;
  }

  type CostSummary {
    totalCost          : Decimal(18, 2);
    currency           : String(10);
    allocatedPct       : Decimal(8, 2);
    costCenters        : Integer;
    businessUnits      : Integer;
    departments        : Integer;
    unallocatedCost    : Decimal(18, 2);
    dataSource         : String(10); // 'live' | 'mixed' | 'mock'
    lastSyncAt         : String(30); // ISO 8601 timestamp of this summary's compute
  }

  function getSummary(yearMonth: String) returns CostSummary;
  function getCostTree(yearMonth: String) returns array of TreeNode;
  function getInvoices(yearMonth: String) returns array of Invoice;

  @(restrict: [
    { grant: 'READ',             to: 'CostViewer' },
    { grant: ['WRITE','DELETE'], to: 'CostAdmin'  }
  ])
  entity ChargebackPolicies as projection on db.ChargebackPolicy;

  @(restrict: [
    { grant: 'READ',             to: 'CostViewer' },
    { grant: ['WRITE','DELETE'], to: 'CostAdmin'  }
  ])
  entity OrgHierarchyEntries as projection on db.OrgHierarchyEntry;
}
