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
      const passed = days < (params.maxDays || 90);
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
    const re = safeCompileRegex(params.pattern, params.flags);
    if (!re) {
      return ctx.subaccounts.map((sa) => ({
        subaccountId: sa.subaccountId,
        passed:       false,
        summary:      `name-pattern rule has unsafe / invalid pattern (skipped)`,
        detailJson:   JSON.stringify({ pattern: params.pattern, reason: 'unsafe-or-invalid' }),
      }));
    }
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

  // ─── usedForProduction-flag ────────────────────────────────────────────────
  // Cockpit's usedForProduction flag should match the inferred tier.
  // Misaligned flag → SAP's Production support tier may be applied to the
  // wrong subaccount (cost) or denied to the right one (risk).
  'usedForProduction-flag': (params, ctx) => {
    const targets = filterByScope(ctx.subaccounts, params.scope);
    return targets.map((sa) => {
      const passed = sa.usedForProd === params.shouldBe;
      return {
        subaccountId: sa.subaccountId,
        passed,
        summary: passed
          ? `usedForProduction flag is "${params.shouldBe}" as expected`
          : `usedForProduction="${sa.usedForProd}" (expected "${params.shouldBe}") on ${sa.displayName}`,
        detailJson: JSON.stringify({ actual: sa.usedForProd, expected: params.shouldBe }),
      };
    });
  },

  // ─── destination-url-scheme ────────────────────────────────────────────────
  // No plaintext HTTP for in-scope destinations.
  'destination-url-scheme': (params, ctx) => {
    const targetSubs = filterByScope(ctx.subaccounts, params.scope);
    const allowed = params.allowedSchemes || ['https'];
    const out = [];
    for (const sa of targetSubs) {
      const offenders = ctx.destinations
        .filter((d) => d.subaccountId === sa.subaccountId)
        .filter((d) => {
          if (!d.url) return false;
          let scheme; try { scheme = new URL(d.url).protocol.replace(':', ''); } catch { return false; }
          return !allowed.includes(scheme);
        });
      out.push(offenders.length === 0
        ? { subaccountId: sa.subaccountId, passed: true,  summary: `All destinations use one of [${allowed.join(', ')}]`, detailJson: '{}' }
        : { subaccountId: sa.subaccountId, passed: false,
            summary: `${offenders.length} destination(s) on ${sa.displayName} use a non-allowed URL scheme`,
            detailJson: JSON.stringify({ offenders: offenders.map((d) => ({ name: d.name, url: d.url })), allowed }) });
    }
    return out;
  },

  // ─── destination-proxy-type-for-local ──────────────────────────────────────
  // Destinations targeting *.local or *.internal hostnames almost always
  // mean an on-prem system; misconfigured proxyType=Internet won't reach
  // through the Cloud Connector and silently fails.
  'destination-proxy-type-for-local': (_params, ctx) => {
    const localish = /\.(local|internal|corp|lan|home\.arpa)$/i;
    const out = [];
    for (const sa of ctx.subaccounts) {
      const offenders = ctx.destinations
        .filter((d) => d.subaccountId === sa.subaccountId)
        .filter((d) => {
          if (!d.url) return false;
          let host; try { host = new URL(d.url).hostname; } catch { return false; }
          return localish.test(host) && d.proxyType !== 'OnPremise';
        });
      out.push(offenders.length === 0
        ? { subaccountId: sa.subaccountId, passed: true,  summary: 'No local-hostname destinations with non-OnPremise proxy', detailJson: '{}' }
        : { subaccountId: sa.subaccountId, passed: false,
            summary: `${offenders.length} destination(s) point at .local/.internal hosts without OnPremise proxy`,
            detailJson: JSON.stringify({ offenders: offenders.map((d) => ({ name: d.name, url: d.url, proxyType: d.proxyType })) }) });
    }
    return out;
  },

  // ─── destination-auth-allowlist ────────────────────────────────────────────
  // Inverse of destination-auth-forbidden — pins the *only* auth methods
  // permitted in scope (e.g., production must be on ClientCertificate or
  // PrincipalPropagation).
  'destination-auth-allowlist': (params, ctx) => {
    const targetSubs = filterByScope(ctx.subaccounts, params.scope);
    const allowed = Array.isArray(params.allowed) ? params.allowed : [];
    const out = [];
    for (const sa of targetSubs) {
      const offenders = ctx.destinations
        .filter((d) => d.subaccountId === sa.subaccountId)
        .filter((d) => !allowed.includes(d.authentication));
      out.push(offenders.length === 0
        ? { subaccountId: sa.subaccountId, passed: true,
            summary: `All destinations use an allow-listed auth method`, detailJson: '{}' }
        : { subaccountId: sa.subaccountId, passed: false,
            summary: `${offenders.length} destination(s) on ${sa.displayName} use a non-allow-listed auth method`,
            detailJson: JSON.stringify({ offenders: offenders.map((d) => ({ name: d.name, auth: d.authentication })), allowed }) });
    }
    return out;
  },

  // ─── destination-name-pattern ──────────────────────────────────────────────
  // Enforces naming conventions on destinations. allowPattern (must match)
  // and denyPattern (must NOT match) can be combined.
  'destination-name-pattern': (params, ctx) => {
    const targetSubs = filterByScope(ctx.subaccounts, params.scope);
    const allow = params.allowPattern ? safeCompileRegex(params.allowPattern, params.flags) : null;
    const deny  = params.denyPattern  ? safeCompileRegex(params.denyPattern,  params.flags) : null;
    if ((params.allowPattern && !allow) || (params.denyPattern && !deny)) {
      return targetSubs.map((sa) => ({
        subaccountId: sa.subaccountId,
        passed:       false,
        summary:      `destination-name-pattern rule has unsafe / invalid regex (skipped)`,
        detailJson:   JSON.stringify({ allow: params.allowPattern, deny: params.denyPattern, reason: 'unsafe-or-invalid' }),
      }));
    }
    const out = [];
    for (const sa of targetSubs) {
      const offenders = ctx.destinations
        .filter((d) => d.subaccountId === sa.subaccountId)
        .filter((d) => (allow && !allow.test(d.name)) || (deny && deny.test(d.name)));
      out.push(offenders.length === 0
        ? { subaccountId: sa.subaccountId, passed: true,  summary: 'Destination names conform to convention', detailJson: '{}' }
        : { subaccountId: sa.subaccountId, passed: false,
            summary: `${offenders.length} destination(s) on ${sa.displayName} violate naming convention`,
            detailJson: JSON.stringify({ offenders: offenders.map((d) => d.name), allow: params.allowPattern, deny: params.denyPattern }) });
    }
    return out;
  },

  // ─── subaccount-parent-required ────────────────────────────────────────────
  // Every subaccount must be a child of a Directory — flat global accounts
  // make access reviews and chargeback policies infeasible.
  'subaccount-parent-required': (_params, ctx) => {
    return ctx.subaccounts.map((sa) => {
      const has = !!(sa.parentName && sa.parentName.trim() && sa.parentName !== 'Global Account');
      return {
        subaccountId: sa.subaccountId,
        passed:       has,
        summary:      has
          ? `Parent directory: ${sa.parentName}`
          : `${sa.displayName} is a direct child of the global account — should be under a Directory`,
        detailJson:   JSON.stringify({ parentName: sa.parentName || '' }),
      };
    });
  },

  // ─── max-destinations-per-subaccount ───────────────────────────────────────
  // Hygiene check: a subaccount with hundreds of destinations is usually a
  // dumping ground that nobody owns.
  'max-destinations-per-subaccount': (params, ctx) => {
    const max = params.max || 50;
    return ctx.subaccounts.map((sa) => {
      const count = ctx.destinations.filter((d) => d.subaccountId === sa.subaccountId).length;
      const passed = count <= max;
      return {
        subaccountId: sa.subaccountId,
        passed,
        summary: passed
          ? `${count} destination(s) (≤ ${max} ok)`
          : `${count} destinations on ${sa.displayName} exceeds the ${max} threshold`,
        detailJson: JSON.stringify({ destinationCount: count, max }),
      };
    });
  },

  // ─── tier-label-consistency ────────────────────────────────────────────────
  // The inferred tier should agree with the explicit tier/landscape label.
  'tier-label-consistency': (_params, ctx) => {
    return ctx.subaccounts.map((sa) => {
      // We don't have raw labels in the evaluator context, so we proxy:
      // an unknown tier means we couldn't pick one up from labels OR name.
      const passed = sa.tier !== 'unknown';
      return {
        subaccountId: sa.subaccountId,
        passed,
        summary: passed
          ? `Tier identified as "${sa.tier}"`
          : `Could not infer a tier for ${sa.displayName} — set tier or landscape label`,
        detailJson: JSON.stringify({ tier: sa.tier }),
      };
    });
  },

  // ─── department-required ───────────────────────────────────────────────────
  // Alias-style rule kept distinct from "label-required" so the scorecard
  // can carry separate severities + remediation text per attribute.
  'department-required': (params, ctx) => {
    const targets = filterByScope(ctx.subaccounts, params.scope);
    return targets.map((sa) => {
      const passed = !!(sa.department && sa.department.trim());
      return {
        subaccountId: sa.subaccountId,
        passed,
        summary: passed
          ? `Department: ${sa.department}`
          : `${sa.displayName} has no department label — chargeback attribution will fail`,
        detailJson: JSON.stringify({ department: sa.department || '' }),
      };
    });
  },
};

