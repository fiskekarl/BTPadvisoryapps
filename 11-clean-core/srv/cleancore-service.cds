using { com.btpconsulting.cleancore as db } from '../db/schema';

/**
 * CleanCoreService — clean-core compliance dashboard backed by an
 * ABAP-side scanner package transported into the customer's S/4 system.
 *
 * Architecture (different from other arsenal apps):
 *   1. ABAP scanner package (one-time transport) runs ATC-based clean-core
 *      checks and exposes results via /sap/bc/rest/btp-advisory/cleancore-scan.
 *   2. CAP service calls that endpoint via Cloud Connector destination
 *      "s4-cleancore-scanner" (configured per client).
 *   3. Results are normalized and persisted as ScanResult rows.
 *
 * Falls back to mock data when no S/4 destination is reachable so the UI
 * can demo end-to-end without a customer system.
 */
@requires: 'CleanCoreViewer'
service CleanCoreService {

  type ExtensionRow {
    objectType      : String(20);
    objectName      : String(40);
    packageName     : String(40);
    classification  : String(30);
    severity        : String(10);
    releasedApiOnly : Boolean;
    violations      : array of String;
    lastModifiedBy  : String(40);
    lastModifiedAt  : DateTime;
    systemId        : String(20);
  }

  type CleanCoreSummary {
    totalExtensions    : Integer;
    cleanCount         : Integer;
    keyUserCount       : Integer;
    sideBySideCount    : Integer;
    inStackModCount    : Integer;
    unreleasedApiCount : Integer;
    compliancePct      : Decimal(8, 2);
    dataSource         : String(10); // 'live' | 'mock'
    lastSyncAt         : String(30); // ISO 8601 timestamp of this summary's compute
  }

  function getSummary()      returns CleanCoreSummary;
  function getExtensions(systemId: String) returns array of ExtensionRow;
  action  runScan(systemId: String) returns String;

  @(restrict: [
    { grant: 'READ',             to: 'CleanCoreViewer' },
    { grant: ['WRITE','DELETE'], to: 'CleanCoreAdmin'  }
  ])
  entity ScannerPolicies as projection on db.ScannerPolicy;

  @(restrict: [{ grant: 'READ', to: 'CleanCoreViewer' }])
  entity ScanRuns as projection on db.ScanRun;

  @(restrict: [{ grant: 'READ', to: 'CleanCoreViewer' }])
  entity ScanResults as projection on db.ScanResult;
}
