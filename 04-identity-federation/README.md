# BTP CIS/IAS Identity Federation Health Check

App **#4** in the BTP Advisory Apps arsenal. Validates the IAS↔XSUAA bridge, MFA enforcement on admin apps, dormant SCIM users, and trust-config certificate expiry.

## IAS API setup (one-time per client)

In the client's IAS tenant, create an Application of type "API access" with:
- **Authentication**: Secret
- **Required scopes**: `Manage Users` (read), `Manage Applications` (read), `Manage Trust` (read)

Inject the resulting credentials into the app via env vars:

```bash
cf set-env ident-srv IAS_API_URL          'https://<tenant>.accounts.ondemand.com'
cf set-env ident-srv IAS_OAUTH_URL        'https://<tenant>.accounts.ondemand.com/oauth2/token'
cf set-env ident-srv IAS_CLIENT_ID        '<client-id>'
cf set-env ident-srv IAS_CLIENT_SECRET    '<client-secret>'
cf restage ident-srv
```

Without these, the app runs in mock mode.

## Status

| Capability | Status |
|---|---|
| IAS Applications + MFA policy | implemented |
| SCIM dormant user detection | implemented (relies on `lastLogin` SCIM extension being populated by IAS) |
| Trust configurations | mock only — TODO: real impl needs CIS subaccount enumeration + XSUAA `/authorization/v2/trust-configurations` per subaccount |
| Findings: TRUST_CERT_EXPIRING, MFA_MISSING_ON_ADMIN_APP, DORMANT_USER | implemented |
| Excel export | implemented |
| Group provisioning lag detection | TODO |

## Notes

- The dormant-user attribute (`lastLogin`) is part of the SAP custom SCIM extension. If your client tenant doesn't have it populated, the heuristic falls back to `meta.lastModified` which is much less accurate.
- The "admin tier" detection in `MFA_MISSING_ON_ADMIN_APP` uses a regex on app name. If your client has different naming conventions, edit `srv/ident-service.js` line ~80.