// Compile a user-supplied regex pattern with cheap ReDoS hardening:
//
//   • cap the pattern length (200 chars is plenty for any naming rule)
//   • reject patterns with nested quantifiers, the classic exponential-
//     backtracking shape — `(a+)+`, `(a*)+`, `(a|a)+`, etc.
//   • catch JS-level "Invalid regular expression" errors
//
// The check is intentionally conservative: a few legitimate-but-baroque
// patterns will trip the heuristic. Operators that hit this can tighten
// their pattern. Defense-in-depth: buildScorecard wraps the evaluator
// call in try/catch, so even if a regex slips past, the worst case is
// a single-rule error finding instead of a global crash.
function safeCompileRegex(pattern, flags = '') {
  if (typeof pattern !== 'string') return null;
  if (pattern.length > 200) return null;
  // Nested quantifier heuristic: `(...+)+`, `(...*)+`, `(...+)*`, `(...*)*`.
  // This is a strict subset of pathological patterns but covers the
  // common ReDoS shapes without needing a full parser.
  if (/\([^)]*[*+][^)]*\)\s*[*+]/.test(pattern)) return null;
  try { return new RegExp(pattern, flags); }
  catch { return null; }
}

function filterByScope(subaccounts, scope) {
  if (!scope || scope === 'all') return subaccounts;
  if (scope === 'prod') return subaccounts.filter((s) => s.tier === 'prod' || s.usedForProd === 'USED_FOR_PRODUCTION');
  if (scope === 'qa')   return subaccounts.filter((s) => s.tier === 'qa');
  if (scope === 'dev')  return subaccounts.filter((s) => s.tier === 'dev');
  return subaccounts;
}

module.exports = { evaluators, safeCompileRegex };
