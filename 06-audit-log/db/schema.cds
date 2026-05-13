namespace com.btpconsulting.auditlog;

/**
 * AnomalyRule — flags audit events as anomalous when they match a pattern.
 * Used to surface "admin role granted outside change window", "deploy at
 * 3am", "first-time-seen actor", etc.
 */
entity AnomalyRule {
  key id           : String(50);
      title        : String(200);
      description  : String(1000);
      // Match logic — `actionPattern` regex on the action field plus optional
      // time-window match.
      actionPattern: String(300);
      // changeWindowStart/end are local-time HH:MM 24h strings; events outside
      // the window are flagged. Leave both blank to disable time check.
      changeWindowStart : String(5);
      changeWindowEnd   : String(5);
      onWeekend    : Boolean default false;
      severity     : String(10);
      enabled      : Boolean default true;
      modifiedAt   : Timestamp @cds.on.update: $now;
      modifiedBy   : String(200) @cds.on.update: $user;
}

entity SavedFilter {
  key id           : UUID;
      label        : String(200);
      actorPattern : String(200);
      actionPattern: String(200);
      subaccountId : String(100);
      daysBack     : Integer default 30;
      createdAt    : Timestamp @cds.on.insert: $now;
      createdBy    : String(200) @cds.on.insert: $user;
}
