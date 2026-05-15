'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/entitle-service');

const { mockEntitlements, ymOffset } = __test__;

describe('entitle-service pure helpers', () => {

  describe('ymOffset', () => {
    it('returns YYYY-MM format for the current month at offset 0', () => {
      expect(ymOffset(0)).to.match(/^\d{4}-\d{2}$/);
    });

    it('shifts backwards by N months', () => {
      const now = new Date();
      const expectMonth = (delta) => {
        const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() + delta);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };
      expect(ymOffset(-1)).to.equal(expectMonth(-1));
      expect(ymOffset(-12)).to.equal(expectMonth(-12));
    });

    it('shifts forward by N months', () => {
      const now = new Date();
      const expectMonth = (delta) => {
        const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() + delta);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };
      expect(ymOffset(3)).to.equal(expectMonth(3));
    });
  });

  describe('mockEntitlements', () => {
    it('returns a non-empty array of entitlement rows', () => {
      const rows = mockEntitlements(12);
      expect(rows).to.be.an('array').with.length.greaterThan(0);
    });

    it('every row has the canonical EntitlementRow shape', () => {
      const rows = mockEntitlements(12);
      for (const r of rows) {
        expect(r).to.include.keys(
          'serviceName', 'planName', 'unit', 'entitled', 'unlimited',
          'avgUsage', 'peakUsage', 'utilizationPct', 'history',
          'recommendation', 'suggestedQuota', 'currency', 'category',
        );
      }
    });

    it('includes at least one DOWNGRADE, INVESTIGATE, and KEEP recommendation', () => {
      const rows = mockEntitlements(12);
      const recs = new Set(rows.map((r) => r.recommendation));
      expect(recs.has('DOWNGRADE')).to.equal(true);
      expect(recs.has('INVESTIGATE')).to.equal(true);
      expect(recs.has('KEEP')).to.equal(true);
    });

    it('rows flagged unlimited:true have entitled=null', () => {
      const rows = mockEntitlements(12);
      for (const r of rows) {
        if (r.unlimited) expect(r.entitled).to.equal(null);
      }
    });

    it('history points each have yearMonth and usage', () => {
      const rows = mockEntitlements(12);
      const row = rows.find((r) => r.history.length);
      expect(row).to.exist;
      for (const p of row.history) {
        expect(p.yearMonth).to.match(/^\d{4}-\d{2}$/);
        expect(p.usage).to.be.a('number');
      }
    });

    it('DOWNGRADE rows with unitPrice produce non-null annualSaving', () => {
      const rows = mockEntitlements(12);
      const downgrades = rows.filter((r) => r.recommendation === 'DOWNGRADE');
      for (const r of downgrades) {
        if (r.unitPrice) expect(r.annualSaving).to.not.equal(null);
      }
    });
  });
});
