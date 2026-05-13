# BTP Trust Config & Cert Expiry Console

App **#9** in the BTP Advisory Apps arsenal. Single pane of glass for every certificate across the client's BTP landscape with rotation owner, blast radius, and acknowledgement workflow.

## Sources & wiring

| Cert kind | Source | Status |
|---|---|---|
| `DESTINATION` | Reuses `DESTINATION_KEYS` env var from app #2 | implemented |
| `IAS_SAML` / `IAS_OIDC` | IAS `GET /Trust` (uses same `IAS_*` env vars as app #4) | TODO |
| `XSUAA_TRUST` | Per-subaccount XSUAA `/authorization/v2/trust-configurations` | TODO — needs `XSUAA_KEYS` env var pattern |
| `CTMS` | cTMS admin API | TODO — engagement-specific |
| `SERVICE_BINDING` | CIS service-instance binding inspection | TODO |

## Per-engagement rotation-owner registry

Edit `srv/cert-service.js` `ROTATION_OWNERS` array to map cert patterns to named human owners. Future version persists this in a CDS table editable by `CertAdmin`.

## Acknowledgement workflow

`Acknowledgement` entity stores per-cert "snooze until" date + reason. Entries with `acknowledgedUntil < today` are ignored automatically. Used to suppress noise during planned rotation windows without losing the audit trail.

## Status

| Capability | Status |
|---|---|
| Destination cert scanning + x509 parsing | implemented |
| Severity ladder (notice → warn → critical → expired) | implemented |
| Acknowledgement filtering | implemented |
| Excel export | implemented |
| Filter by cert kind | implemented |
| IAS / XSUAA / cTMS / service-binding sources | TODO |
| Email alerts at thresholds | TODO — Alert Notification Service integration |
| Teams webhook | TODO |
