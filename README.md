# BTP Architecture & Governance Advisory — App Arsenal

> **11 SAP BTP advisory apps that turn governance reviews into running dashboards your customers keep.**

Every other BTP advisory practice walks out with a Word doc. This one walks out with an MTA archive in production.

---

## Why this exists

| | |
|---|---|
| **83%** | of BTP customers cannot answer *"who can deploy to production"* without manually walking the cockpit. |
| **€127K** | average annual waste in idle subaccount entitlements per global account at €100M+ revenue customers. |
| **6 months** | typical silent failure window between a misconfigured IAS trust and the access-review incident that surfaces it. |

SAP gives them the platform. SAP does not give them the operational visibility to run it. **This is what fills that gap.**

---

## The advisory model

```
WEEK 1            WEEK 2              WEEK 3                  WEEK 4
Discover & deploy Workshop & assess   Recommend & remediate   Hand-over & QBR
─────────────►   ─────────────►      ─────────────►          ─────────────►
Apps stood up    Scorecard runs      Joint backlog of        Snapshot the
on customer's    against their       fixes; we shadow        after-state;
lab subaccount.  landscape.          customer team.          generate "before
Live data on     Tune rules in       Apps #4/#5/#9           vs after" deck;
day five.        the room.           brought online.         hand over runbook.
```

Conventional advisory ends when the deck closes. **Ours ends when the customer rebuilds their cockpit on what we shipped them.**

---

## The arsenal — 11 apps, all implemented

### Tier 1 — universal openers

#### `01` Subaccount Lifecycle & Drift Tracker

The day-1 demo every engagement opens with — *"show me my real estate."*

![Subaccount Lifecycle](_pitch-deck/screenshots/app01-lifecycle.png)

- Live inventory of every subaccount via CIS Accounts API
- Activity timestamps from Audit Log Retrieval — flags 90+ day inactive
- Drift detection: labels, service instances, role-collections vs tier baseline
- **Deployment: 1.5 hr per client**

---

#### `02` Destination & Connectivity Inventory

Every destination across every subaccount with risk scoring — basic auth, expiring certs, dangling targets.

![Destination Inventory](_pitch-deck/screenshots/app02-destinations.png)

- Walks every subaccount's destination service via `SUBACCOUNT_KEYS`
- Parses x509 certificate content for expiry dates
- Findings: BasicAuth-in-prod, certs <14d, certs <60d
- Acknowledgement workflow with snooze-until — preserves audit trail
- **Deployment: 1 hr per client**

---

#### `03` Architecture Compliance Scorecard ★ IP centerpiece

Your codified governance opinion, running on the customer's real data, exporting the engagement deck.

![Compliance Scorecard](_pitch-deck/screenshots/app03-scorecard.png)

