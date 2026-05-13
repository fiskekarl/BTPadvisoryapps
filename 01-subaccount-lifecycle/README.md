# BTP Subaccount Lifecycle & Drift Tracker

App **#1** in the BTP Advisory Apps arsenal. Surfaces subaccount inventory, drift findings against tier baselines, and audit-log activity timeline — the day-1 demo for every governance engagement.

## Data sources (read against the client's tenant)

| Source | API | Plan |
|---|---|---|
| CIS Accounts | `GET /accounts/v1/subaccounts` | `cis` / `central` |
| CIS Entitlements | `GET /entitlements/v1/globalAccountAssignments` | `cis` / `central` |
| Audit Log Retrieval | `GET /audit-log/v2/auditlogrecords` | `auditlog-management` / `default` |

## Status

| Capability | Status |
|---|---|
| CIS Accounts inventory | implemented (real API + mock fallback) |
| Audit-log activity aggregation | implemented |
| `daysInactive` derivation from audit log | implemented |
| Tier inference from labels | implemented |
| Label drift detection | implemented |
| Service-instance drift | TODO — needs Service Manager API per subaccount |
| Role-collection drift | TODO — needs per-subaccount XSUAA Authorization API |
| Env-var drift | TODO — needs CF API `/v3/apps/<guid>/environment_variables` |
| Drift baseline editor (UI5) | TODO — DriftBaselines entity exposed, no UI |
| PowerPoint export | TODO — Excel export only |

## Local dev

```powershell
npm install
$env:CIS_CREDENTIALS = '{ "uaa": { ... }, "endpoints": { "accounts_service_url": "...", "entitlements_service_url": "..." } }'
$env:AUDIT_CREDENTIALS = '{ "uaa": { ... }, "url": "https://auditlog-api.cfapps.eu10.hana.ondemand.com" }'
npm run watch
# UI at http://localhost:4004
```

Without env vars set, the service runs in mock mode and returns sample data.

## Deploy

Same shape as `D:\Claude\BTP forbrug\` (BTPbilling). See root `RUNBOOK-client-deploy.md`.

## Roles to assign per client

| Role Collection | Who |
|---|---|
| `BTP Subaccount Lifecycle Viewer` | Workshop participants, EAs, ops engineers |
| `BTP Subaccount Lifecycle Administrator` | Lead architect tuning baselines for the client |
