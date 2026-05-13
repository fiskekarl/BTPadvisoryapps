# BTP Destination & Connectivity Inventory

App **#2** in the BTP Advisory Apps arsenal. Surfaces every destination across every subaccount with risk findings: BasicAuth in production, expiring client certs, dangling targets, missing token-exchange.

## Data sources

| Source | API | Notes |
|---|---|---|
| Destination Service (per-subaccount) | `GET /destination-configuration/v1/subaccountDestinations` | One service-key per subaccount; aggregated client-side |
| Destination Service (cert content) | `GET /destination-configuration/v1/destinations/{name}` | Used to extract `Certificates[].Content` for x509 expiry parsing |

## Per-client deploy: `DESTINATION_KEYS` env var

The destination service can only enumerate destinations within its own subaccount. To inventory the whole global account the consultant must, during the per-client deploy:

1. Create a `destination` (lite) service instance + service-key in **each** subaccount (or use existing).
2. Concatenate the JSON service-keys into an array, one entry per subaccount:
   ```json
   [
     { "subaccountId": "guid-1", "subaccountName": "Production", "uaa": { ... }, "uri": "https://..." },
     { "subaccountId": "guid-2", "subaccountName": "QA",         "uaa": { ... }, "uri": "https://..." }
   ]
   ```
3. Set the result as `DESTINATION_KEYS` env var on `destinv-srv`:
   ```bash
   cf set-env destinv-srv DESTINATION_KEYS '<paste-json>'
   cf restage destinv-srv
   ```

Without `DESTINATION_KEYS`, the app inventories the locally-bound subaccount only.

## Status

| Capability | Status |
|---|---|
| Multi-subaccount enumeration | implemented (via DESTINATION_KEYS) |
| x509 cert expiry parsing | implemented (from `Certificates[].Content`) |
| BasicAuth-in-prod finding | implemented |
| Cert-expiring finding | implemented |
| Dangling-target detection | TODO — needs target-reachability checks |
| MTLS-available-not-used | TODO — needs target-system catalog |
| Connectivity proxy / Cloud Connector status | TODO — Cloud Connector State API |
