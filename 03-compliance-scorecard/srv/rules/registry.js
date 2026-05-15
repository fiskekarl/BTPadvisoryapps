'use strict';

/**
 * Rule evaluators — registered by `kind` so new rules can be added by
 * dropping a new evaluator here without changing the API surface.
 *
 * Each evaluator takes `(params, ctx)` where:
 *   params  = JSON parsed from Rule.paramsJson
 *   ctx     = { subaccounts: [...], destinations: [...] }
 *
 * Returns: array of { subaccountId, passed, summary, detailJson }
 */

const evaluators = {

  // ─── label-required ────────────────────────────────────────────────────────
  'label-required': (params, ctx) => {
    const targets = filterByScope(ctx.subaccounts, params.scope);
    return targets.map((sa) => {
      const present = !!sa[params.label]; // expected fields: costCenter, department
      return {
        subaccountId: sa.subaccountId,
        passed:       present,
        summary:      present
          ? `Label "${params.label}" present`
          : `Label "${params.label}" missing on ${sa.displayName}`,
        detailJson:   JSON.stringify({ scope: params.scope, label: params.label }),
      };
    });
  },

  // ─── destination-auth-forbidden ────────────────────────────────────────────
  'destination-auth-forbidden': (params, ctx) => {
    const targetSubs = filterByScope(ctx.subaccounts, params.scope);
    const out = [];
    for (const sa of targetSubs) {
      const dests = ctx.destinations.filter((d) => d.subaccountId === sa.subaccountId);
      const offenders = dests.filter((d) => params.forbidden.includes(d.authentication));
      if (offenders.length === 0) {
        out.push({ subaccountId: sa.subaccountId, passed: true,
                   summary: `No forbidden auth methods on ${sa.displayName}`, detailJson: '{}' });
      } else {
        out.push({
          subaccountId: sa.subaccountId,
          passed:       false,
          summary:      `${offenders.length} destination(s) on ${sa.displayName} use forbidden auth`,
          detailJson:   JSON.stringify({ offenders: offenders.map((d) => ({ name: d.name, auth: d.authentication })) }),
        });
      }
    }
    return out;
  },

  // ─── max-days-inactive ─────────────────────────────────────────────────────
  'max-days-inactive': (params, ctx) => {
    return ctx.subaccounts.map((sa) => {
      const days = sa.daysInactive ?? 0;
      const passed = days <= (params.maxDays || 90);
      return {
        subaccountId: sa.subaccountId,
        passed,
        summary: passed
          ? `Active within ${params.maxDays} days`
          : `Inactive for ${days} days (threshold ${params.maxDays})`,
        detailJson: JSON.stringify({ daysInactive: days }),
      };
    });
  },

  // ─── name-pattern ──────────────────────────────────────────────────────────
  'name-pattern': (params, ctx) => {
    const re = new RegExp(params.pattern, params.flags || '');
    return ctx.subaccounts.map((sa) => {
      const passed = re.test(sa.displayName || '');
      return {
        subaccountId: sa.subaccountId,
        passed,
        summary: passed
          ? `displayName matches naming convention`
          : `displayName "${sa.displayName}" doesn't match /${params.pattern}/${params.flags || ''}`,
        detailJson: JSON.stringify({ displayName: sa.displayName }),
      };
    });
  },

  // ─── mfa-for-admin-rcs ─────────────────────────────────────────────────────
  // TODO: requires IAS API integration. Returns a single global "not yet
  // evaluated" finding so the rule appears in the UI as "needs IAS binding".
  'mfa-for-admin-rcs': (_params, ctx) => {
    if (!process.env.IAS_API_URL) {
      return ctx.subaccounts.map((sa) => ({
        subaccountId: sa.subaccountId,
        passed:       false,
        summary:      `IAS not bound — cannot verify MFA for admin role-collections`,
        detailJson:   JSON.stringify({ requiresEnv: 'IAS_API_URL' }),
      }));
    }
    // TODO: real implementation queries
    //   GET ${IAS_API_URL}/Applications  → discover authentication policies
    //   GET ${IAS_API_URL}/Applications/{id}  → check MFA enforcement
    // and joins with XSUAA role-collection enumeration from CIS.
    return [];
  },
};

function filterByScope(subaccounts, scope) {
  if (!scope || scope === 'all') return subaccounts;
  if (scope === 'prod') return subaccounts.filter((s) => s.tier === 'prod' || s.usedForProd === 'USED_FOR_PRODUCTION');
  if (scope === 'qa')   return subaccounts.filter((s) => s.tier === 'qa');
  if (scope === 'dev')  return subaccounts.filter((s) => s.tier === 'dev');
  return subaccounts;
}

module.exports = { evaluators };
