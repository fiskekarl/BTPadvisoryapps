namespace com.btpconsulting.certexpiry;

entity AlertThreshold {
  key id           : String(50);   // "default"
      criticalDays : Integer default 14;
      warnDays     : Integer default 30;
      noticeDays   : Integer default 90;
      modifiedAt   : Timestamp @cds.on.update: $now;
      modifiedBy   : String(200) @cds.on.update: $user;
}

/** Acknowledged certificate-expiry alerts (suppressed for an absolute date). */
entity Acknowledgement {
  key id           : UUID;
      certKey      : String(300);   // {kind}::{subaccountId}::{name}
      acknowledgedUntil : Date;     // alert reappears after this date
      reason       : String(500);
      createdAt    : Timestamp @cds.on.insert: $now;
      createdBy    : String(200) @cds.on.insert: $user;
}
