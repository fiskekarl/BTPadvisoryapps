'use strict';

const { expect } = require('chai');
const { evaluators } = require('../../srv/rules/registry');
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
});
