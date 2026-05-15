using { com.btpconsulting.aigovernance as db } from '../db/schema';

/**
 * AiService — BTP AI Services governance.
 *
 * Data sources (read-only):
 *   • AI Core admin API (deployments, configurations, resource groups).
 *   • Generative AI Hub orchestration configs.
 *   • UAS for AI-related service spend (optional, when UAS bound).
 *
 * Auth: AI_CORE_URL + AI_CORE_CLIENT_ID + AI_CORE_CLIENT_SECRET + AI_CORE_OAUTH_URL.
 */
@requires: 'AiViewer'
service AiService {

  type DeploymentRow {
    id              : String(100);
    scenarioId      : String(200);
    modelName       : String(100);
    modelProvider   : String(50);
    resourceGroup   : String(100);
    status          : String(30);
    createdAt       : String(30);
    deployedBy      : String(200);
    targetUrl       : String(500);
  }

  type OrchestrationRow {
    configId         : String(100);
    scenarioId       : String(200);
    templateName     : String(200);
    modelName        : String(100);
    hasInputFilter   : Boolean;
    hasOutputFilter  : Boolean;
    hasMasking       : Boolean;
    grounding        : String(100);   // disabled | vector-db | document-store
    deployedTo       : array of String;
    compliant        : Boolean;
    violations       : array of String;
  }

  type SpendRow {
    yearMonth        : String(7);
    modelProvider    : String(50);
    modelName        : String(100);
    costEur          : Decimal(18, 2);
    tokensIn         : Integer;
    tokensOut        : Integer;
  }

  type AiSummary {
    activeDeployments       : Integer;
    modelsInUse             : Integer;
    monthlySpendEur         : Decimal(18, 2);
    configsWithoutFilter    : Integer;
    configsWithoutMasking   : Integer;
    promptInjectionAlerts7d : Integer;
    dataSource              : String(10); // 'live' | 'mock'
    lastSyncAt              : String(30); // ISO 8601 timestamp of this summary's compute
  }

  function getSummary()             returns AiSummary;
  function getDeployments()         returns array of DeploymentRow;
  function getOrchestrationConfigs() returns array of OrchestrationRow;
  function getSpend(months: Integer) returns array of SpendRow;
  function getAlerts(days: Integer)  returns array of {
    timestamp    : Timestamp;
    deploymentId : String(100);
    scenario     : String(200);
    severity     : String(10);
    reason       : String(500);
  };

  @(restrict: [
    { grant: 'READ',             to: 'AiViewer' },
    { grant: ['WRITE','DELETE'], to: 'AiAdmin'  }
  ])
  entity ContentFilterPolicies as projection on db.ContentFilterPolicy;

  @(restrict: [{ grant: 'READ', to: 'AiViewer' }])
  entity PromptInjectionAlerts as projection on db.PromptInjectionAlert;
}
