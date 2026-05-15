'use strict';

const { expect } = require('chai');
const { evaluators, safeCompileRegex } = require('../../srv/rules/registry');
const { subaccounts, destinations } = require('../helpers/fixtures');

describe('rules/registry evaluators', () => {

  describe('label-required', () => {
    it('passes when prod subaccounts carry the required label', () => {
      const out = evaluators['label-required'](
        { scope: 'prod', label: 'costCenter' },
        { subaccounts, destinations }
      );
      // sub-001 and sub-004 are prod tier and both have a costCenter
      const prodResults = out.filter((r) => ['sub-001', 'sub-004'].includes(r.subaccountId));
      expect(prodResults).to.have.length(2);
      expect(prodResults.every((r) => r.passed)).to.equal(true);
    });

    it('fails when label is missing', () => {
      const sa = [{ subaccountId: 'x', displayName: 'X', tier: 'prod', costCenter: '' }];
      const out = evaluators['label-required'](
        { scope: 'prod', label: 'costCenter' },
        { subaccounts: sa, destinations: [] }
      );
      expect(out).to.have.length(1);
      expect(out[0].passed).to.equal(false);
      expect(out[0].summary).to.include('missing');
    });

    it('respects scope=all (returns one finding per subaccount)', () => {
      const out = evaluators['label-required'](
        { scope: 'all', label: 'department' },
        { subaccounts, destinations }
      );
      expect(out).to.have.length(subaccounts.length);
    });

    it('respects scope=dev (filters to dev tier only)', () => {
      const out = evaluators['label-required'](
        { scope: 'dev', label: 'department' },
        { subaccounts, destinations }
      );
      // sub-003 and sub-005 are dev tier
      expect(out).to.have.length(2);
    });
  });

  describe('destination-auth-forbidden', () => {
    it('flags BasicAuthentication destinations in prod', () => {
      const out = evaluators['destination-auth-forbidden'](
        { scope: 'prod', forbidden: ['BasicAuthentication'] },
        { subaccounts, destinations }
      );
      const sub001 = out.find((r) => r.subaccountId === 'sub-001');
      expect(sub001.passed).to.equal(false);
      const detail = JSON.parse(sub001.detailJson);
      expect(detail.offenders[0].name).to.equal('s4-erp');
      expect(detail.offenders[0].auth).to.equal('BasicAuthentication');
    });

    it('passes when no destinations exist for a subaccount', () => {
      const sa = [{ subaccountId: 'empty', displayName: 'E', tier: 'prod' }];
      const out = evaluators['destination-auth-forbidden'](
        { scope: 'prod', forbidden: ['BasicAuthentication'] },
        { subaccounts: sa, destinations: [] }
      );
      expect(out).to.have.length(1);
      expect(out[0].passed).to.equal(true);
    });

    it('emits one finding per in-scope subaccount, not per destination', () => {
      const out = evaluators['destination-auth-forbidden'](
        { scope: 'prod', forbidden: ['BasicAuthentication'] },
        { subaccounts, destinations }
      );
      // Two prod subaccounts (sub-001, sub-004); expect exactly 2 findings.
      expect(out).to.have.length(2);
    });
  });

  describe('max-days-inactive', () => {
    it('passes when daysInactive is below threshold', () => {
      const out = evaluators['max-days-inactive'](
        { maxDays: 90 },
        { subaccounts: [{ subaccountId: 'a', displayName: 'A', daysInactive: 30 }], destinations: [] }
      );
      expect(out[0].passed).to.equal(true);
    });

    it('fails at the threshold (strict less-than boundary)', () => {
      const out = evaluators['max-days-inactive'](
        { maxDays: 90 },
        { subaccounts: [{ subaccountId: 'a', displayName: 'A', daysInactive: 90 }], destinations: [] }
      );
      expect(out[0].passed).to.equal(false);
      expect(out[0].summary).to.include('90 days');
    });

    it('treats missing daysInactive as 0 (passes)', () => {
      const out = evaluators['max-days-inactive'](
        { maxDays: 90 },
        { subaccounts: [{ subaccountId: 'a', displayName: 'A' }], destinations: [] }
      );
      expect(out[0].passed).to.equal(true);
    });
  });

  describe('name-pattern', () => {
    it('matches case-insensitively when flags include "i"', () => {
      const out = evaluators['name-pattern'](
        { pattern: '(prod|dev)', flags: 'i' },
        { subaccounts: [{ subaccountId: 'a', displayName: 'My PROD env' }], destinations: [] }
      );
      expect(out[0].passed).to.equal(true);
    });

    it('reports the non-matching displayName in the summary', () => {
      const out = evaluators['name-pattern'](
        { pattern: '(prod|dev)', flags: '' },
        { subaccounts: [{ subaccountId: 'a', displayName: 'random' }], destinations: [] }
      );
      expect(out[0].passed).to.equal(false);
      expect(out[0].summary).to.include('random');
    });

    it('handles missing displayName gracefully (no throw)', () => {
      const out = evaluators['name-pattern'](
        { pattern: '(prod|dev)', flags: '' },
        { subaccounts: [{ subaccountId: 'a' }], destinations: [] }
      );
      expect(out[0].passed).to.equal(false);
    });
  });

  describe('mfa-for-admin-rcs', () => {
    afterEach(() => { delete process.env.IAS_API_URL; });

    it('returns a "needs IAS binding" finding per subaccount when env unset', () => {
      delete process.env.IAS_API_URL;
      const out = evaluators['mfa-for-admin-rcs']({}, { subaccounts, destinations });
      expect(out).to.have.length(subaccounts.length);
      expect(out.every((r) => r.passed === false)).to.equal(true);
      expect(out[0].summary).to.include('IAS not bound');
      const detail = JSON.parse(out[0].detailJson);
      expect(detail.requiresEnv).to.equal('IAS_API_URL');
    });

    it('returns an empty array (TODO placeholder) when IAS_API_URL is set', () => {
      process.env.IAS_API_URL = 'https://ias.example';
      const out = evaluators['mfa-for-admin-rcs']({}, { subaccounts, destinations });
      expect(out).to.deep.equal([]);
    });
  });

  describe('usedForProduction-flag', () => {
    it('passes when prod tier has shouldBe = USED_FOR_PRODUCTION', () => {
      const out = evaluators['usedForProduction-flag'](
        { scope: 'prod', shouldBe: 'USED_FOR_PRODUCTION' },
        { subaccounts, destinations }
      );
      // sub-001 + sub-004 are prod, both USED_FOR_PRODUCTION → both pass
      expect(out.every((r) => r.passed)).to.equal(true);
    });

    it('fails when dev subaccount has UNSET / NOT_USED but rule wants USED_FOR_PRODUCTION', () => {
      const out = evaluators['usedForProduction-flag'](
        { scope: 'dev', shouldBe: 'USED_FOR_PRODUCTION' },
        { subaccounts, destinations }
      );
      // sub-003 (NOT_USED) and sub-005 (NOT_USED) — both fail
      expect(out.length).to.be.greaterThan(0);
      expect(out.every((r) => r.passed === false)).to.equal(true);
    });
  });

  describe('destination-url-scheme', () => {
    it('flags HTTP URLs when only https is allowed', () => {
      const out = evaluators['destination-url-scheme'](
        { scope: 'prod', allowedSchemes: ['https'] },
        { subaccounts, destinations }
      );
      // leaked-old in sub-001 uses http://
      const sub001 = out.find((r) => r.subaccountId === 'sub-001');
      expect(sub001.passed).to.equal(false);
      expect(JSON.parse(sub001.detailJson).offenders[0].name).to.equal('leaked-old');
    });

    it('passes when every destination uses an allowed scheme', () => {
      const out = evaluators['destination-url-scheme'](
        { scope: 'qa', allowedSchemes: ['https'] },
        { subaccounts, destinations }
      );
      const sub002 = out.find((r) => r.subaccountId === 'sub-002');
      expect(sub002.passed).to.equal(true);
    });

    it('skips destinations with empty URLs (cannot evaluate scheme)', () => {
      const out = evaluators['destination-url-scheme'](
        { scope: 'all', allowedSchemes: ['https'] },
        { subaccounts: [{ subaccountId: 'x', displayName: 'X', tier: 'prod' }],
          destinations: [{ subaccountId: 'x', name: 'd', authentication: 'NoAuthentication', url: '' }] }
      );
      expect(out[0].passed).to.equal(true);
    });
  });

  describe('destination-proxy-type-for-local', () => {
    it('passes when local-host destinations correctly use OnPremise proxy', () => {
      // sub-001 has s4-erp at s4.acme.local with OnPremise → ok
      // sub-002 has s4-qa at s4-qa.acme.local with OnPremise → ok
      const out = evaluators['destination-proxy-type-for-local']({}, { subaccounts, destinations });
      expect(out.find((r) => r.subaccountId === 'sub-001').passed).to.equal(true);
      expect(out.find((r) => r.subaccountId === 'sub-002').passed).to.equal(true);
    });

    it('fails when a local-host destination is configured as Internet proxy', () => {
      const sa = [{ subaccountId: 'x', displayName: 'X', tier: 'prod' }];
      const ds = [{ subaccountId: 'x', name: 'broken', authentication: 'NoAuthentication',
                    url: 'https://erp.corp.local', proxyType: 'Internet' }];
      const out = evaluators['destination-proxy-type-for-local']({}, { subaccounts: sa, destinations: ds });
      expect(out[0].passed).to.equal(false);
    });
  });

  describe('destination-auth-allowlist', () => {
    it('passes when every destination uses an allow-listed auth', () => {
      const out = evaluators['destination-auth-allowlist'](
        { scope: 'prod', allowed: ['BasicAuthentication', 'OAuth2ClientCredentials', 'NoAuthentication'] },
        { subaccounts, destinations }
      );
      expect(out.every((r) => r.passed)).to.equal(true);
    });

    it('fails when a destination uses a non-allow-listed auth', () => {
      const out = evaluators['destination-auth-allowlist'](
        { scope: 'prod', allowed: ['ClientCertificateAuthentication'] },
        { subaccounts, destinations }
      );
      const sub001 = out.find((r) => r.subaccountId === 'sub-001');
      expect(sub001.passed).to.equal(false);
    });
  });

  describe('destination-name-pattern', () => {
    it('flags destinations matching denyPattern', () => {
      const ds = [{ subaccountId: 'sub-001', name: 'svc-tmp-x', authentication: 'NoAuthentication', url: 'https://x' }];
      const out = evaluators['destination-name-pattern'](
        { scope: 'prod', denyPattern: '(^|[-_])(tmp|test)([-_]|$)', flags: 'i' },
        { subaccounts, destinations: ds }
      );
      expect(out.find((r) => r.subaccountId === 'sub-001').passed).to.equal(false);
    });

    it('passes when destinations match the allowPattern', () => {
      const ds = [{ subaccountId: 'sub-001', name: 'valid-name_42', authentication: 'NoAuthentication', url: 'https://x' }];
      const out = evaluators['destination-name-pattern'](
        { scope: 'prod', allowPattern: '^[a-zA-Z][a-zA-Z0-9_-]*$' },
        { subaccounts, destinations: ds }
      );
      expect(out.find((r) => r.subaccountId === 'sub-001').passed).to.equal(true);
    });
  });

  describe('subaccount-parent-required', () => {
    it('passes for subaccounts under a Directory', () => {
      const out = evaluators['subaccount-parent-required']({}, { subaccounts, destinations });
      expect(out.find((r) => r.subaccountId === 'sub-001').passed).to.equal(true);
    });

    it('fails for direct children of the Global Account', () => {
      const out = evaluators['subaccount-parent-required']({}, { subaccounts, destinations });
      // sub-005 has parentName: 'Global Account' → should fail
      // sub-006 has parentName: '' → should fail
      expect(out.find((r) => r.subaccountId === 'sub-005').passed).to.equal(false);
      expect(out.find((r) => r.subaccountId === 'sub-006').passed).to.equal(false);
    });
  });

  describe('max-destinations-per-subaccount', () => {
    it('passes when destination count is under the limit', () => {
      const out = evaluators['max-destinations-per-subaccount']({ max: 100 }, { subaccounts, destinations });
      expect(out.every((r) => r.passed)).to.equal(true);
    });

    it('fails subaccounts that exceed max', () => {
      const ds = Array.from({ length: 10 }, (_, i) => ({
        subaccountId: 'sub-001', name: `d${i}`, authentication: 'NoAuthentication', url: 'https://x',
      }));
      const out = evaluators['max-destinations-per-subaccount']({ max: 5 }, { subaccounts, destinations: ds });
      expect(out.find((r) => r.subaccountId === 'sub-001').passed).to.equal(false);
    });
  });

  describe('tier-label-consistency', () => {
    it('passes when tier is known', () => {
      const out = evaluators['tier-label-consistency']({}, { subaccounts, destinations });
      expect(out.find((r) => r.subaccountId === 'sub-001').passed).to.equal(true);
    });

    it('fails when tier is "unknown"', () => {
      const out = evaluators['tier-label-consistency']({}, { subaccounts, destinations });
      // sub-006 has tier: 'unknown' → fails
      expect(out.find((r) => r.subaccountId === 'sub-006').passed).to.equal(false);
    });
  });

  describe('department-required', () => {
    it('passes when department is set', () => {
      const out = evaluators['department-required']({ scope: 'prod' }, { subaccounts, destinations });
      // sub-001 + sub-004 both have department
      expect(out.every((r) => r.passed)).to.equal(true);
    });

    it('fails when department is empty', () => {
      const out = evaluators['department-required']({ scope: 'dev' }, { subaccounts, destinations });
      // sub-005 has empty department
      expect(out.find((r) => r.subaccountId === 'sub-005').passed).to.equal(false);
    });
  });

  describe('safeCompileRegex (ReDoS hardening)', () => {
    it('compiles benign patterns', () => {
      expect(safeCompileRegex('^prod-')).to.be.an.instanceOf(RegExp);
      expect(safeCompileRegex('^[a-z]+$', 'i')).to.be.an.instanceOf(RegExp);
    });

    it('returns null for non-string input', () => {
      expect(safeCompileRegex(null)).to.equal(null);
      expect(safeCompileRegex(undefined)).to.equal(null);
      expect(safeCompileRegex(42)).to.equal(null);
    });

    it('rejects patterns longer than 200 chars', () => {
      const huge = 'a'.repeat(201);
      expect(safeCompileRegex(huge)).to.equal(null);
    });

    it('rejects classic nested-quantifier ReDoS shapes', () => {
      expect(safeCompileRegex('(a+)+')).to.equal(null);
      expect(safeCompileRegex('(a*)+')).to.equal(null);
      expect(safeCompileRegex('(.+)*')).to.equal(null);
      expect(safeCompileRegex('^(x+x+)+y$')).to.equal(null);
    });

    it('returns null for syntactically invalid regex', () => {
      expect(safeCompileRegex('[')).to.equal(null);
      expect(safeCompileRegex('(unclosed')).to.equal(null);
    });

    it('lets through patterns that look like nested quantifiers but are not', () => {
      // Single quantifier inside a group, no outer quantifier — safe.
      expect(safeCompileRegex('(a+)')).to.be.an.instanceOf(RegExp);
      expect(safeCompileRegex('(a*)')).to.be.an.instanceOf(RegExp);
    });
  });

  describe('name-pattern + destination-name-pattern reject unsafe regex (ReDoS guard)', () => {
    it('name-pattern with ReDoS pattern emits skip findings rather than compiling', () => {
      const out = evaluators['name-pattern']({ pattern: '(a+)+' }, { subaccounts, destinations });
      expect(out.length).to.equal(subaccounts.length);
      expect(out.every((r) => r.passed === false)).to.equal(true);
      expect(out[0].summary).to.match(/unsafe.*invalid/);
    });

    it('destination-name-pattern with ReDoS allowPattern emits skip findings', () => {
      const out = evaluators['destination-name-pattern'](
        { scope: 'prod', allowPattern: '(x+x+)+' },
        { subaccounts, destinations }
      );
      expect(out.length).to.be.greaterThan(0);
      expect(out.every((r) => r.passed === false)).to.equal(true);
      expect(out[0].summary).to.match(/unsafe.*invalid/);
    });
  });
});
