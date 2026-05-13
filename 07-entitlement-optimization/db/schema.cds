namespace com.btpconsulting.entitlement;

/**
 * ContractAnchor — known renewal dates and unit prices per service+plan.
 * Operator-entered (per engagement) because the SAP commercial catalog isn't
 * exposed via API. Without this, recommendations are utilization-only;
 * with it, recommendations show €/yr savings.
 */
entity ContractAnchor {
  key serviceName  : String(200);
  key planName     : String(200);
      unitPrice    : Decimal(18, 4);   // €/unit/year — operator estimate
      currency     : String(10) default 'EUR';
      renewalDate  : Date;
      contractRef  : String(200);
      notes        : String(500);
      modifiedAt   : Timestamp @cds.on.update: $now;
      modifiedBy   : String(200) @cds.on.update: $user;
}

/**
 * AcknowledgedRecommendation — operator-marked "we know about this, leave it".
 */
entity AcknowledgedRecommendation {
  key serviceName  : String(200);
  key planName     : String(200);
      reason       : String(500);
      until        : Date;
      createdAt    : Timestamp @cds.on.insert: $now;
      createdBy    : String(200) @cds.on.insert: $user;
}
