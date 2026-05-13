namespace com.btpconsulting.identityfederation;

entity HealthPolicy {
  key id                  : String(50);   // "default"
      dormantUserDays     : Integer default 90;
      certWarnDays        : Integer default 60;
      requireMfaForAdmins : Boolean default true;
      modifiedAt          : Timestamp @cds.on.update: $now;
      modifiedBy          : String(200) @cds.on.update: $user;
}

entity IgnoreRule {
  key id           : UUID;
      findingCode  : String(50);
      target       : String(300);   // e.g. user email or app id
      reason       : String(500);
      expiresAt    : Date;
      createdAt    : Timestamp @cds.on.insert: $now;
      createdBy    : String(200) @cds.on.insert: $user;
}
