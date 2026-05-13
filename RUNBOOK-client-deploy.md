# Per-Client Deploy Runbook

How to deploy any app from this arsenal as a leave-behind into a client's BTP subaccount. **Target: 2 hours per app for a delivery colleague.**

This runbook is generic — substitute `<APP>` with the app folder (`01-subaccount-lifecycle`, `02-destination-inventory`, etc.) and `<id>` with the MTA ID from the app's `mta.yaml`.

---

## 0. Prerequisites at the client

Confirm before deploy day. Missing items here are the #1 cause of wasted time.

### Client subaccount entitlements

Open BTP Cockpit → Target Subaccount → Entitlements. Ensure all of these are **entitled and available**:

| Service | Plan | Used by |
|---|---|---|
| `xsuaa` | `application` | Every app |
| `cis` | `central` | Apps #1, #3, #4, #5, #6, #7, #9, #10 |
| `auditlog-management` | `default` | Apps #1, #6 |
| `destination` | `lite` | All apps (UI routing) + #2, #9 (data scan) |
| `html5-apps-repo` | `app-host` | All apps |
| `uas` | `reporting-ga-admin` | Apps #7, #10 (cost-related) |

> If `uas` is missing, raise SAP support ticket BC-CP-BTP-UAS — provisioning takes 2–5 business days. Schedule this **first**.

### Client identity setup

