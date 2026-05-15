'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/score-service');
const { subaccounts, destinations, canonicalRules } = require('../helpers/fixtures');

const { buildScorecard, gradeFor } = __test__;

describe('buildScorecard', () => {
  it('returns grade A when every rule passes and no errors are recorded', () => {
    const cleanSubs = [{ subaccountId: 'p', displayName: 'Prod', tier: 'prod', costCenter: 'CC' }];
    const out = buildScorecard({
      rules: [canonicalRules.costCenterRequired],
      subaccounts: cleanSubs,
      destinations: [],
    });
    expect(out.overallGrade).to.equal('A');
    expect(out.overallScore).to.equal(100);
    expect(out.perSubaccount[0].failed).to.equal(0);
    expect(out.perSubaccount[0].grade).to.equal('A');
  });

  it('downgrades the overall grade when an error-severity rule fails', () => {
    const subs = [{ subaccountId: 'p', displayName: 'Prod', tier: 'prod', costCenter: '' }];
    const out = buildScorecard({
      rules: [canonicalRules.costCenterRequired],
      subaccounts: subs,
      destinations: [],
    });
    expect(out.overallGrade).to.match(/^[BCDF]$/);
    expect(out.perSubaccount[0].errorCount).to.equal(1);
  });

  it('counts warns separately from errors', () => {
    const subs = [{ subaccountId: 'p', displayName: 'Inactive', tier: 'prod', daysInactive: 120 }];
    const out = buildScorecard({
      rules: [canonicalRules.inactive90],
      subaccounts: subs,
      destinations: [],
    });
    expect(out.perSubaccount[0].warnCount).to.equal(1);
    expect(out.perSubaccount[0].errorCount).to.equal(0);
  });

  it('silently skips rules with an unknown kind', () => {
    const out = buildScorecard({
      rules: [{ id: 'X', kind: 'no-such-evaluator', severity: 'warn', paramsJson: '{}' }],
      subaccounts,
      destinations,
    });
    expect(out.findings).to.deep.equal([]);
  });

  it('tolerates malformed paramsJson without throwing', () => {
    const out = buildScorecard({
      rules: [{ id: 'X', title: 'X', kind: 'label-required', severity: 'warn', paramsJson: '{not json' }],
      subaccounts,
      destinations,
    });
    expect(out).to.have.property('findings');
    expect(out.findings).to.be.an('array');
  });

  it('records subaccountCount and ruleCount accurately', () => {
    const out = buildScorecard({
      rules: Object.values(canonicalRules),
      subaccounts,
      destinations,
    });
    expect(out.subaccountCount).to.equal(subaccounts.length);
    expect(out.ruleCount).to.equal(Object.keys(canonicalRules).length);
  });

  it('returns 100 when no rules execute (empty rule set)', () => {
    const out = buildScorecard({ rules: [], subaccounts, destinations });
    expect(out.overallScore).to.equal(100);
    expect(out.overallGrade).to.equal('A');
  });

  it('populates findings with category and severity from the rule', () => {
    const subs = [{ subaccountId: 'p', displayName: 'Prod', tier: 'prod', costCenter: '' }];
    const out = buildScorecard({
      rules: [canonicalRules.costCenterRequired],
      subaccounts: subs,
      destinations: [],
    });
    const f = out.findings[0];
    expect(f.category).to.equal('governance');
    expect(f.severity).to.equal('error');
    expect(f.ruleId).to.equal('CC');
    expect(f.subaccountName).to.equal('Prod');
  });
});

describe('gradeFor', () => {
  it('returns A only when score >= 95 and zero errors', () => {
    expect(gradeFor(100, 0)).to.equal('A');
    expect(gradeFor(95, 0)).to.equal('A');
    expect(gradeFor(94.99, 0)).to.equal('B');
  });

  it('caps the grade at B when any error is present, regardless of score', () => {
    expect(gradeFor(100, 1)).to.equal('B');
    expect(gradeFor(90, 1)).to.equal('B');
    expect(gradeFor(89, 1)).to.equal('C');
    expect(gradeFor(74, 1)).to.equal('D');
  });

  it('returns F when score < 50 with no errors', () => {
    expect(gradeFor(49, 0)).to.equal('F');
    expect(gradeFor(0, 0)).to.equal('F');
  });

  it('returns C in the 70-84 band with no errors', () => {
    expect(gradeFor(70, 0)).to.equal('C');
    expect(gradeFor(84.99, 0)).to.equal('C');
  });
});
