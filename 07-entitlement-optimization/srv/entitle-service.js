'use strict';

const cds = require('@sap/cds');
const cis = require('./lib/cis-client');
const uas = require('./lib/uas-client');

// ─── Service ──────────────────────────────────────────────────────────────────
class EntitleService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('entitle-service');
    const cisCreds = cis.getCisCredentials();
    const uasCreds = uas.getUasCredentials();
    if (!cisCreds) LOG.warn('No CIS — mock mode for entitlements');
    if (!uasCreds) LOG.warn('No UAS — usage will be approximated from remaining quota');

    // ── getEntitlements ──────────────────────────────────────────────────────
    this.on('getEntitlements', async (req) => {
      const months = Math.min(Math.max(req.data.months || 12, 1), 24);

      if (!cisCreds) return mockEntitlements(months);

      // Fetch entitlements + monthlyUsage history in parallel
      const [services, usageMonths, anchors, acks] = await Promise.all([
        cis.listEntitlements(cisCreds),
        uasCreds ? uas.fetchMonthlyUsage(uasCreds, months) : Promise.resolve([]),
        cds.db.run(SELECT.from('com.btpconsulting.entitlement.ContractAnchor')),
        cds.db.run(SELECT.from('com.btpconsulting.entitlement.AcknowledgedRecommendation')),
      ]);

      // Index anchors and acks by (serviceName, planName)
      const anchorBy = {};
      for (const a of anchors) anchorBy[`${a.serviceName}||${a.planName}`] = a;
      const ackBy = {};
      const today = new Date().toISOString().slice(0, 10);
      for (const a of acks) {
        if (a.until && a.until < today) continue;
        ackBy[`${a.serviceName}||${a.planName}`] = a;
      }

      // Build per-(service,plan) usage history map
      const usageHistory = {}; // key -> [{ yearMonth, usage }]
      for (const m of usageMonths) {
        for (const item of m.content) {
          const svc  = item.serviceName || item.service;
          const plan = item.planName    || item.plan;
          const key  = `${svc}||${plan}`;
          if (!usageHistory[key]) usageHistory[key] = [];
          usageHistory[key].push({ yearMonth: m.yearMonth, usage: item.usage ?? 0 });
        }
      }

      // Map CIS entitlements → EntitlementRow rows
      const rows = [];
      for (const svc of services) {
        const svcName = svc.displayName || svc.name;
        for (const plan of svc.servicePlans ?? []) {
          const planName = plan.displayName || plan.name;
          const key = `${svcName}||${planName}`;
          const altKey = `${svc.name}||${plan.name}`;
          const history = usageHistory[key] || usageHistory[altKey] || [];
          const usages  = history.map((p) => Number(p.usage) || 0);
          const avg     = usages.length ? usages.reduce((s, v) => s + v, 0) / usages.length : 0;
          const peak    = usages.length ? Math.max(...usages) : 0;
          const entitled = plan.amount ?? 0;
          const utilizationPct = entitled > 0 ? Math.round((avg / entitled) * 10000) / 100 : 0;
          const anchor = anchorBy[key];
          const ack    = ackBy[key];

          let recommendation = 'KEEP';
          let suggestedQuota = entitled;
          if (!plan.unlimited && entitled > 0) {
            if (utilizationPct < 35) {
              recommendation = 'DOWNGRADE';
              // Suggest peak × 1.5 buffer, rounded up
              suggestedQuota = Math.max(Math.ceil(peak * 1.5), 1);
            } else if (utilizationPct > 85) {
              recommendation = 'INVESTIGATE';
            }
          }
          if (ack) recommendation = 'KEEP';   // operator-acknowledged

          const annualSaving = anchor && recommendation === 'DOWNGRADE'
            ? Math.round((entitled - suggestedQuota) * Number(anchor.unitPrice || 0) * 100) / 100
            : null;

          rows.push({
            serviceName:    svcName,
            planName,
            unit:           plan.metric || planName,
            entitled:       plan.unlimited ? null : entitled,
            unlimited:      !!plan.unlimited,
            avgUsage:       Math.round(avg * 100) / 100,
            peakUsage:      Math.round(peak * 100) / 100,
            utilizationPct,
            history,
            renewalDate:    anchor?.renewalDate || null,
            unitPrice:      anchor?.unitPrice || null,
            currency:       anchor?.currency || 'EUR',
            recommendation,
            suggestedQuota,
            annualSaving,
            category:       plan.category || '',
          });
        }
      }
      return rows;
    });

    // ── getRenewalAlerts ─────────────────────────────────────────────────────
    this.on('getRenewalAlerts', async (req) => {
      const daysAhead = Math.min(Math.max(req.data?.daysAhead || 90, 30), 365);
      const today = new Date();
      const limit = new Date(today); limit.setDate(today.getDate() + daysAhead);
      const limitIso = limit.toISOString().slice(0, 10);

      const rows = await this.send('getEntitlements', { months: 12 });
      return rows
        .filter((r) => r.renewalDate && r.renewalDate <= limitIso)
        .map((r) => ({
          serviceName:  r.serviceName,
          planName:     r.planName,
          renewalDate:  r.renewalDate,
          daysToRenewal: Math.floor((new Date(r.renewalDate).getTime() - today.getTime()) / 86_400_000),
          avgUsage:     r.avgUsage,
          entitled:     r.entitled,
          recommendation: r.recommendation,
          annualSaving: r.annualSaving,
          currency:     r.currency,
        }))
        .sort((a, b) => a.daysToRenewal - b.daysToRenewal);
    });

    // ── getSummary ───────────────────────────────────────────────────────────
    this.on('getSummary', async (req) => {
      const months = req.data?.months || 12;
      const rows = await this.send('getEntitlements', { months });
      const finite = rows.filter((r) => !r.unlimited);
      const saving = rows.reduce((s, r) => s + (Number(r.annualSaving) || 0), 0);

      const today = new Date();
      const in60 = new Date(today); in60.setDate(today.getDate() + 60);
      const in60Iso = in60.toISOString().slice(0, 10);

      return {
        totalEntitlements:     rows.length,
        underutilized:         finite.filter((r) => r.utilizationPct < 35).length,
        overutilized:          finite.filter((r) => r.utilizationPct > 85).length,
        renewalsNext60d:       rows.filter((r) => r.renewalDate && r.renewalDate <= in60Iso).length,
        estimatedAnnualSaving: Math.round(saving * 100) / 100,
        currency:              rows[0]?.currency || 'EUR',
      };
    });

    return super.init();
  }
}

