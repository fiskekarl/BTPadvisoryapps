'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/cleancore-service');

const { classify } = __test__;

describe('cleancore-service pure helpers', () => {

  describe('classify', () => {
    it('passes through when classification is already set', () => {
      const out = classify({ classification: 'CLEAN', severity: 'info', objectType: 'CLAS', packageName: 'ZACME' });
      expect(out.classification).to.equal('CLEAN');
    });

    it('flags IN_STACK_MOD when releasedApiOnly is false', () => {
      const out = classify({ releasedApiOnly: false, packageName: 'V', objectType: 'CLAS' });
      expect(out.classification).to.equal('IN_STACK_MOD');
      expect(out.severity).to.equal('error');
    });

    it('classifies as SIDE_BY_SIDE when package starts with Z and released-only', () => {
      const out = classify({ releasedApiOnly: true, packageName: 'ZACME_ORDERS', objectType: 'CLAS' });
      expect(out.classification).to.equal('SIDE_BY_SIDE');
      expect(out.severity).to.equal('info');
    });

    it('classifies as SIDE_BY_SIDE when package starts with Y and released-only', () => {
      const out = classify({ releasedApiOnly: true, packageName: 'YACME', objectType: 'CLAS' });
      expect(out.classification).to.equal('SIDE_BY_SIDE');
    });

    it('classifies as KEY_USER_EXT for BADI in non-Z/Y package', () => {
      const out = classify({ releasedApiOnly: true, packageName: 'SAP_BS_FND', objectType: 'BADI' });
      expect(out.classification).to.equal('KEY_USER_EXT');
      expect(out.severity).to.equal('warn');
    });

    it('classifies as CLEAN when released and not BADI and not Z/Y', () => {
      const out = classify({ releasedApiOnly: true, packageName: 'SAP_BS_FND', objectType: 'CLAS' });
      expect(out.classification).to.equal('CLEAN');
      expect(out.severity).to.equal('info');
    });
  });
});
