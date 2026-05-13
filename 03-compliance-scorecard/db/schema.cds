namespace com.btpconsulting.compliancescorecard;

/**
 * Rule — a single compliance check the scorecard evaluates against the BTP
 * landscape.
 *
 * Rules are seeded with the consultant's opinionated baseline (see
 * db/seed/rules.json) and editable in-app by ScoreAdmin during the
 * engagement workshop. The client's leave-behind copy keeps the tuned set.
 */
entity Rule {
  key id            : String(50);    // stable code, e.g. "PROD_NO_BASIC_AUTH"
      title         : String(200);
      description   : String(1000);
      category      : String(50);    // identity | connectivity | governance | cost | resilience
      severity      : String(10);    // info | warn | error
      enabled       : Boolean default true;
      // Rule logic is implemented in srv/rules/<id>.js — `kind` selects
      // the evaluator; `paramsJson` is passed to it.
      kind          : String(30);    // builtin name: "label-required" | "auth-method-forbidden" | ...
      paramsJson    : LargeString;
      modifiedAt    : Timestamp @cds.on.update: $now;
      modifiedBy    : String(200) @cds.on.update: $user;
}

/**
 * ScoreSnapshot — frozen output of a scan run. Captured on every "Run scan"
 * action so workshop deliverables ("before vs after") are reproducible.
 */
entity ScoreSnapshot {
  key id              : UUID;
      runAt           : Timestamp @cds.on.insert: $now;
      runBy           : String(200) @cds.on.insert: $user;
      label           : String(200);   // e.g. "Day-1 baseline" or "After cleanup"
      overallGrade    : String(2);     // A | B | C | D | F
      overallScore    : Decimal(5,2);  // 0.00 - 100.00
      subaccountCount : Integer;
      ruleCount       : Integer;
      findingsJson    : LargeString;   // full RuleResult[] for reproducibility
}

/** RuleResult — runtime-only return type, but captured here for the snapshot's findingsJson. */
entity RuleResult {
  key id           : UUID;
      snapshotId   : UUID;
      ruleId       : String(50);
      subaccountId : String(100);
      passed       : Boolean;
      severity     : String(10);
      summary      : String(300);
      detailJson   : LargeString;
}