| Need | Action |
|---|---|
| IAS-federated subaccount (any non-default trust) | Verify trust-configuration exists in cockpit |
| API access to IAS (apps #4, #9) | Create IAS Application of type "API access" in client IAS tenant — see app #4 README |
| Multi-subaccount destination scan (apps #2, #9) | Plan: create destination service-key in **each** subaccount to be scanned |

### Local tooling

```powershell
node --version          # >= 20
cf --version            # >= 8
mbt --version           # npm install -g mbt
cf plugins | findstr Multi   # mta plugin: cf install-plugin multiapps
```

---

## 1. Branch / parameterise per client

Per-client config goes in an MTA extension descriptor. Keep this in your engagement Git repo, NOT in the app folder.

Create `mta-ext-<clientShortName>.mtaext` next to `mta.yaml` (or in your engagement repo):

```yaml
_schema-version: '3.1'
ID: <id>-<clientShortName>
extends: <id>

modules:
  - name: <app-prefix>-srv
    properties:
      # Per-client tunable: which subaccount IDs the scanner walks.
      # Most apps default to "all subaccounts under the global account".
      CLIENT_NAME: "<Client Display Name>"
```

This is also where you set per-client env vars later (`DESTINATION_KEYS`, `IAS_*`, etc.).

---

## 2. Build

```powershell
cd <APP>
npm ci
npm ci --prefix app/<ui-folder>
mbt build -p cf
# Produces mta_archives\<id>_1.0.0.mtar
```

Common failures:
- `npm ci` fails → delete `node_modules\` and `package-lock.json`, retry.
- `cds build` fails → check `node --version` is 20+.
- UI build fails → run the `npm ci --prefix` step above first.

---

## 3. Target the client subaccount

```powershell
cf login -a https://api.cf.<region>.hana.ondemand.com --sso
cf target -o <client-org> -s <client-space>
```

Confirm:

```powershell
cf target
# org should be the CLIENT's, not yours.
```

> **STOP** if `cf target` shows your own org. Deploying into the wrong tenant is the worst possible outcome of this runbook.

---

## 4. Deploy

```powershell
cf deploy mta_archives\<id>_1.0.0.mtar `
  -e mta-ext-<clientShortName>.mtaext `
  -f
```

Watch progress:

```powershell
cf dmol -i <operation-id>     # operation-id printed at start
```

If interrupted — resume, do **NOT** re-run `cf deploy`:

```powershell
cf deploy -i <operation-id> -a resume
```

---

## 5. Inject per-app secrets / keys

After the MTA is deployed, set the app-specific env vars. None of these can ship inside the MTA — they're per-engagement secrets.

### Time budget per app

| App | Time | Driver |
|---|---|---|
| #1 Subaccount Lifecycle | **1.5 hr** | CIS + Audit Log keys per subaccount |
| #2 Destination Inventory | **1 hr** | `DESTINATION_KEYS` array assembly |
| #3 Compliance Scorecard | **30 min** | Reuses #1+#2 data; in-workshop rule tuning |
| #4 Identity Federation | **2 hr** | IAS "API access" app + scope grants |
| #5 Role-Collection Map | **1.5 hr** | Per-subaccount XSUAA apiaccess keys |
| #6 Audit-Log Console | **1 hr** | audit-log-management instance per subaccount |
| #7 Entitlement Optimization | **1 hr + 3 hr seed** | UAS bound; ContractAnchor data entry |
| #8 AI Governance | **1 hr** | AI Core service-key + OAuth |
| #9 Cert Expiry | **30 min** | Reuses DESTINATION_KEYS + IAS keys |
| #10 Cost Allocation | **1 hr + 3 hr seed** | UAS bound; org hierarchy import |
| #11 Clean Core | **~1 day** | ABAP transport + Cloud Connector + virtual host |

### Build SUBACCOUNT_KEYS once

Apps #1, #3, #4, #5, #6 share a `SUBACCOUNT_KEYS` env var that bundles the per-subaccount service-keys for Destination, XSUAA Authorization (apiaccess plan), Service Manager, and Audit Log. **Build this array once, paste into each app.**

For each subaccount in scope, run in BTP Cockpit → Subaccount → Service Marketplace:
1. **Destination** (lite plan) → create instance + service-key.
2. **Authorization & Trust Management Service** (apiaccess plan) → create instance + service-key.
3. **Service Manager** (subaccount-admin plan) → create instance + service-key.
4. **Audit Log Management Service** (default plan) → create instance + service-key (only on apps that need audit data).

Then assemble:

```json
[
  {
    "subaccountId":   "<guid-1>",
    "subaccountName": "Production",
    "tier":           "prod",
    "destination":    { "uaa": {...}, "uri":    "https://destination-..." },
    "xsuaa":          { "uaa": {...}, "apiurl": "https://api.authentication-..." },
    "serviceManager": { "uaa": {...}, "sm_url": "https://service-manager-..." },
    "auditLog":       { "uaa": {...}, "url":    "https://auditlog-..." }
  }
]
```

### App #1 — Subaccount Lifecycle
```powershell
cf set-env lifecycle-srv SUBACCOUNT_KEYS '<paste-array-json>'
cf restage lifecycle-srv
```

### App #2 — Destination Inventory
```powershell
# Uses DESTINATION_KEYS (legacy single-purpose env var).
# To switch app #2 to SUBACCOUNT_KEYS, drop the destination sub-section in
# srv/destinv-service.js. Today both work — DESTINATION_KEYS overrides.
cf set-env destinv-srv DESTINATION_KEYS '<paste-array-json>'
cf restage destinv-srv
```

### App #3 — Compliance Scorecard
```powershell
cf set-env score-srv SUBACCOUNT_KEYS '<paste-array-json>'
cf restage score-srv
```

### App #4 — Identity Federation
```powershell
cf set-env ident-srv SUBACCOUNT_KEYS    '<paste-array-json>'
cf set-env ident-srv IAS_API_URL        'https://<tenant>.accounts.ondemand.com'
cf set-env ident-srv IAS_OAUTH_URL      'https://<tenant>.accounts.ondemand.com/oauth2/token'
cf set-env ident-srv IAS_CLIENT_ID      '<client-id>'
cf set-env ident-srv IAS_CLIENT_SECRET  '<client-secret>'
cf restage ident-srv
```

### App #5 — Role-Collection & Identity Map
```powershell
cf set-env role-srv SUBACCOUNT_KEYS '<paste-array-json>'
cf restage role-srv
```

### App #6 — Audit-Log Console
```powershell
cf set-env audit-srv SUBACCOUNT_KEYS '<paste-array-json>'
# Optional: cTMS deployment history integration
cf set-env audit-srv CTMS_URL        'https://<host>/v2'
cf set-env audit-srv CTMS_TOKEN      '<oauth-bearer>'
cf restage audit-srv
```

### App #7 — Entitlement & License Optimization
```powershell
# CIS + UAS bound by MTA — no env vars needed for the data feed.
# Open the app as EntitleAdmin and seed ContractAnchors for the top-10 services
# (renewal date + €/unit/year) — required for €-saving recommendations to appear.
```

### App #8 — AI Services Governance
```powershell
cf set-env ai-srv AI_CORE_URL          'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com'
cf set-env ai-srv AI_CORE_OAUTH_URL    'https://<subdomain>.authentication.eu10.hana.ondemand.com/oauth/token'
cf set-env ai-srv AI_CORE_CLIENT_ID    '<client-id>'
cf set-env ai-srv AI_CORE_CLIENT_SECRET '<client-secret>'
cf restage ai-srv
```

### App #9 — Cert Expiry
```powershell
# Reuses DESTINATION_KEYS and IAS_* env vars from #2 and #4.
cf set-env cert-srv DESTINATION_KEYS '<paste-array-json>'
cf set-env cert-srv IAS_API_URL       'https://<tenant>.accounts.ondemand.com'
cf set-env cert-srv IAS_OAUTH_URL     'https://<tenant>.accounts.ondemand.com/oauth2/token'
cf set-env cert-srv IAS_CLIENT_ID     '<client-id>'
cf set-env cert-srv IAS_CLIENT_SECRET '<client-secret>'
cf restage cert-srv
```

### App #10 — Cost Allocation & Showback
```powershell
# CIS + UAS bound by MTA — no env vars needed for the data feed.
# Open the app as CostAdmin and import the OrgHierarchy CSV
# (BU / Product Line / CostCenter / Department / Owner) — required for the
# hierarchical cost tree. Add ChargebackPolicies for shared services
# (XSUAA, Audit Log, IAS) with split rules.
```

### App #11 — Clean Core Compliance (separate stack)
**Different from the other apps — requires ABAP transport + Cloud Connector.**
```powershell
# 1. Cloud Connector virtual host: configure with customer's Basis team
#    (typically 2 hours including approvals).
# 2. Transport the ABAP scanner package (ZBTP_CLEANCORE) into customer dev
#    system → release → import to QA + Prod (allow 4 hours including transport queue).
# 3. Update the `s4-cleancore-scanner` destination via mta-ext to point at
#    the customer's virtual host + the technical user for the scanner endpoint.
cf set-env cleancore-srv S4_SYSTEM_ID 'S4P'
cf restage cleancore-srv
```

---

## 6. Assign role collections

Each app creates two role collections:

| App | Viewer RC | Admin RC |
|---|---|---|
| #1 | `BTP Subaccount Lifecycle Viewer` | `BTP Subaccount Lifecycle Administrator` |
| #2 | `BTP Destination Inventory Viewer` | `BTP Destination Inventory Administrator` |
| #3 | `BTP Compliance Scorecard Viewer` | `BTP Compliance Scorecard Administrator` |
| #4 | `BTP Identity Federation Viewer` | `BTP Identity Federation Administrator` |
| #5 | `BTP Role Map Viewer` | `BTP Role Map Administrator` |
| #6 | `BTP Audit Log Viewer` | `BTP Audit Log Administrator` |
| #7 | `BTP Entitlement Optimization Viewer` | `BTP Entitlement Optimization Administrator` |
| #8 | `BTP AI Governance Viewer` | `BTP AI Governance Administrator` |
| #9 | `BTP Cert Expiry Viewer` | `BTP Cert Expiry Administrator` |
| #10 | `BTP Cost Allocation Viewer` | `BTP Cost Allocation Administrator` |
| #11 | `BTP Clean Core Viewer` | `BTP Clean Core Administrator` |

In BTP Cockpit → Subaccount → Security → Role Collections:
1. Open each Viewer RC → Edit → assign IAS group `<client-prefix>-btp-readers` (or equivalent).
2. Open each Admin RC → Edit → assign IAS group `<client-prefix>-btp-admins`.
3. Confirm individual users with the BTP Cockpit admin during handover.

---

## 7. Surface in Work Zone

If the client has SAP Build Work Zone Standard:

1. Build Work Zone → Channel Manager → "Add Channel" → HTML5 Repository.
2. Each app self-registers via its `sap.cloud.service` ID — no manual content import needed.
3. Add the app(s) to a launchpad site → assign to relevant catalogs.

If no Work Zone, the apps are reachable directly via the HTML5 Apps Repository at:
```
https://<subaccount-subdomain>.launchpad.cfapps.<region>.hana.ondemand.com/
```

---

## 8. Smoke test checklist

For each deployed app, verify:

- [ ] Tile appears in Work Zone (or HTML5 Apps Repo) under correct catalog.
- [ ] Cold-load shows real client data (not mock — confirm by recognizable subaccount/cert/destination names).
- [ ] Viewer-role user sees data but no admin actions.
- [ ] Admin-role user sees admin actions and they work end-to-end (snapshot, edit, etc.).
- [ ] Excel export produces a clean, client-presentable file (no internal labels or hardcoded test data).
- [ ] No 403/500 in `cf logs <srv> --recent` after first user load.

---

## 9. Hand-over deliverables

Leave with the client:

1. **This runbook** with the per-client values filled in (subaccount GUIDs, env-var values, IDs, role collection assignments).
2. **`mta-ext-<clientShortName>.mtaext`** — committed in client's own ops repo.
3. **Service-key JSONs** — stored in the client's secret manager (Vault, AKS Key Vault, etc.) — NOT emailed.
4. **Operational walkthrough video** (optional) — 10-min Loom screencast of each app, kept in the engagement folder.
5. **Source code access** — give the client read access to the engagement Git repo so they can rebuild/upgrade.

---

## 10. Updating after deploy

Bump `version` in `mta.yaml` + `package.json`, then:

```powershell
mbt build -p cf
cf deploy mta_archives\<id>_<new-version>.mtar -e mta-ext-<clientShortName>.mtaext
# DO NOT pass --delete-services on update — that would wipe the bound service instances.
```

Persisted data (rules, ignore-rules, baselines, snapshots, acknowledgements) survives updates because it's in the bound HANA / SQLite — only the app code changes.

---

## 11. Decommissioning

When the engagement ends and the client wants to remove the apps:

```powershell
cf undeploy <id> --delete-services --delete-service-keys --delete-service-brokers
```

The persisted CDS data is destroyed with the service instances. Export anything they want to keep first:
- Snapshots from app #3
- Acknowledgements from app #9
- Rules / ignore-rules from each app's admin UI

Use the in-app Excel export, or query the OData endpoint directly with their cockpit token.