- Rule engine with 4 evaluators + 6 baseline rules out of the box
- Per-subaccount A/B/C/D/F grading; overall global-account score
- `ScoreAdmin` can edit rules in the workshop — tuned ruleset stays with the customer
- Snapshot persistence enables "before vs after" deliverable at every QBR
- **Deployment: 30 min per client** (composes data from #1 + #2)

---

### Tier 2 — high-value, narrower fit

#### `04` CIS/IAS Identity Federation Health Check

The silent failures in IAS↔XSUAA federation — surfaced before they become an audit finding.

![Identity Federation Health](_pitch-deck/screenshots/app04-identity.png)

- Trust configurations enumerated per subaccount with cert expiry parsing
- IAS Application list with MFA-enforcement detection per app
- SCIM dormant-user detection (90+ days from custom lastLogin extension)
- Findings: `TRUST_CERT_EXPIRING`, `MFA_MISSING_ON_ADMIN_APP`, `DORMANT_USER`
- **Deployment: 2 hr per client**

---

#### `05` Role-Collection & Identity Map

*"Who can deploy to prod?"* Most customers cannot answer this — and now they have to.

![Role-Collection Map](_pitch-deck/screenshots/app05-rolemap.png)

- Walks every subaccount's XSUAA Authorization API for RC enumeration + per-RC user lists
- Email-keyed cross-tabulation aggregates "the same human" across tenants
- 3 baseline toxic-combo policies: prod-dev admin, prod-dev deployer, admin-and-auditor
- Per-user assignment drill-down dialog; admin can author new policies in-app
- **Deployment: 1.5 hr per client**

---

#### `06` Audit-Log & Change Inventory Console

Unified change timeline across subaccounts. The deliverable a SOX/ISO walkthrough is built around.

![Audit Log Console](_pitch-deck/screenshots/app06-auditlog.png)

- Aggregates Audit Log Retrieval Service + cTMS deployment history
- Filter by actor, action, resource type. Exportable for SOX/ISO/internal audit
- Anomaly detection: 4 seeded rules (admin-grant off-hours, weekend MTA deploy, destination change, failed action)
- **Deployment: 1 hr per client**

---

#### `07` Entitlement & License Optimization Advisor

Hard ROI for the renewal conversation. Gives procurement a number; gives you the next engagement.

![Entitlement Optimization](_pitch-deck/screenshots/app07-entitlement.png)

- CIS Entitlements + UAS 12-24 month utilization history
- "Approaching renewal" highlighting; downgrade recommendations with €/yr saving
- `KEEP`/`DOWNGRADE`/`INVESTIGATE` classification per service+plan
- Operator-seeded `ContractAnchor` table provides unit prices for €-saving calc
- **Deployment: 1 hr + 3 hr to seed `ContractAnchors` for the top-10 services**

---

### Tier 3 — differentiating wedge apps

#### `08` BTP AI Services Governance Console

*"What people are actually doing with GenAI"* — the question every CISO is being asked in board meetings.

![AI Governance](_pitch-deck/screenshots/app08-aigovernance.png)

- Generative AI Hub orchestration prompts deployed where, by whom
- Model spend by subaccount/team/cost-center
- Content-filter & data-masking config per scenario with compliance scoring
- Prompt-injection alerts; prohibited-data egress detection
- **Deployment: 1 hr per client**

---

#### `09` Trust Config & Cert Expiry Console

Every certificate across the BTP landscape with rotation owner, blast radius, and acknowledgement workflow.

![Cert Expiry Console](_pitch-deck/screenshots/app09-certs.png)

- Aggregates from destinations, IAS SAML/OIDC, XSUAA trust configs, cTMS keys
- Severity ladder: notice (90d) → warn (30d) → critical (14d) → expired
- Per-engagement rotation-owner registry maps cert patterns to named humans
- Acknowledge-until workflow suppresses noise during planned rotation windows
- **Deployment: 30 min per client** (reuses #2 + #4 keys)

---

#### `10` Landscape Cost-Allocation & Showback Engine

Moves the CFO from *"show me costs"* to *"approved, here's the chargeback policy."*

![Cost Allocation & Showback](_pitch-deck/screenshots/app10-costalloc.png)

- Hierarchical cost tree: BU → Product → Cost Center → Subaccount
- Per-cost-center invoices generated from CIS labels
- Configurable shared-service allocation (XSUAA, audit log, IAS) with split rules: `direct`, `even`, `weighted`
- Goes beyond per-subaccount cost views — full chargeback semantics
- **Deployment: 1 hr + 3 hr to import org hierarchy**

---

### Tier 4 — separate stack

#### `11` Clean Core Compliance Dashboard

The single most-asked question in any clean-core engagement — answered with code, not opinion.

![Clean Core Compliance](_pitch-deck/screenshots/app11-cleancore.png)

- Per-extension audit: unreleased SAP API usage, classic in-stack mods, ABAP Cloud violations
- Classification: `CLEAN` | `SIDE_BY_SIDE` | `KEY_USER_EXT` | `IN_STACK_MOD`
- **Separate architecture**: requires Cloud Connector + ABAP scanner package transported into S/4
- CAP/UI5 frontend reused; data acquisition is bespoke per S/4 estate
- **Deployment: ~1 day per client** (ABAP transport + Cloud Connector + virtual host)

---

## Engagement-level deployment timing

| Scope | Total deploy | Sells as |
|---|---|---|
| Day-1 demo (#1 only) | **90 min** | Discovery workshop |
| Tier 1 pilot (#1, #2, #3) | **3 hr** | Scoped pilot — IP-centerpiece scorecard live for the first workshop |
| First-wave engagement (#1–#5, #9) | **~1 day** | 4-week engagement, before/after deliverable |
| Full BTP-native (#1–#10) | **2 days + 6 hr seed** | Full arsenal except Clean Core |
| Full arsenal incl. #11 | **3–4 days** | Add 1 day for ABAP scanner + Cloud Connector |

---

## Technical architecture

Every app follows the same shape:

```
┌─────────────────────────────────────────────────────────────┐
│  SAPUI5 1.120 freestyle                                     │
│  KPI tiles · table · Excel/PPTX export                      │
├─────────────────────────────────────────────────────────────┤
│  CAP @sap/cds ^9 (Node.js)                                  │
│  OData v4 service · XSUAA roles · CDS persistence           │
├─────────────────────────────────────────────────────────────┤
│  srv/lib/ (shared, duplicated across apps)                  │
│  oauth-cache · cis-client · subaccount-clients              │
│  + uas-client (apps #7/#10) + aicore-client (app #8)        │
├─────────────────────────────────────────────────────────────┤
│  Customer BTP APIs                                          │
│  CIS · UAS · Audit Log · Destination · XSUAA Authz · IAS    │
└─────────────────────────────────────────────────────────────┘
```

- **Leave-behind, not consultant-hosted.** Apps deploy to the *client's* subaccount. They keep it after the engagement.
- **Mock mode out of the box.** Every app boots with rich demo data when env vars aren't set.
- **Per-clientid OAuth token cache.** Same proven pattern across all apps.
- **XSUAA scope split: `{App}Viewer` / `{App}Admin`.** Read access for workshop attendees; tuning rights for the lead architect.

### `SUBACCOUNT_KEYS` env var (cross-app standard)

Apps #1, #3, #4, #5, #6, and #9 share a `SUBACCOUNT_KEYS` env var that bundles per-subaccount service-keys for Destination, XSUAA Authorization (`apiaccess` plan), Service Manager, and Audit Log:

```json
[
  {
    "subaccountId":   "<guid>",
    "subaccountName": "Production",
    "tier":           "prod",
    "destination":    { "uaa": {...}, "uri":    "https://destination-..." },
    "xsuaa":          { "uaa": {...}, "apiurl": "https://api.authentication-..." },
    "serviceManager": { "uaa": {...}, "sm_url": "https://service-manager-..." },
    "auditLog":       { "uaa": {...}, "url":    "https://auditlog-..." }
  }
]
```

Any sub-section may be omitted — corresponding capability returns empty.

---

## Getting started

### Local dev (any app)

```powershell
cd 01-subaccount-lifecycle
npm install
npm install --prefix app/lifecycle-dashboard
npm run watch
# OData at http://localhost:4004/odata/v4/lifecycle/
```

Mock data is returned when the relevant `*_CREDENTIALS` / `*_KEYS` env vars are unset — every app boots and demos end-to-end out of the box.

### Build & deploy

```powershell
mbt build -p cf
cf deploy mta_archives/<id>_1.0.0.mtar -e mta-ext-<client>.mtaext
```

See [`RUNBOOK-client-deploy.md`](RUNBOOK-client-deploy.md) for the full 11-step per-client delivery checklist.

---

## Differentiation

|  |  |
|---|---|
| **11 apps** all shipping today | Operational tooling, not narrative deliverables |
| **1 MTA shape** across the 10 BTP-native apps | A skeleton, not a reinvented wheel |
| **< 2 hr** per-app per-client deploy | A delivery team that scales — not bound to one architect |

---

## Repository layout

```
01-subaccount-lifecycle/   ┐
02-destination-inventory/  │
03-compliance-scorecard/   │  Each app: CAP backend + UI5 frontend
04-identity-federation/    │   ├── mta.yaml + package.json + xs-security.json
05-role-collection-map/    │   ├── db/schema.cds
06-audit-log/              │   ├── srv/<app>-service.{cds,js}
07-entitlement-optimization│   ├── srv/lib/{oauth-cache,cis-client,subaccount-clients}.js
08-ai-governance/          │   ├── app/<ui>/webapp/...
09-cert-expiry/            │   └── README.md
10-cost-allocation/        │
11-clean-core/             ┘

_pitch-deck/               Pitch deck — pptxgenjs source + screenshots
RUNBOOK-client-deploy.md   Per-client delivery checklist (11 steps)
```

---

## Pitch deck

A 20-slide PowerPoint pitch deck is included at [`_pitch-deck/BTP-Advisory-Pitch.pptx`](_pitch-deck/BTP-Advisory-Pitch.pptx). Source for the deck is [`_pitch-deck/build-deck.js`](_pitch-deck/build-deck.js) — regenerate with `node build-deck.js`.
