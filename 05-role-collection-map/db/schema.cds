namespace com.btpconsulting.rolecollectionmap;

/**
 * ToxicComboPolicy — declares pairs of role-collections that must not be held
 * by the same human in conflicting subaccount tiers (e.g. "Cockpit Admin" in
 * prod AND any non-prod tier).
 *
 * Match logic: a finding is raised when a single user holds `rcA` in any
 * subaccount of tier `tierA` AND `rcB` in any subaccount of tier `tierB`,
 * within the same global account.
 */
entity ToxicComboPolicy {
  key id           : String(50);   // "PROD_DEV_ADMIN" etc.
      title        : String(200);
      description  : String(1000);
      rcA          : String(200);
      tierA        : String(20);   // prod | qa | dev | * (any)
      rcB          : String(200);
      tierB        : String(20);
      severity     : String(10);   // info | warn | error
      enabled      : Boolean default true;
      modifiedAt   : Timestamp @cds.on.update: $now;
      modifiedBy   : String(200) @cds.on.update: $user;
}

entity IgnoreRule {
  key id           : UUID;
      userEmail    : String(200);
      policyId     : String(50);
      reason       : String(500);
      expiresAt    : Date;
      createdAt    : Timestamp @cds.on.insert: $now;
      createdBy    : String(200) @cds.on.insert: $user;
}
