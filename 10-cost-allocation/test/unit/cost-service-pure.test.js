'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/cost-service');

const { currentYM, splitCost, round2, mockSubs, mockCostRows } = __test__;

describe('cost-service pure helpers', () => {

  describe('currentYM', () => {
    it('returns YYYY-MM format', () => {
      expect(currentYM()).to.match(/^\d{4}-\d{2}$/);
    });

    it('matches the current month', () => {
      const d = new Date();
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      expect(currentYM()).to.equal(expected);
    });
  });

  describe('round2', () => {
    it('rounds to two decimal places', () => {
      expect(round2(1.234)).to.equal(1.23);
      expect(round2(1.235)).to.equal(1.24);
    });

    it('leaves whole numbers unchanged', () => {
      expect(round2(42)).to.equal(42);
    });

    it('handles zero', () => {
      expect(round2(0)).to.equal(0);
    });
  });

  describe('splitCost', () => {
    const baseRow = {
      subaccountId: 'sub-001', serviceName: 'XSUAA', cost: 300, currency: 'EUR', costCenter: 'CC-1001', shared: false,
    };
    const hierarchyByCC = { 'CC-1001': {}, 'CC-1002': {}, 'CC-1003': {} };

    it('returns the row unchanged when policy is missing', () => {
      const out = splitCost(baseRow, null, hierarchyByCC);
      expect(out).to.have.length(1);
      expect(out[0]).to.deep.equal(baseRow);
    });

    it('returns the row unchanged for direct split', () => {
      const out = splitCost(baseRow, { splitType: 'direct' }, hierarchyByCC);
      expect(out).to.have.length(1);
      expect(out[0]).to.deep.equal(baseRow);
    });

    it('splits evenly across all cost-centers for even split', () => {
      const out = splitCost(baseRow, { splitType: 'even' }, hierarchyByCC);
      expect(out).to.have.length(3);
      for (const r of out) {
        expect(r.cost).to.equal(100);
        expect(r.shared).to.equal(true);
      }
      expect(out.map((r) => r.costCenter).sort()).to.deep.equal(['CC-1001', 'CC-1002', 'CC-1003']);
    });

    it('falls back to row unchanged when even split has no cost-centers', () => {
      const out = splitCost(baseRow, { splitType: 'even' }, {});
      expect(out).to.have.length(1);
      expect(out[0].cost).to.equal(300);
    });

    it('splits weighted across declared weights', () => {
      const policy = { splitType: 'weighted', weightedJson: JSON.stringify({ 'CC-1001': 0.4, 'CC-1002': 0.6 }) };
      const out = splitCost(baseRow, policy, hierarchyByCC);
      expect(out).to.have.length(2);
      const total = out.reduce((s, r) => s + r.cost, 0);
      expect(total).to.be.closeTo(300, 0.0001);
      const cc1 = out.find((r) => r.costCenter === 'CC-1001');
      const cc2 = out.find((r) => r.costCenter === 'CC-1002');
      expect(cc1.cost).to.be.closeTo(120, 0.0001);
      expect(cc2.cost).to.be.closeTo(180, 0.0001);
      expect(cc1.shared).to.equal(true);
    });

    it('returns row unchanged when weighted total is zero', () => {
      const policy = { splitType: 'weighted', weightedJson: JSON.stringify({}) };
      const out = splitCost(baseRow, policy, hierarchyByCC);
      expect(out).to.have.length(1);
      expect(out[0].cost).to.equal(300);
    });

    it('returns row unchanged when weighted JSON is malformed', () => {
      const policy = { splitType: 'weighted', weightedJson: '{not-json' };
      const out = splitCost(baseRow, policy, hierarchyByCC);
      expect(out).to.have.length(1);
    });

    it('returns row unchanged for proportional split (handled at aggregator level)', () => {
      const out = splitCost(baseRow, { splitType: 'proportional' }, hierarchyByCC);
      expect(out).to.have.length(1);
      expect(out[0]).to.deep.equal(baseRow);
    });
  });

  describe('mockSubs', () => {
    it('returns a non-empty array of subaccounts with labels', () => {
      const subs = mockSubs();
      expect(subs).to.be.an('array').with.length.greaterThan(0);
      for (const s of subs) {
        expect(s).to.include.keys('guid', 'displayName', 'labels');
      }
    });
  });

  describe('mockCostRows', () => {
    it('returns rows with the canonical shape', () => {
      const rows = mockCostRows('2024-06');
      expect(rows).to.be.an('array').with.length.greaterThan(0);
      for (const r of rows) {
        expect(r).to.include.keys('subaccountId', 'serviceName', 'planName', 'cost', 'currency');
        expect(r.cost).to.be.a('number');
      }
    });
  });
});
