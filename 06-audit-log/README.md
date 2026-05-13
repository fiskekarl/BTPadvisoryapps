# BTP Audit-Log & Change Inventory Console

App **#6**. Unified change timeline across subaccounts. The deliverable a SOX/ISO walkthrough is built around.

## Sources
- Audit Log Retrieval API per subaccount via `SUBACCOUNT_KEYS` (`auditLog` block)
- cTMS deployment history via `CTMS_URL` + `CTMS_TOKEN` (optional)

## Per-client deploy
```powershell
cf set-env audit-srv SUBACCOUNT_KEYS '<json-with-auditLog-block-per-subaccount>'
cf set-env audit-srv CTMS_URL        'https://<host>/v2'
cf set-env audit-srv CTMS_TOKEN      '<oauth-bearer>'
cf restage audit-srv
```

## Anomaly rules
4 seeded rules: `ADMIN_GRANT_OFF_HOURS`, `MTA_DEPLOY_WEEKEND`, `DESTINATION_CHANGE`, `FAILED_LOGIN_BURST`. Editable in-app by `AuditAdmin`.

## Engagement deployment time
**~1 hour** per client subaccount. Requires audit-log-management service-key per subaccount you want covered. cTMS integration adds 30 minutes if scoped.
