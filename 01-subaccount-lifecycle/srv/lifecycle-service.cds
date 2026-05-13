using { com.btpconsulting.subaccountlifecycle as db } from '../db/schema';

/**
 * LifecycleService — surfaces subaccount inventory, drift findings, and the
 * Audit Log activity timeline for the engagement workshop and ongoing
 * governance.
 *
 * Data sources (read-only against the client's own BTP tenant):
 *   • CIS Accounts API — /accounts/v1/subaccounts (and Directories)
 *   • CIS Entitlements API — /entitlements/v1/globalAccountAssignments
 *   • Audit Log Retrieval Service — /audit-log/v2/auditlogrecords
 *   • XSUAA users API per subaccount (for role-collection enumeration)
 */
@requires: 'LifecycleViewer'
service LifecycleService {

  // ─── Return Types ───────────────────────────────────────────────────────────

  /** One row per subaccount in the global account. */
  type SubaccountRow {
    subaccountId        : String(100);
    displayName         : String(200);
    state               : String(20);    // STARTED | STOPPED | CREATING | DELETING
    region              : String(50);
    environment         : String(50);    // CF | Kyma | Other
    tier                : String(20);    // inferred from labels: dev | qa | prod | unknown
    parentName          : String(200);
    costCenter          : String(50);
    department          : String(200);
    createdAt           : String(10);    // YYYY-MM-DD
    lastActivityAt      : String(10);    // most recent audit-log event date
    daysInactive        : Integer;       // null if never observed inactive
    usedForProd         : String(30);
    serviceInstanceCount: Integer;
    roleCollectionCount : Integer;
    activeUserCount     : Integer;       // last 30 days
  }

  /** A single drift finding produced by comparing a subaccount to its tier baseline. */
  type DriftFinding {
    fingerprint  : String(200);  // stable hash; matched by IgnoreRule
    subaccountId : String(100);
    tier         : String(20);
    resourceType : String(50);   // service-instance | role-collection | env-var | label
    severity     : String(10);   // info | warn | error
    summary      : String(300);
    detail       : LargeString;  // JSON diff
    ignored      : Boolean;
    ignoreReason : String(500);
  }

  /** A single audit-log entry, normalised across subaccounts. */
  type AuditEntry {
    timestamp     : String(30);   // ISO 8601
    subaccountId  : String(100);
    actor         : String(200);  // user or service principal
    action        : String(100);  // canonical action name
    resourceType  : String(100);
    resourceId    : String(200);
    sourceIp      : String(50);
    outcome       : String(20);   // success | failure
  }

  /** Top-line KPIs for the dashboard tiles. */
  type LifecycleSummary {
    totalSubaccounts    : Integer;
    activeSubaccounts   : Integer;   // STARTED with activity in last 30d
    inactiveSubaccounts : Integer;   // STARTED but no activity in 90+ days
    stoppedSubaccounts  : Integer;
    driftFindings       : Integer;   // not-ignored
    criticalDrifts      : Integer;   // severity = error, not ignored
    auditEvents30d      : Integer;
  }

  // ─── Functions ──────────────────────────────────────────────────────────────

  /** Top-line dashboard KPIs. */
  function getSummary() returns LifecycleSummary;

  /** Full subaccount inventory enriched with audit-log activity. */
  function getSubaccounts() returns array of SubaccountRow;

  /**
   * Drift findings for one tier (or all tiers when tier is omitted).
   * Each subaccount in the tier is diffed against the DriftBaseline rows.
   */
  function getDrift(tier: String) returns array of DriftFinding;

  /**
   * Audit-log activity for one subaccount (or all when omitted) over the
   * trailing N days (default 30, max 90).
   */
  function getAuditActivity(subaccountId: String, days: Integer) returns array of AuditEntry;

  // ─── Persisted CRUD ─────────────────────────────────────────────────────────

  @(restrict: [
    { grant: 'READ',             to: 'LifecycleViewer' },
    { grant: ['WRITE','DELETE'], to: 'LifecycleAdmin'  }
  ])
  entity DriftBaselines as projection on db.DriftBaseline;

  @(restrict: [
    { grant: 'READ',             to: 'LifecycleViewer' },
    { grant: ['WRITE','DELETE'], to: 'LifecycleAdmin'  }
  ])
  entity IgnoreRules as projection on db.IgnoreRule;
}
