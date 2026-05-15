# Baseline packs

Reusable JSON bundles of opinionated defaults — rules, drift baselines, policies — that the arsenal can ship into a fresh customer deployment in one shot.

Each pack is a single JSON file at this level. Apps with seedable content (today: `01-subaccount-lifecycle`, `03-compliance-scorecard`) expose two service endpoints:

- `action importBaseline(packJson: LargeString) returns String` — upserts the relevant section.
- `function exportBaseline() returns LargeString` — dumps current state in the same shape, so engagement-specific tweaks can be checked back in and shipped to the next customer.

## Pack format

```jsonc
{
  "version":     "2026.05",
  "name":        "BTP Best Practice Baseline — 2026.05",
  "description": "…",
  "lastUpdated": "2026-05-15",

  // One key per app namespace. Apps ignore sections they don't know about.
  "01-subaccount-lifecycle": {
    "driftBaselines": [
      { "tier": "prod", "resourceType": "label", "expectedJson": "{…}", "note": "…" }
    ]
  },
  "03-compliance-scorecard": {
    "rules": [
      { "id": "…", "title": "…", "kind": "…", "paramsJson": "{…}", "severity": "error", "category": "governance", "description": "…", "enabled": true }
    ]
  }
}
```

## Available packs

| File | Version | Apps covered | Notes |
|---|---|---|---|
| `btp-best-practice-2026.05.json` | 2026.05 | 01, 03 | Canonical baseline — 5 drift baselines + 20 compliance rules. Maps to CIS BTP Benchmark themes (cited in rule descriptions). |

## Applying a pack at deploy time

```bash
# Read the pack into a JSON-escaped string and POST it to each app's
# importBaseline action. The path differs per app namespace:
PACK=$(cat baselines/btp-best-practice-2026.05.json)

curl -X POST "https://lifecycle-<client>.cfapps.eu10.hana.ondemand.com/odata/v4/lifecycle/importBaseline" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"packJson\": $(echo "$PACK" | jq -Rs .)}"

curl -X POST "https://scorecard-<client>.cfapps.eu10.hana.ondemand.com/odata/v4/score/importBaseline" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"packJson\": $(echo "$PACK" | jq -Rs .)}"
```

The OAuth `$TOKEN` comes from each app's xs-security binding; grant the executing user the `LifecycleAdmin` and `ScoreAdmin` scopes respectively.

## Authoring a new pack

1. Make per-customer tweaks via the dashboards (CRUD on Rules / DriftBaselines).
2. Call `exportBaseline()` against each app and save the JSON.
3. Merge into a single pack file under a new version (`YYYY.MM` works well).
4. Commit to this directory.

The exported payload uses `version: "export-<date>"` as a placeholder — rename to the engagement version (e.g. `acme-2026.06`) before shipping.
