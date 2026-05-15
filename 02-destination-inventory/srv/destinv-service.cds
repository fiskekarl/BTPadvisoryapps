using { com.btpconsulting.destinationinventory as db } from '../db/schema';

/**
 * DestinvService — global-account-wide destination inventory and risk scoring.
 *
 * Data sources (per-subaccount destination service-keys aggregated client-side):
 *   • GET /destination-configuration/v1/subaccountDestinations
 *   • GET /destination-configuration/v1/destinations/{name}  (for x509 cert expiry)
 *   • Cloud Connector State API where reachable for on-prem destinations.
 */
@requires: 'DestInvViewer'
service DestinvService {

  type DestinationRow {
    subaccountId   : String(100);
    subaccountName : String(200);
    name           : String(200);
    type           : String(20);    // HTTP | RFC | LDAP | MAIL
    proxyType      : String(20);    // Internet | OnPremise | PrivateLink
    url            : String(500);
    authentication : String(50);    // BasicAuth | OAuth2*  | ClientCert | NoAuth | …
    description    : String(500);
    additionalProps: LargeString;   // JSON of remaining fields
    certNotAfter   : String(10);    // YYYY-MM-DD when client-cert auth
    daysToExpiry   : Integer;       // null when no cert
    lastTestStatus : String(20);    // OK | UNREACHABLE | UNKNOWN
  }

  type Finding {
    code            : String(50);   // BASIC_AUTH_IN_PROD | CERT_EXPIRING | DANGLING_TARGET | MTLS_AVAILABLE_NOT_USED
    severity        : String(10);   // info | warn | error
    subaccountId    : String(100);
    destinationName : String(200);
    summary         : String(300);
    detail          : LargeString;
    ignored         : Boolean;
    ignoreReason    : String(500);
  }

  type DestinvSummary {
    totalDestinations  : Integer;
    basicAuthCount     : Integer;
    onPremiseCount     : Integer;
    certsExpiring60d   : Integer;
    certsExpiring14d   : Integer;
    findings           : Integer;   // not ignored
    criticalFindings   : Integer;
    dataSource         : String(10); // 'live' | 'mock'
    lastSyncAt         : String(30); // ISO 8601 timestamp of this summary's compute
  }

  function getSummary()      returns DestinvSummary;
  function getDestinations() returns array of DestinationRow;
  function getFindings()     returns array of Finding;

  @(restrict: [
    { grant: 'READ',             to: 'DestInvViewer' },
    { grant: ['WRITE','DELETE'], to: 'DestInvAdmin' }
  ])
  entity ScanPolicies as projection on db.ScanPolicy;

  @(restrict: [
    { grant: 'READ',             to: 'DestInvViewer' },
    { grant: ['WRITE','DELETE'], to: 'DestInvAdmin' }
  ])
  entity IgnoreRules as projection on db.IgnoreRule;
}
