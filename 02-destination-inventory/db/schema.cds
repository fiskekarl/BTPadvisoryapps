namespace com.btpconsulting.destinationinventory;

/** Per-engagement scan policy: thresholds for the risk-finding engine. */
entity ScanPolicy {
  key id                       : String(50);   // "default" or per-environment label
      flagBasicAuth            : Boolean default true;
      requireMtlsForProd       : Boolean default true;
      maxCertExpiryWarnDays    : Integer default 60;
      maxCertExpiryCriticalDays: Integer default 14;
      flagDanglingTargets      : Boolean default true;
      modifiedAt               : Timestamp @cds.on.update: $now;
      modifiedBy               : String(200) @cds.on.update: $user;
}

entity IgnoreRule {
  key id           : UUID;
      destinationName : String(200);
      subaccountId    : String(100);
      findingCode     : String(50);
      reason          : String(500);
      expiresAt       : Date;
      createdAt       : Timestamp @cds.on.insert: $now;
      createdBy       : String(200) @cds.on.insert: $user;
}
