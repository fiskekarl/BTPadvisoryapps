'use strict';

const cds = require('@sap/cds');
const cis = require('./lib/cis-client');
const uas = require('./lib/uas-client');

function currentYM() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Apply chargeback policy split to a shared-service cost row.
function splitCost(row, policy, hierarchyByCC) {
  if (!policy || policy.splitType === 'direct') return [row];
  if (policy.splitType === 'even') {
    const ccs = Object.keys(hierarchyByCC);
    if (!ccs.length) return [row];
    const share = row.cost / ccs.length;
    return ccs.map((cc) => ({ ...row, costCenter: cc, cost: share, shared: true }));
  }
  if (policy.splitType === 'weighted') {
    let weights; try { weights = JSON.parse(policy.weightedJson || '{}'); } catch { weights = {}; }
    const total = Object.values(weights).reduce((s, v) => s + Number(v), 0);
    if (!total) return [row];
    return Object.entries(weights).map(([cc, w]) => ({
      ...row, costCenter: cc, cost: row.cost * (Number(w) / total), shared: true,
    }));
  }
  // proportional — split by direct spend; computed at aggregator level, not here.
  return [row];
}

class CostService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('cost-service');
    const cisCreds = cis.getCisCredentials();
    const uasCreds = uas.getUasCredentials();
    if (!cisCreds) LOG.warn('No CIS — mock subaccount labels');
    if (!uasCreds) LOG.warn('No UAS — mock cost data');

    // ── Internal: load + enrich raw cost rows ───────────────────────────────
    const loadRows = async (yearMonth) => {
      const ym = yearMonth || currentYM();

      const [subs, costs, hierarchy, policies] = await Promise.all([
        cisCreds ? cis.listSubaccounts(cisCreds) : Promise.resolve(mockSubs()),
        uasCreds ? uas.fetchSubaccountCost(uasCreds, ym) : Promise.resolve(mockCostRows(ym)),
        cds.db.run(SELECT.from('com.btpconsulting.costallocation.OrgHierarchyEntry')),
        cds.db.run(SELECT.from('com.btpconsulting.costallocation.ChargebackPolicy')),
      ]);

      const subByGuid = {};
      for (const s of subs) {
        const labels = s.labels || {};
        const get = (k) => Array.isArray(labels[k]) ? labels[k][0] : labels[k];
        subByGuid[s.guid || s.subaccountId] = {
          ...s,
          costCenter: get('costCenter') || get('cost-center') || '',
          department: get('department') || get('dept') || '',
        };
      }
      const hierByCC = {};
      for (const h of hierarchy) hierByCC[h.costCenter] = h;
      const polByService = {};
      for (const p of policies) polByService[p.serviceName] = p;

      const rows = [];
      for (const c of costs) {
        const sub = subByGuid[c.subaccountId] || {};
        const cc  = sub.costCenter || '';
        const hier = hierByCC[cc];
        const base = {
          subaccountId:   c.subaccountId,
          subaccountName: c.subaccountName || sub.displayName || c.subaccountId,
          costCenter:     cc,
          department:     sub.department || hier?.department || '',
          buName:         hier?.buName || '',
          productLine:    hier?.productLine || '',
          serviceName:    c.serviceName,
          planName:       c.planName || c.plan,
          cost:           Number(c.cost) || 0,
          currency:       c.currency || 'EUR',
          shared:         false,
        };
        const policy = polByService[c.serviceName];
        for (const row of splitCost(base, policy, hierByCC)) rows.push(row);
      }
      return { rows, hierByCC };
    };

    // ── getSummary ───────────────────────────────────────────────────────────
    this.on('getSummary', async (req) => {
      const { rows } = await loadRows(req.data?.yearMonth);
      const total = rows.reduce((s, r) => s + r.cost, 0);
      const allocated = rows.filter((r) => r.costCenter).reduce((s, r) => s + r.cost, 0);
      const unallocated = total - allocated;
      return {
        totalCost:       Math.round(total * 100) / 100,
        currency:        rows[0]?.currency || 'EUR',
        allocatedPct:    total > 0 ? Math.round((allocated / total) * 10000) / 100 : 0,
        costCenters:     new Set(rows.map((r) => r.costCenter).filter(Boolean)).size,
        businessUnits:   new Set(rows.map((r) => r.buName).filter(Boolean)).size,
        departments:     new Set(rows.map((r) => r.department).filter(Boolean)).size,
        unallocatedCost: Math.round(unallocated * 100) / 100,
      };
    });

    // ── getCostTree ──────────────────────────────────────────────────────────
    this.on('getCostTree', async (req) => {
      const { rows } = await loadRows(req.data?.yearMonth);
      const nodes = [];
      const agg = (key) => {
        const m = {};
        for (const r of rows) {
          const k = r[key] || '(Unassigned)';
          if (!m[k]) m[k] = { cost: 0, children: new Set() };
          m[k].cost += r.cost;
          if (key === 'buName')      m[k].children.add(r.productLine || '(Unassigned)');
          if (key === 'productLine') m[k].children.add(r.costCenter || '(Unassigned)');
          if (key === 'costCenter')  m[k].children.add(r.subaccountId);
        }
        return m;
      };

      const bus = agg('buName');
      for (const [name, v] of Object.entries(bus)) {
        nodes.push({ nodeType: 'bu', nodeId: name, nodeName: name, parentId: '',
                     cost: round2(v.cost), currency: 'EUR', childCount: v.children.size });
      }
      const prods = agg('productLine');
      for (const [name, v] of Object.entries(prods)) {
        const parentBu = rows.find((r) => r.productLine === name)?.buName || '(Unassigned)';
        nodes.push({ nodeType: 'product', nodeId: name, nodeName: name, parentId: parentBu,
                     cost: round2(v.cost), currency: 'EUR', childCount: v.children.size });
      }
      const ccs = agg('costCenter');
      for (const [name, v] of Object.entries(ccs)) {
        const parentProd = rows.find((r) => r.costCenter === name)?.productLine || '(Unassigned)';
        nodes.push({ nodeType: 'costcenter', nodeId: name, nodeName: name, parentId: parentProd,
                     cost: round2(v.cost), currency: 'EUR', childCount: v.children.size });
      }
      return nodes;
    });

    // ── getInvoices ──────────────────────────────────────────────────────────
    this.on('getInvoices', async (req) => {
      const ym = req.data?.yearMonth || currentYM();
      const { rows } = await loadRows(ym);
      const byCC = {};
      for (const r of rows) {
        const cc = r.costCenter || '(Unassigned)';
        if (!byCC[cc]) byCC[cc] = { directCost: 0, sharedCost: 0, lineItems: [],
                                     buName: r.buName, department: r.department };
        if (r.shared) byCC[cc].sharedCost += r.cost; else byCC[cc].directCost += r.cost;
        byCC[cc].lineItems.push(r);
      }
      return Object.entries(byCC).map(([cc, v]) => ({
        costCenter:  cc,
        buName:      v.buName,
        department:  v.department,
        yearMonth:   ym,
        directCost:  round2(v.directCost),
        sharedCost:  round2(v.sharedCost),
        totalCost:   round2(v.directCost + v.sharedCost),
        currency:    'EUR',
        lineItems:   v.lineItems,
      })).sort((a, b) => b.totalCost - a.totalCost);
    });

    return super.init();
  }
}

