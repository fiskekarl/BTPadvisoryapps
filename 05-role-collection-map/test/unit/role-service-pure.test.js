'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const sa = require('../../srv/lib/subaccount-clients');
const { __test__ } = require('../../srv/role-service');

const { inferTier, loadAssignments } = __test__;

describe('role-service pure helpers', () => {

  describe('inferTier', () => {
    it('prefers saKey.tier when present', () => {
      expect(inferTier({ tier: 'qa' }, { displayName: 'Prod Cluster' })).to.equal('qa');
    });

    it('falls back to subaccount labels.tier (array form)', () => {
      expect(inferTier({}, { labels: { tier: ['prod'] } })).to.equal('prod');
    });

    it('falls back to subaccount labels.tier (scalar form)', () => {
      expect(inferTier({}, { labels: { tier: 'dev' } })).to.equal('dev');
    });

    it('falls back to environment-tier label', () => {
      expect(inferTier({}, { labels: { 'environment-tier': 'qa' } })).to.equal('qa');
    });

    it('falls back to landscape label', () => {
      expect(inferTier({}, { labels: { landscape: 'prod' } })).to.equal('prod');
    });

    it('infers from displayName keyword when no labels present', () => {
      expect(inferTier({}, { displayName: 'My Sandbox' })).to.equal('dev');
      expect(inferTier({}, { displayName: 'Acme PROD' })).to.equal('prod');
      expect(inferTier({}, { displayName: 'QA-east' })).to.equal('qa');
      expect(inferTier({}, { displayName: 'Test01' })).to.equal('qa');
    });

    it('infers from saKey.subaccountName when subaccount is null', () => {
      expect(inferTier({ subaccountName: 'Production' }, null)).to.equal('prod');
    });

    it('returns "unknown" when nothing matches', () => {
      expect(inferTier({}, { displayName: 'random-name' })).to.equal('unknown');
      expect(inferTier(null, null)).to.equal('unknown');
    });
  });

  describe('loadAssignments', () => {
    afterEach(() => sinon.restore());

    it('returns [] when no saKeys have an xsuaa block', async () => {
      const out = await loadAssignments([{ subaccountId: 'x' }], {});
      expect(out).to.deep.equal([]);
    });

    it('flattens RC → users into rows with email lowercased', async () => {
      sinon.stub(sa, 'getRoleCollections').resolves([
        { name: 'Admin', description: 'Full admin' },
      ]);
      sinon.stub(sa, 'getRoleCollectionUsers').resolves([
        { email: 'ALICE@acme.com', name: 'Alice', origin: 'ias' },
        { email: 'BOB@acme.com',   name: 'Bob',   origin: 'ias' },
      ]);

      const saKeys = [{
        subaccountId: 'sub-001',
        subaccountName: 'Production',
        tier: 'prod',
        xsuaa: { uaa: { clientid: 'c' }, apiurl: 'https://x' },
      }];
      const out = await loadAssignments(saKeys, {});
      expect(out).to.have.length(2);
      expect(out[0].email).to.equal('alice@acme.com'); // lowercased
      expect(out[0].rcName).to.equal('Admin');
      expect(out[0].tier).to.equal('prod');
      expect(out[0].subaccountId).to.equal('sub-001');
    });

    it('skips a subaccount whose getRoleCollections throws', async () => {
      sinon.stub(sa, 'getRoleCollections').rejects(new Error('boom'));
      const usersStub = sinon.stub(sa, 'getRoleCollectionUsers');

      const saKeys = [{
        subaccountId: 'sub-001', subaccountName: 'Prod', tier: 'prod',
        xsuaa: { uaa: { clientid: 'c' }, apiurl: 'https://x' },
      }];
      const out = await loadAssignments(saKeys, {});
      expect(out).to.deep.equal([]);
      expect(usersStub.called).to.equal(false);
    });

    it('skips a single RC whose users-fetch throws but keeps the others', async () => {
      sinon.stub(sa, 'getRoleCollections').resolves([
        { name: 'A' }, { name: 'B' },
      ]);
      sinon.stub(sa, 'getRoleCollectionUsers').callsFake(async (_k, rcName) => {
        if (rcName === 'A') throw new Error('forbidden');
        return [{ email: 'ok@acme.com', name: 'OK' }];
      });

      const saKeys = [{
        subaccountId: 'sub-001', subaccountName: 'Prod', tier: 'prod',
        xsuaa: { uaa: { clientid: 'c' }, apiurl: 'https://x' },
      }];
      const out = await loadAssignments(saKeys, {});
      expect(out).to.have.length(1);
      expect(out[0].rcName).to.equal('B');
    });
  });
});
