# BTP Entitlement & License Optimization Advisor

App **#7**. Utilization curves + downgrade recommendations with €/yr savings — hard ROI for the renewal conversation.

## Sources
- CIS Entitlements API (entitled quotas)
- UAS `/reports/v1/monthlyUsage` (12-24 month history)
- `ContractAnchor` table (operator-entered unit prices + renewal dates)

## Per-client deploy
```powershell
# CIS + UAS bound automatically by MTA.
# Operator must seed ContractAnchors in-app for €/yr savings to appear.
cf push entitle-srv -f manifest.yml
```

## Engagement deployment time
**~1 hour** including ContractAnchor seeding for the top-10 services. UAS plan `reporting-ga-admin` must be entitled (raise SAP support ticket if missing — 2-5 day SLA).
