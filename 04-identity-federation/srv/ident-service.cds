using { com.btpconsulting.identityfederation as db } from '../db/schema';

/**
 * IdentService — IAS↔XSUAA federation health.
 *
 * Data sources (read-only against client tenant):
 *   • IAS REST APIs (system-tenant API tokens):
 *       GET /scim/Users
 *       GET /Applications
 *       GET /Applications/{id}/authenticationPolicies
 *       GET /IdentityProviders
 *       GET /Trust
 *   • CIS Accounts API for the corresponding subaccount XSUAA trust configs.
 *
 * IAS auth: client-credentials with the IAS system-tenant API client.
 *   IAS_API_URL          = https://<tenant>.accounts.ondemand.com
 *   IAS_OAUTH_URL        = https://<tenant>.accounts.ondemand.com/oauth2/token
 *   IAS_CLIENT_ID
 *   IAS_CLIENT_SECRET
 */
@requires: 'IdentViewer'
service IdentService {

  type TrustRow {
    subaccountId   : String(100);
    subaccountName : String(200);
    iasTenantHost  : String(200);
    trustName      : String(200);
    type           : String(20);    // OIDC | SAML | Internal
    autoCreateUsers: Boolean;
    enabled        : Boolean;
    issuer         : String(500);
    certNotAfter   : String(10);    // YYYY-MM-DD
    daysToExpiry   : Integer;
  }

  type AppPolicy {
    appId             : String(100);
    appName           : String(200);
    mfaEnforced       : Boolean;
    riskBasedEnabled  : Boolean;
    forwardingTo      : String(200);   // upstream IdP if proxied
    description       : String(500);
  }

  type DormantUser {
    userId           : String(100);
    email            : String(200);
    displayName      : String(200);
    lastLogin        : String(30);   // ISO 8601
    daysSinceLogin   : Integer;
    status           : String(20);   // active | inactive
    iasGroupCount    : Integer;
  }

  type IdentFinding {
    code         : String(50);
    severity     : String(10);
    target       : String(300);
    summary      : String(300);
    detail       : LargeString;
    ignored      : Boolean;
    ignoreReason : String(500);
  }

  type IdentSummary {
    iasApps              : Integer;
    appsWithoutMfa       : Integer;
    trustConfigs         : Integer;
    trustsExpiring60d    : Integer;
    dormantUsers         : Integer;
    findings             : Integer;
    criticalFindings     : Integer;
  }

  function getSummary()      returns IdentSummary;
  function getTrusts()       returns array of TrustRow;
  function getAppPolicies()  returns array of AppPolicy;
  function getDormantUsers() returns array of DormantUser;
  function getFindings()     returns array of IdentFinding;

  @(restrict: [
    { grant: 'READ',             to: 'IdentViewer' },
    { grant: ['WRITE','DELETE'], to: 'IdentAdmin'  }
  ])
  entity HealthPolicies as projection on db.HealthPolicy;

  @(restrict: [
    { grant: 'READ',             to: 'IdentViewer' },
    { grant: ['WRITE','DELETE'], to: 'IdentAdmin'  }
  ])
  entity IgnoreRules as projection on db.IgnoreRule;
}
