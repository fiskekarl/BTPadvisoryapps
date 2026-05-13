using { com.btpconsulting.auditlog as db } from '../db/schema';

/**
 * AuditService — unified change timeline across subaccounts + anomaly
 * detection. The deliverable a SOX/ISO walkthrough is built around.
 *
 * Data sources:
 *   • Audit Log Retrieval API per subaccount (via SUBACCOUNT_KEYS).
 *   • cTMS deployment history (when CTMS_URL + CTMS_TOKEN set).
 */
@requires: 'AuditViewer'
service AuditService {

  type EventRow {
    timestamp     : String(30);
    subaccountId  : String(100);
    subaccountName: String(200);
    actor         : String(200);
    action        : String(200);
    resourceType  : String(100);
    resourceId    : String(200);
    sourceIp      : String(50);
    outcome       : String(20);
    anomalyId     : String(50);   // populated when an AnomalyRule matched
    anomalySeverity : String(10);
  }

  type ChangeRow {
    timestamp     : String(30);
    source        : String(20);   // audit | ctms
    subaccountId  : String(100);
    actor         : String(200);
    summary       : String(500);
    detail        : LargeString;
  }

  type AuditSummary {
    totalEvents30d    : Integer;
    criticalEvents30d : Integer;
    afterHoursActions : Integer;
    failedActions     : Integer;
    activeSubaccounts : Integer;
    uniqueActors      : Integer;
  }

  function getSummary() returns AuditSummary;
  function getEvents(days: Integer, subaccountId: String, actor: String) returns array of EventRow;
  function getAnomalies(days: Integer) returns array of EventRow;
  function getChangeTimeline(days: Integer) returns array of ChangeRow;

  @(restrict: [
    { grant: 'READ',             to: 'AuditViewer' },
    { grant: ['WRITE','DELETE'], to: 'AuditAdmin'  }
  ])
  entity AnomalyRules as projection on db.AnomalyRule;

  @(restrict: [
    { grant: 'READ',             to: 'AuditViewer' },
    { grant: ['WRITE','DELETE'], to: 'AuditAdmin'  }
  ])
  entity SavedFilters as projection on db.SavedFilter;
}
