namespace com.btpconsulting.costallocation;

/** ChargebackPolicy — how a service's cost is split when it's a shared service. */
entity ChargebackPolicy {
  key id              : String(50);
      serviceName     : String(200);
      splitType       : String(20);    // direct | even | proportional | weighted
      weightedJson    : LargeString;   // JSON: { "CC-1001": 0.4, "CC-1002": 0.6 }
      notes           : String(500);
      modifiedAt      : Timestamp @cds.on.update: $now;
      modifiedBy      : String(200) @cds.on.update: $user;
}

/** OrgHierarchy — defines BU → Product → CostCenter mapping (CSV-style upload). */
entity OrgHierarchyEntry {
  key costCenter   : String(50);
      buName       : String(200);
      productLine  : String(200);
      department   : String(200);
      owner        : String(200);
      modifiedAt   : Timestamp @cds.on.update: $now;
}