function round2(n) { return Math.round(n * 100) / 100; }

module.exports = CostService;

// ─── Mock data ────────────────────────────────────────────────────────────────
function mockSubs() {
  return [
    { guid: 'sub-001', displayName: 'Production',  labels: { costCenter: 'CC-1001', department: 'IT Operations' } },
    { guid: 'sub-002', displayName: 'QA',          labels: { costCenter: 'CC-1002', department: 'Software Eng' } },
    { guid: 'sub-003', displayName: 'Dev',         labels: { costCenter: 'CC-1002', department: 'Software Eng' } },
    { guid: 'sub-004', displayName: 'Integration', labels: { costCenter: 'CC-1004', department: 'Architecture' } },
    { guid: 'sub-005', displayName: 'Sandbox',     labels: {} },
    { guid: 'sub-006', displayName: 'Analytics',   labels: { costCenter: 'CC-1003', department: 'Finance & BI' } },
    { guid: 'sub-007', displayName: 'Portal',      labels: { costCenter: 'CC-1005', department: 'Digital Workplace' } },
  ];
}

function mockCostRows(_ym) {
  return [
    { subaccountId: 'sub-001', subaccountName: 'Production',  serviceName: 'SAP HANA Cloud',         planName: 'hana',                 cost: 1280, currency: 'EUR' },
    { subaccountId: 'sub-001', subaccountName: 'Production',  serviceName: 'SAP Integration Suite', planName: 'enterprise_agreement', cost: 600,  currency: 'EUR' },
    { subaccountId: 'sub-001', subaccountName: 'Production',  serviceName: 'Cloud Foundry Runtime', planName: 'standard',             cost: 200,  currency: 'EUR' },
    { subaccountId: 'sub-002', subaccountName: 'QA',          serviceName: 'SAP HANA Cloud',         planName: 'hana',                 cost: 640,  currency: 'EUR' },
    { subaccountId: 'sub-002', subaccountName: 'QA',          serviceName: 'Cloud Foundry Runtime', planName: 'standard',             cost: 80,   currency: 'EUR' },
    { subaccountId: 'sub-003', subaccountName: 'Dev',         serviceName: 'SAP HANA Cloud',         planName: 'hana',                 cost: 320,  currency: 'EUR' },
    { subaccountId: 'sub-004', subaccountName: 'Integration', serviceName: 'SAP Integration Suite', planName: 'enterprise_agreement', cost: 400,  currency: 'EUR' },
    { subaccountId: 'sub-004', subaccountName: 'Integration', serviceName: 'SAP Event Mesh',         planName: 'default',              cost: 200,  currency: 'EUR' },
    { subaccountId: 'sub-005', subaccountName: 'Sandbox',     serviceName: 'Cloud Foundry Runtime', planName: 'standard',             cost: 95,   currency: 'EUR' },
    { subaccountId: 'sub-006', subaccountName: 'Analytics',   serviceName: 'SAP Analytics Cloud',   planName: 'standard',             cost: 500,  currency: 'EUR' },
    { subaccountId: 'sub-006', subaccountName: 'Analytics',   serviceName: 'SAP Datasphere',         planName: 'standard',             cost: 850,  currency: 'EUR' },
    { subaccountId: 'sub-007', subaccountName: 'Portal',      serviceName: 'SAP Build Work Zone',    planName: 'standard',             cost: 750,  currency: 'EUR' },
    { subaccountId: 'sub-007', subaccountName: 'Portal',      serviceName: 'Document Management',    planName: 'standard',             cost: 150,  currency: 'EUR' },
    // Shared services for split policy demo
    { subaccountId: 'sub-001', subaccountName: 'Production',  serviceName: 'XSUAA Application',      planName: 'application',          cost: 220,  currency: 'EUR' },
    { subaccountId: 'sub-001', subaccountName: 'Production',  serviceName: 'Audit Log Service',      planName: 'standard',             cost: 110,  currency: 'EUR' },
  ];
}
