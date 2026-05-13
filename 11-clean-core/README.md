# BTP Clean Core Compliance Dashboard

App **#11**. Audit of S/4HANA extensions against clean-core principles — released APIs only, no in-stack mods.

## Architecture (different from other arsenal apps)

This is the **only app in the arsenal with a customer-side ABAP component**.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  BTP Cockpit    │    │ Cloud Connector │    │  Customer S/4   │
│                 │    │                 │    │                 │
│  cleancore-srv  │───►│  Virtual host   │───►│ ATC Scanner pkg │
│  (CAP@9)        │    │  s4-virtual     │    │ /sap/bc/rest/.. │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Sources
- ABAP scanner package (transported to customer's S/4 dev system as a separate engagement step)
- Cloud Connector destination `s4-cleancore-scanner` (configured per client)
- Falls back to mock data when destination unreachable

## ABAP scanner package

The scanner is an ABAP add-on (separate repository — `D:\Claude\BTP Advisory APps\11-clean-core\abap-scanner-pkg\` placeholder) that:

1. Provides an REST endpoint at `/sap/bc/rest/btp-advisory/cleancore-scan`.
2. Runs `cl_satc_remote_api` checks against the configured package set.
3. Returns a JSON payload conforming to the `ScanResult` schema.

ABAP package contents (to be developed when an engagement scopes this app):
- Class `ZCL_BTP_CLEANCORE_SCANNER` — orchestrates the scan via ATC remote API
- ICF service node `btp-advisory/cleancore-scan` — REST endpoint
- Authorization object `Z_BTPCLEAN` — restricts who can invoke

Transport effort: ~2 days first time, ~30 min for subsequent S/4 systems.

## Per-client deploy

1. **Transport ABAP package** into customer dev system → release → import to QA + Prod.
2. **Configure Cloud Connector** virtual host pointing at customer's S/4 system.
3. **Update destination** `s4-cleancore-scanner` via mtaext with the customer's virtual host + tech user.

```powershell
cf push cleancore-srv -f manifest.yml
cf update-service cleancore-destination-service -c '{ "init_data": { "instance": { "destinations": [ ... s4-cleancore-scanner with customer URL ... ] } } }'
```

## Engagement deployment time

**~1 day** total when an engagement scopes this app:

| Step | Time |
|---|---|
| Cloud Connector + virtual-host config (with customer Basis team) | 2 hr |
| ABAP scanner package transport (dev → QA → prod) | 4 hr (incl. transport wait) |
| BTP-side MTA deploy + destination wiring | 1 hr |
| First scan run + baseline snapshot | 30 min - 2 hr (depends on S/4 size) |

If the scanner package is already in place from a previous engagement, deployment drops to **~3 hours**.
