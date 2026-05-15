'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/audit-service');

const { isoDaysAgo, inWindow, applyAnomalyRules, enrichWithAnomalies } = __test__;

describe('audit-service pure helpers', () => {

  describe('isoDaysAgo', () => {
    it('returns an ISO 8601 timestamp', () => {
      expect(isoDaysAgo(7)).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('returns earlier than now for positive n', () => {
      expect(isoDaysAgo(1) < new Date().toISOString()).to.equal(true);
    });
  });

  describe('inWindow', () => {
    // A Saturday afternoon ISO timestamp
    const saturdayAfternoon = (() => {
      const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
      d.setHours(14, 0, 0, 0);
      return d.toISOString();
    })();

    // A Tuesday morning (weekday)
    const tuesdayMorning = (() => {
      const d = new Date();
      const daysToTue = (2 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() - daysToTue);
      d.setHours(10, 0, 0, 0);
      return d.toISOString();
    })();

    it('returns true when event on weekend and rule.onWeekend is true', () => {
      expect(inWindow(saturdayAfternoon, { onWeekend: true })).to.equal(true);
    });

    it('returns false when event on weekday and rule.onWeekend is true (and no time window)', () => {
      expect(inWindow(tuesdayMorning, { onWeekend: true })).to.equal(false);
    });

    it('returns false when rule has no time window and no weekend match', () => {
      expect(inWindow(tuesdayMorning, {})).to.equal(false);
    });

    it('returns true for an event outside the configured change window', () => {
      // tuesdayMorning is at 10:00; rule allows 08:00-09:00 only → 10:00 is OUTSIDE
      expect(inWindow(tuesdayMorning, { changeWindowStart: '08:00', changeWindowEnd: '09:00' })).to.equal(true);
    });

    it('returns false for an event inside the configured change window', () => {
      // tuesdayMorning is at 10:00; rule allows 09:00-17:00 → 10:00 is INSIDE
      expect(inWindow(tuesdayMorning, { changeWindowStart: '09:00', changeWindowEnd: '17:00' })).to.equal(false);
    });
  });

  describe('applyAnomalyRules', () => {
    const FAILED_LOGIN_RULE = {
      id: 'FAILED_LOGIN_BURST', enabled: true, severity: 'warn',
      actionPattern: 'login',
    };
    const ADMIN_GRANT_RULE = {
      id: 'ADMIN_GRANT_OFF_HOURS', enabled: true, severity: 'error',
      actionPattern: 'role-collection.assign', onWeekend: true,
    };

    it('returns empty anomaly for no matching rules', () => {
      const result = applyAnomalyRules(
        { action: 'user.read', outcome: 'success', timestamp: new Date().toISOString() },
        [ADMIN_GRANT_RULE]
      );
      expect(result.anomalyId).to.equal('');
      expect(result.anomalySeverity).to.equal('');
    });

    it('flags FAILED_LOGIN_BURST when login action fails', () => {
      const result = applyAnomalyRules(
        { action: 'user.login', outcome: 'failure', timestamp: new Date().toISOString() },
        [FAILED_LOGIN_RULE]
      );
      expect(result.anomalyId).to.equal('FAILED_LOGIN_BURST');
      expect(result.anomalySeverity).to.equal('warn');
    });

    it('does not flag FAILED_LOGIN_BURST when login action succeeds', () => {
      const result = applyAnomalyRules(
        { action: 'user.login', outcome: 'success', timestamp: new Date().toISOString() },
        [FAILED_LOGIN_RULE]
      );
      expect(result.anomalyId).to.equal('');
    });

    it('skips disabled rules', () => {
      const result = applyAnomalyRules(
        { action: 'user.login', outcome: 'failure', timestamp: new Date().toISOString() },
        [{ ...FAILED_LOGIN_RULE, enabled: false }]
      );
      expect(result.anomalyId).to.equal('');
    });
  });

  describe('enrichWithAnomalies', () => {
    it('annotates every event with anomaly fields', () => {
      const events = [
        { action: 'user.read',  outcome: 'success', timestamp: new Date().toISOString() },
        { action: 'user.login', outcome: 'failure', timestamp: new Date().toISOString() },
      ];
      const rules = [{ id: 'FAILED_LOGIN_BURST', enabled: true, severity: 'warn', actionPattern: 'login' }];
      const out = enrichWithAnomalies(events, rules);
      expect(out[0].anomalyId).to.equal('');
      expect(out[1].anomalyId).to.equal('FAILED_LOGIN_BURST');
    });
  });
});
