using { com.btpconsulting.compliancescorecard as db } from '../db/schema';

/**
 * ScoreService — runs the rule engine against the client's BTP landscape and
 * produces a graded scorecard.
 *
 * Data sources (read-only):
 *   • CIS Accounts API for subaccount inventory + labels.
 *   • DESTINATION_KEYS env var (see app #2 README) for destination data.
 *   • IAS_API_URL + IAS_OAUTH for authentication-policy queries (rule MFA*).
 *
 * Each rule is implemented as a builtin evaluator keyed by `Rule.kind`. New
 * rule logic is added by registering a new evaluator in srv/rules/registry.js
 * — no API changes needed.
 */
@requires: 'ScoreViewer'
service ScoreService {

  type FindingRow {
    ruleId       : String(50);
    ruleTitle    : String(200);
    category     : String(50);
    severity     : String(10);
    subaccountId : String(100);
    subaccountName: String(200);
    passed       : Boolean;
    summary      : String(300);
    detail       : LargeString;
  }

  type ScoreRow {
    subaccountId   : String(100);
    subaccountName : String(200);
    grade          : String(2);     // A | B | C | D | F
    score          : Decimal(5,2);  // 0-100
    passed         : Integer;
    failed         : Integer;
    errorCount     : Integer;
    warnCount      : Integer;
  }

  type Scorecard {
    overallGrade    : String(2);
    overallScore    : Decimal(5,2);
    subaccountCount : Integer;
    ruleCount       : Integer;
    perSubaccount   : array of ScoreRow;
    findings        : array of FindingRow;
    dataSource      : String(10); // 'live' | 'mixed' | 'mock'
    lastSyncAt      : String(30); // ISO 8601 timestamp of this scorecard's compute
  }

  /** Run all enabled rules and return the live scorecard (no DB write). */
  function getScorecard() returns Scorecard;

  /** Run + persist a snapshot for "before vs after" workshop comparisons. */
  action runScan(label: String) returns UUID;

  @(restrict: [
    { grant: 'READ',             to: 'ScoreViewer' },
    { grant: ['WRITE','DELETE'], to: 'ScoreAdmin'  }
  ])
  entity Rules as projection on db.Rule;

  @(restrict: [{ grant: 'READ', to: 'ScoreViewer' }])
  entity ScoreSnapshots as projection on db.ScoreSnapshot;
}
