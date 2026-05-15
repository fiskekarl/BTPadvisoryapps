using { com.btpconsulting.rolecollectionmap as db } from '../db/schema';

/**
 * RoleService — user × role-collection × subaccount cross-tabulation with
 * toxic-combo and dormant-RC detection.
 *
 * Data sources (read-only against client tenant):
 *   • CIS Accounts API for the subaccount inventory.
 *   • Per-subaccount XSUAA Authorization & Trust Management API
 *     (plan apiaccess) for role-collection enumeration and user assignments.
 *
 * Aggregation: each user is keyed by email. The same email present in two
 * subaccount-XSUAA tenants is treated as "the same human" — that's how BTP
 * cockpit identity works in practice.
 */
@requires: 'RoleViewer'
service RoleService {

  type RcAssignment {
    subaccountId   : String(100);
    subaccountName : String(200);
    tier           : String(20);
    rcName         : String(200);
    rcDescription  : String(500);
  }

  type UserMapRow {
    email            : String(200);
    displayName      : String(200);
    origin           : String(50);    // ldap | sap.ids | uaa | <ias-host>
    assignmentCount  : Integer;
    subaccountCount  : Integer;
    assignments      : array of RcAssignment;
  }

  type ToxicFinding {
    policyId       : String(50);
    severity       : String(10);
    email          : String(200);
    displayName    : String(200);
    rcA            : String(200);
    tierA          : String(20);
    subaccountAId  : String(100);
    rcB            : String(200);
    tierB          : String(20);
    subaccountBId  : String(100);
    summary        : String(300);
    ignored        : Boolean;
    ignoreReason   : String(500);
  }

  type RoleSummary {
    totalUsers        : Integer;
    totalAssignments  : Integer;
    totalRoleCollections : Integer;
    crossTierUsers    : Integer;     // users active in >1 tier
    toxicFindings     : Integer;
    criticalFindings  : Integer;
    dataSource        : String(10); // 'live' | 'mock'
    lastSyncAt        : String(30); // ISO 8601 timestamp of this summary's compute
  }

  function getSummary()       returns RoleSummary;
  function getUserMap()       returns array of UserMapRow;
  function getRoleCollections() returns array of RcAssignment;
  function getToxicFindings() returns array of ToxicFinding;

  @(restrict: [
    { grant: 'READ',             to: 'RoleViewer' },
    { grant: ['WRITE','DELETE'], to: 'RoleAdmin'  }
  ])
  entity ToxicComboPolicies as projection on db.ToxicComboPolicy;

  @(restrict: [
    { grant: 'READ',             to: 'RoleViewer' },
    { grant: ['WRITE','DELETE'], to: 'RoleAdmin'  }
  ])
  entity IgnoreRules as projection on db.IgnoreRule;
}
