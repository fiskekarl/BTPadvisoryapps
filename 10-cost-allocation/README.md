# BTP Cost Allocation & Showback Engine

App **#10**. Hierarchical chargeback — BU → Product → Cost Center → Subaccount with configurable shared-service splits.

## Sources
- UAS `/reports/v1/monthlySubaccountsCost` for the cost facts
- CIS Accounts (subaccount labels: `costCenter`, `department`)
- `OrgHierarchyEntry` for BU → Product → CostCenter rollup (CSV upload)
- `ChargebackPolicy` for shared-service splits

## Per-client deploy
```powershell
# Same CIS + UAS bindings as BTPbilling.
# Operator must seed OrgHierarchyEntry (CSV) and ChargebackPolicy in-app.
cf push cost-srv -f manifest.yml
```

## Engagement deployment time
**~1 hour** technical deploy + **~3 hours** to import the customer's BU/Product/CC hierarchy as `OrgHierarchyEntry` rows (one-time per engagement).
