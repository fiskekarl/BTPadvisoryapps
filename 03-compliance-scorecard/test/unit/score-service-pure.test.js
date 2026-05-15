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

  it('tolerates a well-formed but incomplete params (regression: PR #4 bug)', () => {
    // destination-auth-allowlist used to crash with
    // "Cannot read properties of undefined (reading 'includes')"
    // when `allowed` was missing — taking down the entire getScorecard.
    const out = buildScorecard({
      rules: [{
        id:         'BAD_ALLOWLIST',
        title:      'Misconfigured allowlist',
        kind:       'destination-auth-allowlist',
        severity:   'error',
        paramsJson: '{"scope":"prod"}',  // no `allowed` array → defaults to []
      }],
      subaccounts,
      destinations,
    });
    expect(out).to.have.property('findings');
    // Subaccounts WITH destinations now fail (every dest is non-allow-listed
    // against the empty allow-list). Subaccounts with zero destinations
    // vacuously pass. Either way: no crash.
    const sub001 = out.findings.find((f) => f.subaccountId === 'sub-001');
    expect(sub001).to.exist;
    expect(sub001.passed).to.equal(false);
  });

  it('a rule that throws inside its evaluator does not crash the whole scorecard', () => {
    // Stitch a custom evaluator that always throws; buildScorecard must
    // surface error findings and continue with subsequent rules.
    const { evaluators } = require('../../srv/rules/registry');
    const orig = evaluators['__test_throw'];
    evaluators['__test_throw'] = () => { throw new Error('boom'); };

    try {
      const out = buildScorecard({
        rules: [
          { id: 'BAD',  title: 'Throws',  kind: '__test_throw',    severity: 'error', paramsJson: '{}' },
          { id: 'GOOD', title: 'Healthy', kind: 'label-required',  severity: 'warn',
            paramsJson: '{"scope":"prod","label":"costCenter"}' },
        ],
        subaccounts,
        destinations,
      });
      const bad = out.findings.filter((f) => f.ruleId === 'BAD');
      expect(bad.length).to.equal(subaccounts.length);
      expect(bad[0].summary).to.match(/failed to evaluate.*boom/);
      // The healthy rule should still produce findings.
      const good = out.findings.filter((f) => f.ruleId === 'GOOD');
      expect(good.length).to.be.greaterThan(0);
    } finally {
      if (orig) evaluators['__test_throw'] = orig; else delete evaluators['__test_throw'];
    }
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
