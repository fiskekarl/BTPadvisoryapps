# BTP Role-Collection & Identity Map

App **#5** in the BTP Advisory Apps arsenal. User × Role-Collection × Subaccount cross-tabulation with toxic-combo detection. Answers "who can deploy to prod" — most clients can't.

## Data sources

| Source | API | Used for |
|---|---|---|
| CIS Accounts | `GET /accounts/v1/subaccounts` | Subaccount inventory, tier inference from labels |
| XSUAA Authorization & Trust Mgmt (per subaccount) | `GET /sap/rest/authorization/v2/role-collections` | Role-collection enumeration |
| XSUAA Authorization & Trust Mgmt (per subaccount) | `GET /sap/rest/authorization/v2/role-collections/{rc}/users` | Per-RC user assignments |

## Per-client deploy: `SUBACCOUNT_KEYS` env var

This app introduces the canonical multi-subaccount key bundle. All other apps that need per-subaccount data (XSUAA, Service Manager, Audit Log, Destination) read the same env var.

Set during per-client deploy:

```json
[
  {
    "subaccountId":   "<guid-1>",
    "subaccountName": "Production",
    "tier":           "prod",
    "destination":    { "uaa": { "url": "...", "clientid": "...", "clientsecret": "..." }, "uri":    "https://destination-..." },
    "xsuaa":          { "uaa": { "url": "...", "clientid": "...", "clientsecret": "..." }, "apiurl": "https://api.authentication-..." },
    "serviceManager": { "uaa": { "url": "...", "clientid": "...", "clientsecret": "..." }, "sm_url": "https://service-manager..." },
    "auditLog":       { "uaa": { "url": "...", "clientid": "...", "clientsecret": "..." }, "url":    "https://auditlog-..." }
  }
]
```

Any sub-section may be omitted — corresponding capability returns empty.

```powershell
cf set-env role-srv SUBACCOUNT_KEYS '<paste-array-json>'
cf restage role-srv
```

### How to obtain the per-subaccount XSUAA Authorization API credentials

In the client's BTP cockpit, **per subaccount**:

1. Subaccount → Service Marketplace → "Authorization and Trust Management Service" → Create instance → plan `apiaccess`.
2. Create service-key → copy the JSON.
3. The `apiurl` field in the credentials is the API base. The `uaa` block has the OAuth endpoint and client credentials.

(Alternatively, if the client already has an admin XSUAA admin token, paste it here — but the apiaccess pattern is cleaner and revocable.)

## Toxic-combo detection

Policies live in `db/seed/policies.json` and are seeded on first boot. Three baseline policies ship:

| ID | What it catches |
|---|---|
| `PROD_DEV_COCKPIT_ADMIN` | Same human is Subaccount Administrator in prod AND dev |
| `PROD_DEV_DEPLOYER` | Same human can deploy MTAs to prod AND dev |
| `ADMIN_AND_AUDITOR` | Same human is Admin and Audit Log Auditor |

Edit policies in-app via the `RoleAdmin` role. Tuned policies stay with the leave-behind copy.

## Status

| Capability | Status |
|---|---|
| Multi-subaccount RC + user enumeration via SUBACCOUNT_KEYS | implemented |
| User cross-tab (email-keyed) | implemented |
| Toxic-combo policy engine + 3 seeded policies | implemented |
| Per-user assignment drill-down dialog | implemented |
| Excel export of findings | implemented |
| Search across users / RCs / findings | implemented |
| Dormant-RC detection (RCs with no assignments) | TODO |
| Inheriting-from-default-group detection | TODO |
| Role template introspection (which roles back this RC) | TODO |
