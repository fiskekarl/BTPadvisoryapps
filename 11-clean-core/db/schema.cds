namespace com.btpconsulting.cleancore;

/**
 * ScanResult — one row per ABAP extension object scanned in the customer's S/4 system.
 * Populated by the ABAP-side scanner package (transported into the client's
 * dev system as a separate engagement step — see README).
 */
entity ScanResult {
  key id              : UUID;
      scanRunId       : String(50);
      systemId        : String(20);   // S4P, S4Q, S4D
      objectType      : String(20);   // CLAS | INTF | FUGR | PROG | CDS | …
      objectName      : String(40);
      packageName     : String(40);
      releasedApiOnly : Boolean;
      classification  : String(30);   // CLEAN | KEY_USER_EXT | SIDE_BY_SIDE | IN_STACK_MOD
      severity        : String(10);
      violations      : array of String(200);
      lastModifiedBy  : String(40);
      lastModifiedAt  : DateTime;
      createdAt       : Timestamp @cds.on.insert: $now;
}

entity ScanRun {
  key id              : String(50);
      systemId        : String(20);
      startedAt       : Timestamp @cds.on.insert: $now;
      completedAt     : DateTime;
      totalObjects    : Integer;
      cleanCount      : Integer;
      modificationCount : Integer;
      status          : String(20);
}

/** ScannerPolicy — operator-tuned thresholds. */
entity ScannerPolicy {
  key id                       : String(50);
      blockUnreleasedApis      : Boolean default true;
      blockInStackMods         : Boolean default true;
      warnOnKeyUserExtensions  : Boolean default false;
      modifiedAt               : Timestamp @cds.on.update: $now;
      modifiedBy               : String(200) @cds.on.update: $user;
}
