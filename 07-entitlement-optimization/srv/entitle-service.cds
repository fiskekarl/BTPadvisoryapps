using { com.btpconsulting.entitlement as db } from '../db/schema';

/**
 * EntitleService — entitlement utilization curves + downgrade recommendations.
 *
 * Data sources:
 *   • CIS Entitlements API for entitled quotas.
 *   • UAS /reports/v1/monthlyUsage for 12-month usage history.
 *   • ContractAnchor table for unit prices (operator-entered per engagement).
 */
@requires: 'EntitleViewer'
service EntitleService {

  type UsagePoint {
    yearMonth      : String(7);
    usage          : Decimal(18, 4);
  }

  type EntitlementRow {
    serviceName    : String(200);
    planName       : String(200);
    unit           : String(100);
    entitled       : Decimal(18, 4);   // null when unlimited
    unlimited      : Boolean;
    avgUsage       : Decimal(18, 4);   // mean over the window
    peakUsage      : Decimal(18, 4);
    utilizationPct : Decimal(8, 2);    // avgUsage / entitled * 100
    history        : array of UsagePoint;
    renewalDate    : Date;
    unitPrice      : Decimal(18, 4);
    currency       : String(10);
    recommendation : String(20);       // KEEP | DOWNGRADE | INVESTIGATE
    suggestedQuota : Decimal(18, 4);
    annualSaving   : Decimal(18, 2);   // currency × (entitled - suggested) — null when no price
    category       : String(50);
  }

  type RenewalAlert {
    serviceName  : String(200);
    planName     : String(200);
    renewalDate  : Date;
    daysToRenewal: Integer;
    avgUsage     : Decimal(18, 4);
    entitled     : Decimal(18, 4);
    recommendation : String(20);
    annualSaving : Decimal(18, 2);
    currency     : String(10);
  }

  type EntitleSummary {
    totalEntitlements    : Integer;
    underutilized        : Integer;   // < 50% utilization
    overutilized         : Integer;   // > 85% utilization
    renewalsNext60d      : Integer;
    estimatedAnnualSaving: Decimal(18, 2);
    currency             : String(10);
    dataSource           : String(10); // 'live' | 'mixed' | 'mock'
    lastSyncAt           : String(30); // ISO 8601 timestamp of this summary's compute
  }

  function getSummary(months: Integer)         returns EntitleSummary;
  function getEntitlements(months: Integer)    returns array of EntitlementRow;
  function getRenewalAlerts(daysAhead: Integer) returns array of RenewalAlert;

  @(restrict: [
    { grant: 'READ',             to: 'EntitleViewer' },
    { grant: ['WRITE','DELETE'], to: 'EntitleAdmin'  }
  ])
  entity ContractAnchors as projection on db.ContractAnchor;

  @(restrict: [
    { grant: 'READ',             to: 'EntitleViewer' },
    { grant: ['WRITE','DELETE'], to: 'EntitleAdmin'  }
  ])
  entity AcknowledgedRecommendations as projection on db.AcknowledgedRecommendation;
}