module.exports = EntitleService;

// ─── Mocks ────────────────────────────────────────────────────────────────────
function mockEntitlements(_months) {
  const today = new Date();
  const isoIn = (days) => { const d = new Date(today); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const hist = (values) => values.map((u, i) => ({
    yearMonth: ymOffset(-(values.length - 1 - i)),
    usage: u,
  }));
  return [
    { serviceName: 'SAP HANA Cloud',       planName: 'hana',                 unit: 'GB',           entitled: 50,   unlimited: false, avgUsage: 32.4, peakUsage: 38, utilizationPct: 64.8, history: hist([28,30,29,31,32,30,33,34,33,32,36,38]), renewalDate: isoIn(45),  unitPrice: 720,   currency: 'EUR', recommendation: 'KEEP',       suggestedQuota: 50, annualSaving: null,    category: 'ELASTIC_SERVICE'  },
    { serviceName: 'SAP Build Work Zone',  planName: 'standard',             unit: 'Users',        entitled: 300,  unlimited: false, avgUsage: 75.2, peakUsage: 92, utilizationPct: 25.1, history: hist([60,68,71,73,76,75,78,80,82,73,77,92]), renewalDate: isoIn(120), unitPrice: 18,    currency: 'EUR', recommendation: 'DOWNGRADE',  suggestedQuota: 140, annualSaving: 2880,   category: 'ELASTIC_SERVICE'  },
    { serviceName: 'SAP Integration Suite',planName: 'enterprise_agreement', unit: 'K Calls',      entitled: 200,  unlimited: false, avgUsage: 168,  peakUsage: 191, utilizationPct: 84.0, history: hist([150,155,159,165,170,168,172,176,178,180,183,191]), renewalDate: isoIn(28),  unitPrice: 95,    currency: 'EUR', recommendation: 'INVESTIGATE',suggestedQuota: 200, annualSaving: null,    category: 'QUOTA_BASED_SERVICE' },
    { serviceName: 'SAP Analytics Cloud',  planName: 'standard',             unit: 'Users',        entitled: 100,  unlimited: false, avgUsage: 18.8, peakUsage: 22, utilizationPct: 18.8, history: hist([15,16,17,18,18,19,19,20,19,18,21,22]), renewalDate: isoIn(220), unitPrice: 360,   currency: 'EUR', recommendation: 'DOWNGRADE',  suggestedQuota: 35,  annualSaving: 23400, category: 'ELASTIC_SERVICE'  },
    { serviceName: 'Cloud Foundry Runtime',planName: 'standard',             unit: 'GB',           entitled: 100,  unlimited: false, avgUsage: 66,   peakUsage: 78, utilizationPct: 66.0, history: hist([60,62,64,65,67,66,68,69,70,72,74,78]), renewalDate: isoIn(45),  unitPrice: 240,   currency: 'EUR', recommendation: 'KEEP',       suggestedQuota: 100, annualSaving: null,   category: 'ELASTIC_SERVICE'  },
    { serviceName: 'SAP BTP, Kyma Runtime',planName: 'azure',                unit: 'Node-Hours',   entitled: 1000, unlimited: false, avgUsage: 698,  peakUsage: 810, utilizationPct: 69.8, history: hist([600,640,680,710,710,720,720,700,690,720,750,810]), renewalDate: isoIn(280), unitPrice: 0.45,  currency: 'EUR', recommendation: 'KEEP',       suggestedQuota: 1000, annualSaving: null,   category: 'ELASTIC_SERVICE'  },
    { serviceName: 'SAP Event Mesh',       planName: 'default',              unit: 'GB',           entitled: 50,   unlimited: false, avgUsage: 18,   peakUsage: 25, utilizationPct: 36.0, history: hist([12,14,15,17,18,19,20,21,22,23,24,25]), renewalDate: isoIn(280), unitPrice: 180,   currency: 'EUR', recommendation: 'KEEP',       suggestedQuota: 50,  annualSaving: null,   category: 'ELASTIC_SERVICE'  },
    { serviceName: 'Document Management',  planName: 'standard',             unit: 'GB',           entitled: 200,  unlimited: false, avgUsage: 88,   peakUsage: 105, utilizationPct: 44.0, history: hist([70,75,80,82,85,88,90,92,95,98,102,105]), renewalDate: isoIn(45),  unitPrice: 60,    currency: 'EUR', recommendation: 'KEEP',       suggestedQuota: 200, annualSaving: null,   category: 'ELASTIC_SERVICE'  },
    { serviceName: 'SAP Datasphere',       planName: 'standard',             unit: 'Capacity Units', entitled: 10, unlimited: false, avgUsage: 3.4,  peakUsage: 5,  utilizationPct: 34.0, history: hist([2,2,3,3,3,3,4,4,4,4,5,5]), renewalDate: isoIn(13),  unitPrice: 12000, currency: 'EUR', recommendation: 'DOWNGRADE',  suggestedQuota: 5,   annualSaving: 60000, category: 'QUOTA_BASED_SERVICE' },
    { serviceName: 'XSUAA',                planName: 'application',          unit: 'Application',  entitled: null, unlimited: true,  avgUsage: 0,    peakUsage: 0,  utilizationPct: 0,    history: [],                                  renewalDate: null,        unitPrice: null,  currency: 'EUR', recommendation: 'KEEP',       suggestedQuota: 0,   annualSaving: null,   category: 'ELASTIC_SERVICE'  },
  ];
}

function ymOffset(deltaMonths) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + deltaMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

module.exports.__test__ = { mockEntitlements, ymOffset };
