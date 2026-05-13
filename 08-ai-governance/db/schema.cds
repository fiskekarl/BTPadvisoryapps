namespace com.btpconsulting.aigovernance;

/** ContentFilterPolicy — minimum requirements per orchestration scenario. */
entity ContentFilterPolicy {
  key id                : String(50);
      requireInputFilter: Boolean default true;
      requireOutputFilter: Boolean default true;
      requireMasking    : Boolean default true;
      forbiddenContent  : String(500);   // comma-separated categories
      scenarioPattern   : String(200);   // regex match against config.scenarioId
      modifiedAt        : Timestamp @cds.on.update: $now;
      modifiedBy        : String(200) @cds.on.update: $user;
}

/** PromptInjectionAlert — logged when AI Core's filtering blocks a prompt. */
entity PromptInjectionAlert {
  key id           : UUID;
      timestamp    : Timestamp @cds.on.insert: $now;
      deploymentId : String(100);
      scenario     : String(200);
      severity     : String(10);
      reason       : String(500);
      sample       : String(2000);
}
