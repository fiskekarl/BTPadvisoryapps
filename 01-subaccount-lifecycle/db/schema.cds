namespace com.btpconsulting.subaccountlifecycle;

/**
 * DriftBaseline — declares the "expected" configuration for a landscape tier.
 *
 * The drift detector compares each subaccount in a tier against its baseline
 * and reports deltas (extra services, missing services, env-var differences,
 * role-collection differences, label gaps).
 *
 * Tier examples: "dev", "qa", "prod". One baseline per (tier × resource type).
 */
entity DriftBaseline {
  key tier             : String(20);    // "dev" | "qa" | "prod" | custom
  key resourceType     : String(50);    // "service-instance" | "role-collection" | "env-var" | "label"
      expectedJson     : LargeString;   // canonical JSON describing the expected state
      note             : String(500);
      modifiedAt       : Timestamp @cds.on.update: $now;
      modifiedBy       : String(200) @cds.on.update: $user;
}

/**
 * IgnoreRule — suppresses known-acceptable drift findings so the consultant
 * can focus on real issues during workshops.
 *
 * Match: any combination of (subaccountId, resourceType, fingerprint) where
 * fingerprint is a stable hash of the drift item the rule should silence.
 */
entity IgnoreRule {
  key id              : UUID;
      subaccountId    : String(100);    // empty = applies to all subaccounts
      resourceType    : String(50);
      fingerprint     : String(200);    // produced by the drift detector
      reason          : String(500);    // why it's ignored — for audit trail
      expiresAt       : Date;           // optional auto-expire
      createdAt       : Timestamp @cds.on.insert: $now;
      createdBy       : String(200) @cds.on.insert: $user;
}
