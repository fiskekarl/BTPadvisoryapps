'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/cert-service');

const { daysUntil, severityFor, parsePem, lookupOwner } = __test__;

describe('cert-service pure helpers', () => {

  describe('daysUntil', () => {
    it('returns null for missing date', () => {
      expect(daysUntil(null)).to.equal(null);
      expect(daysUntil('')).to.equal(null);
    });

    it('returns a positive integer for future dates', () => {
      const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      expect(daysUntil(future)).to.be.within(29, 31);
    });

    it('returns negative for past dates', () => {
      const past = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      expect(daysUntil(past)).to.be.lessThan(0);
    });
  });

  describe('severityFor', () => {
    const t = { criticalDays: 14, warnDays: 30, noticeDays: 90 };

    it('returns "notice" for null days', () => {
      expect(severityFor(null, t)).to.equal('notice');
      expect(severityFor(undefined, t)).to.equal('notice');
    });

    it('returns "expired" when days < 0', () => {
      expect(severityFor(-1, t)).to.equal('expired');
    });

    it('returns "error" at and below criticalDays', () => {
      expect(severityFor(0, t)).to.equal('error');
      expect(severityFor(14, t)).to.equal('error');
    });

    it('returns "warn" between criticalDays and warnDays', () => {
      expect(severityFor(15, t)).to.equal('warn');
      expect(severityFor(30, t)).to.equal('warn');
    });

    it('returns "notice" between warnDays and noticeDays', () => {
      expect(severityFor(31, t)).to.equal('notice');
      expect(severityFor(90, t)).to.equal('notice');
    });

    it('returns "ok" beyond noticeDays', () => {
      expect(severityFor(91, t)).to.equal('ok');
      expect(severityFor(365, t)).to.equal('ok');
    });
  });

  describe('parsePem', () => {
    it('returns null for invalid input', () => {
      expect(parsePem('not-a-cert')).to.equal(null);
      expect(parsePem(Buffer.from('garbage'))).to.equal(null);
    });
  });

  describe('lookupOwner', () => {
    it('returns "" when no registry entries match', () => {
      expect(lookupOwner({ kind: 'DESTINATION', subaccountId: 's', name: 'x' }, [])).to.equal('');
    });

    it('matches by kind', () => {
      const registry = [{ kind: 'DESTINATION', owner: 'Ops Team' }];
      expect(lookupOwner({ kind: 'DESTINATION', subaccountId: 's', name: 'x' }, registry)).to.equal('Ops Team');
      expect(lookupOwner({ kind: 'IAS_SAML', subaccountId: 's', name: 'x' }, registry)).to.equal('');
    });

    it('matches subaccountId wildcard "*"', () => {
      const registry = [{ kind: 'DESTINATION', subaccountId: '*', owner: 'Any' }];
      expect(lookupOwner({ kind: 'DESTINATION', subaccountId: 'sub-001', name: 'x' }, registry)).to.equal('Any');
    });

    it('matches namePattern', () => {
      const registry = [{ kind: 'DESTINATION', namePattern: /^s4-/, owner: 'S4 Team' }];
      expect(lookupOwner({ kind: 'DESTINATION', subaccountId: 's', name: 's4-erp' }, registry)).to.equal('S4 Team');
      expect(lookupOwner({ kind: 'DESTINATION', subaccountId: 's', name: 'sf-success' }, registry)).to.equal('');
    });
  });
});
