'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/lifecycle-service');

const { isoToday, isoDaysAgo, fingerprint, inferTier, envFor } = __test__;

describe('lifecycle-service pure helpers', () => {

  describe('isoToday', () => {
    it('returns YYYY-MM-DD format', () => {
      expect(isoToday()).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('isoDaysAgo', () => {
    it('returns YYYY-MM-DD format', () => {
      expect(isoDaysAgo(7)).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns a date strictly earlier than today for positive n', () => {
      expect(isoDaysAgo(1) < isoToday()).to.equal(true);
    });

    it('today for n=0', () => {
      expect(isoDaysAgo(0)).to.equal(isoToday());
    });
  });

  describe('fingerprint', () => {
    it('returns a 24-char hex digest', () => {
      expect(fingerprint(['sub-1', 'label', 'costCenter'])).to.match(/^[0-9a-f]{24}$/);
    });

    it('is deterministic for the same input', () => {
      const a = fingerprint(['sub-1', 'label', 'costCenter']);
      const b = fingerprint(['sub-1', 'label', 'costCenter']);
      expect(a).to.equal(b);
    });

    it('differs across distinct inputs', () => {
      const a = fingerprint(['sub-1', 'label', 'costCenter']);
      const b = fingerprint(['sub-1', 'label', 'department']);
      expect(a).to.not.equal(b);
    });
  });

  describe('inferTier', () => {
    it('prefers saKey.tier when present', () => {
      expect(inferTier({ tier: 'qa' }, { displayName: 'Prod Cluster' })).to.equal('qa');
    });

    it('falls back to subaccount labels (tier)', () => {
      expect(inferTier(null, { labels: { tier: ['prod'] } })).to.equal('prod');
    });

    it('falls back to label "environment-tier"', () => {
      expect(inferTier(null, { labels: { 'environment-tier': 'qa' } })).to.equal('qa');
    });

    it('infers from displayName keyword when no labels', () => {
      expect(inferTier(null, { displayName: 'My Sandbox' })).to.equal('dev');
      expect(inferTier(null, { displayName: 'Acme PROD' })).to.equal('prod');
      expect(inferTier(null, { displayName: 'QA-east' })).to.equal('qa');
    });

    it('returns "unknown" when no signal is available', () => {
      expect(inferTier(null, { displayName: 'random-name' })).to.equal('unknown');
      expect(inferTier(null, null)).to.equal('unknown');
    });
  });

  describe('envFor', () => {
    it('returns CF when cloudfoundry is enabled', () => {
      expect(envFor(['cloudfoundry'])).to.equal('CF');
    });

    it('returns Kyma when kyma is enabled', () => {
      expect(envFor(['kyma'])).to.equal('Kyma');
    });

    it('returns "Other" for empty input', () => {
      expect(envFor([])).to.equal('Other');
      expect(envFor(null)).to.equal('Other');
    });

    it('returns first env when neither CF nor Kyma', () => {
      expect(envFor(['neo'])).to.equal('neo');
    });
  });
});
