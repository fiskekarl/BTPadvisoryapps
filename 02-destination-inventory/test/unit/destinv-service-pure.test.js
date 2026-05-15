'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/destinv-service');

const { daysUntil, parseCertNotAfter, getDestinationKeys } = __test__;

describe('destinv-service pure helpers', () => {

  describe('daysUntil', () => {
    it('returns null for missing date', () => {
      expect(daysUntil(null)).to.equal(null);
      expect(daysUntil(undefined)).to.equal(null);
      expect(daysUntil('')).to.equal(null);
    });

    it('returns a positive integer for a future date', () => {
      const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
      const d = daysUntil(future);
      expect(d).to.be.within(9, 11); // tolerate clock rounding
    });

    it('returns a negative integer for a past date', () => {
      const past = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
      expect(daysUntil(past)).to.be.lessThan(0);
    });
  });

  describe('parseCertNotAfter', () => {
    it('returns null when no Certificates array', () => {
      expect(parseCertNotAfter({})).to.equal(null);
      expect(parseCertNotAfter({ Certificates: [] })).to.equal(null);
    });

    it('returns null for invalid base64/PEM content', () => {
      expect(parseCertNotAfter({ Certificates: [{ Content: 'not-base64-pem' }] })).to.equal(null);
    });
  });

  describe('getDestinationKeys', () => {
    afterEach(() => {
      delete process.env.DESTINATION_KEYS;
      delete process.env.VCAP_SERVICES;
    });

    it('returns null when neither env var is set', () => {
      expect(getDestinationKeys()).to.equal(null);
    });

    it('parses DESTINATION_KEYS env var', () => {
      process.env.DESTINATION_KEYS = JSON.stringify([
        { subaccountId: 'sub-1', subaccountName: 'A', uaa: { clientid: 'c' }, uri: 'https://x' },
      ]);
      const keys = getDestinationKeys();
      expect(keys).to.have.length(1);
      expect(keys[0].subaccountId).to.equal('sub-1');
    });

    it('returns null on malformed DESTINATION_KEYS JSON when no VCAP fallback', () => {
      process.env.DESTINATION_KEYS = '{malformed';
      expect(getDestinationKeys()).to.equal(null);
    });

    it('falls back to VCAP_SERVICES.destination when DESTINATION_KEYS missing', () => {
      process.env.VCAP_SERVICES = JSON.stringify({
        destination: [{ credentials: { uaa: { clientid: 'vcap' }, uri: 'https://dest' } }],
      });
      const keys = getDestinationKeys();
      expect(keys).to.have.length(1);
      expect(keys[0].subaccountId).to.equal('self');
    });
  });
});
