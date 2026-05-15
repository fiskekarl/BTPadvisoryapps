# Test suite — `03-compliance-scorecard`

This is the **pilot** test suite for the BTP Advisory Arsenal. The patterns
here are designed to be replicated into the other 10 apps.

## Layout

```
test/
├── README.md           ← this file
├── helpers/
│   ├── fixtures.js     ← canned subaccounts, destinations, rules
│   └── nock-helpers.js ← COPY VERBATIM to every other app
├── unit/               ← pure-function tests, no CAP boot
│   ├── rules-registry.test.js
│   ├── score-service-pure.test.js
│   └── lib-oauth-cache.test.js
└── integration/        ← cds.test against [development] profile
    └── score-service.test.js
```

## Test seam

`srv/score-service.js` appends `module.exports.__test__ = { buildScorecard, gradeFor, loadAll, inferTier, round2 }`
to expose pure helpers for direct unit testing. **Internal only — not a public API.**

## Commands

| Command | What it does |
|---|---|
| `npm test` | Runs every test (unit + integration). |
| `npm run test:unit` | Pure-function tests only. ~1s, no network/CAP boot. |
| `npm run test:integration` | `cds.test`-driven OData tests. ~3-8s first run (CAP cold start). |
| `npm run test:coverage` | Runs everything under `c8`, prints text + emits `coverage/lcov.info`. |
| `npm run test:watch` | Mocha watch mode for TDD. |

## Mock-mode assumption

Integration tests rely on `loadSubaccounts()` and `loadDestinations()` falling
back to their built-in mocks. The test file unsets `CIS_CREDENTIALS`,
`SUBACCOUNT_KEYS`, and `VCAP_SERVICES` before booting `cds.test` so the
fallback path always wins.

The `[development]` profile in `package.json` already supplies `auth: dummy`
and `:memory:` SQLite, so XSUAA never enters the picture.

## Rollout playbook (copy to next app)

To bring app `NN-foo` from zero tests to a passing CI job, in ~half a day:

1. `cp 03-compliance-scorecard/.mocharc.json NN-foo/`
2. `cp 03-compliance-scorecard/.c8rc.json NN-foo/`
3. `cp 03-compliance-scorecard/test/helpers/nock-helpers.js NN-foo/test/helpers/`
4. `npm pkg set` (in `NN-foo/`) for these devDeps and scripts:
   - devDeps: `mocha@^10 chai@^4 sinon@^17 nock@^13 c8@^9`
   - scripts: `test`, `test:unit`, `test:integration`, `test:coverage`, `test:watch`
5. Write `NN-foo/test/helpers/fixtures.js` shaped to the app's data model.
6. For each lib file in `NN-foo/srv/lib/`, write a unit test against its
   drifted variant — **do not copy `03`'s tests blindly**; the implementations
   differ across apps (`oauth-cache.js` has 4 unique hashes across 8 apps;
   `subaccount-clients.js` has 5 across 5).
7. Add `module.exports.__test__ = { ... }` to the primary service file and
   write `test/unit/<service>-service-pure.test.js`.
8. Write `test/integration/<service>-service.test.js` with `cds.test`.
9. Append `- NN-foo` to the matrix in `.github/workflows/test.yml`.

## Conventions

| Source | Test file |
|---|---|
| `srv/<service>-service.js` (pure helpers) | `test/unit/<service>-service-pure.test.js` |
| `srv/<service>-service.js` (OData surface) | `test/integration/<service>-service.test.js` |
| `srv/lib/<libname>.js` | `test/unit/lib-<libname>.test.js` |
| `srv/rules/<module>.js` | `test/unit/rules-<module>.test.js` |
