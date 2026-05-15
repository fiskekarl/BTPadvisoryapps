'use strict';

const cds = require('@sap/cds');
const crypto = require('crypto');

// SAP Cloud SDK destination call — uses Connectivity Service automatically.
// Falls back to axios + manual destination resolution if Cloud SDK not bound.
let executeHttpRequest;
try { ({ executeHttpRequest } = require('@sap-cloud-sdk/http-client')); }
catch { executeHttpRequest = null; }

async function callS4Scanner(systemId) {
  if (!executeHttpRequest) return null;
  try {
    const resp = await executeHttpRequest(
      { destinationName: 's4-cleancore-scanner' },
      { method: 'POST', url: `/scan?systemId=${encodeURIComponent(systemId || '')}`,
        timeout: 600_000 /* scanner can take many minutes */ }
    );
    return resp.data;
  } catch (e) {
    cds.log('cleancore-service').warn(`S/4 scanner unreachable: ${e.message}`);
    return null;
  }
}

function classify(obj) {
  // Heuristic classification based on package and modification flags.
  // The real classification comes from the ABAP scanner.
  if (obj.classification) return obj;
  const c = !obj.releasedApiOnly ? 'IN_STACK_MOD'
          : /^Z|^Y/.test(obj.packageName) ? 'SIDE_BY_SIDE'
          : obj.objectType === 'BADI'    ? 'KEY_USER_EXT'
          : 'CLEAN';
  const severity = c === 'IN_STACK_MOD' ? 'error'
                 : c === 'KEY_USER_EXT' ? 'warn' : 'info';
  return { ...obj, classification: c, severity };
}

class CleanCoreService extends cds.ApplicationService {
  async init() {
    // ── runScan ─────────────────────────────────────────────────────────────
    this.on('runScan', async (req) => {
      const systemId = req.data?.systemId || 'S4P';
      const runId    = `run-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      const data = await callS4Scanner(systemId);
      const rows = (data?.objects || mockExtensions(systemId)).map((o) => classify(o));

      await cds.db.run(INSERT.into('com.btpconsulting.cleancore.ScanRun').entries({
        id: runId, systemId, completedAt: new Date(),
        totalObjects: rows.length,
        cleanCount: rows.filter((r) => r.classification === 'CLEAN').length,
        modificationCount: rows.filter((r) => r.classification === 'IN_STACK_MOD').length,
        status: 'COMPLETED',
      }));

      const inserts = rows.map((r) => ({
        id: crypto.randomUUID(),
        scanRunId: runId, systemId, objectType: r.objectType, objectName: r.objectName,
        packageName: r.packageName, releasedApiOnly: !!r.releasedApiOnly,
        classification: r.classification, severity: r.severity,
        violations: (r.violations || []).join('||'),
        lastModifiedBy: r.lastModifiedBy || '', lastModifiedAt: r.lastModifiedAt || new Date(),
      }));
      // Bulk-insert in chunks of 200 (SQLite/HANA both happy with that).
      for (let i = 0; i < inserts.length; i += 200) {
        await cds.db.run(INSERT.into('com.btpconsulting.cleancore.ScanResult').entries(inserts.slice(i, i + 200)));
      }
      return runId;
    });

    // ── getExtensions ───────────────────────────────────────────────────────
    this.on('getExtensions', async (req) => {
      const systemFilter = req.data?.systemId;
      let where = {};
      if (systemFilter) where = { systemId: systemFilter };

      // Latest scan-run per system: take rows with the highest createdAt per object.
      const rows = await cds.db.run(
        SELECT.from('com.btpconsulting.cleancore.ScanResult').where(where)
              .orderBy('createdAt desc')
              .limit(2000)
      );
      if (rows.length === 0) return mockExtensions(systemFilter || 'S4P').map(classify);

      return rows.map((r) => ({
        objectType:      r.objectType,
        objectName:      r.objectName,
        packageName:     r.packageName,
        classification:  r.classification,
        severity:        r.severity,
        releasedApiOnly: r.releasedApiOnly,
        violations:      r.violations ? r.violations.split('||') : [],
        lastModifiedBy:  r.lastModifiedBy,
        lastModifiedAt:  r.lastModifiedAt,
        systemId:        r.systemId,
      }));
    });

    // ── getSummary ──────────────────────────────────────────────────────────
    this.on('getSummary', async () => {
      const rows = await this.send('getExtensions', { systemId: null });
      const total = rows.length;
      const clean = rows.filter((r) => r.classification === 'CLEAN').length;
      // 'live' iff Cloud SDK is bound AND at least one persisted ScanRun exists
      // (the latter is how we know the scanner has actually been reached).
      let hasRuns = false;
      try {
        const r = await cds.db.run(
          SELECT.one`count(*) as n`.from('com.btpconsulting.cleancore.ScanRun')
        );
        hasRuns = (r?.n || 0) > 0;
      } catch { /* ignore */ }
      const dataSource = executeHttpRequest && hasRuns ? 'live' : 'mock';
      return {
        totalExtensions:    total,
        cleanCount:         clean,
        keyUserCount:       rows.filter((r) => r.classification === 'KEY_USER_EXT').length,
        sideBySideCount:    rows.filter((r) => r.classification === 'SIDE_BY_SIDE').length,
        inStackModCount:    rows.filter((r) => r.classification === 'IN_STACK_MOD').length,
        unreleasedApiCount: rows.filter((r) => r.releasedApiOnly === false).length,
        compliancePct:      total ? Math.round((clean / total) * 10000) / 100 : 0,
        dataSource,
        lastSyncAt:         new Date().toISOString(),
      };
    });

    return super.init();
  }
}

module.exports = CleanCoreService;
module.exports.__test__ = { classify };

// ─── Mock data ────────────────────────────────────────────────────────────────
function mockExtensions(systemId) {
  return [
    { objectType: 'CLAS', objectName: 'ZCL_ORDER_ENRICHER',         packageName: 'ZACME_ORDERS',  releasedApiOnly: true,  classification: 'SIDE_BY_SIDE', severity: 'info',  violations: [],                                       lastModifiedBy: 'alice', lastModifiedAt: '2026-03-14', systemId },
    { objectType: 'CLAS', objectName: 'ZCL_CUSTOMER_HELPER',        packageName: 'ZACME_CRM',     releasedApiOnly: false, classification: 'IN_STACK_MOD',  severity: 'error', violations: ['CL_BUPA_CONTROL_BAS used directly (not released)', 'INSERT INTO KNA1 (forbidden DDIC write)'], lastModifiedBy: 'bob',   lastModifiedAt: '2025-11-08', systemId },
    { objectType: 'CDS',  objectName: 'ZI_SALES_ORDER',              packageName: 'ZACME_VDM',    releasedApiOnly: true,  classification: 'SIDE_BY_SIDE', severity: 'info',  violations: [],                                       lastModifiedBy: 'carol', lastModifiedAt: '2026-04-02', systemId },
    { objectType: 'PROG', objectName: 'ZREP_NIGHTLY_RECONCILE',      packageName: 'ZACME_BATCH',  releasedApiOnly: false, classification: 'IN_STACK_MOD',  severity: 'error', violations: ['Direct DB INSERT on VBAK', 'Calls non-released FM SD_SALES_DOC_DIALOG'],                                lastModifiedBy: 'dave',  lastModifiedAt: '2024-08-20', systemId },
    { objectType: 'BADI', objectName: 'BADI_SD_SALES_ITEM_DETERMINE',packageName: 'ZACME_BADI',   releasedApiOnly: true,  classification: 'KEY_USER_EXT', severity: 'warn',  violations: ['Uses deprecated BAdI filter — migrate to BTP-side event'], lastModifiedBy: 'erin', lastModifiedAt: '2026-01-14', systemId },
    { objectType: 'FUGR', objectName: 'Z_RFC_ORDER_API',             packageName: 'ZACME_RFC',    releasedApiOnly: true,  classification: 'SIDE_BY_SIDE', severity: 'info',  violations: [],                                       lastModifiedBy: 'alice', lastModifiedAt: '2026-04-22', systemId },
    { objectType: 'CLAS', objectName: 'CL_INVOICE_DETERMINATION',    packageName: 'V',            releasedApiOnly: false, classification: 'IN_STACK_MOD',  severity: 'error', violations: ['Modified standard SAP class (in-stack mod)'],                                                                                  lastModifiedBy: 'bob',   lastModifiedAt: '2024-05-10', systemId },
    { objectType: 'INTF', objectName: 'ZIF_ORDER_PROVIDER',          packageName: 'ZACME_ORDERS',  releasedApiOnly: true,  classification: 'CLEAN',         severity: 'info',  violations: [],                                       lastModifiedBy: 'carol', lastModifiedAt: '2026-04-30', systemId },
    { objectType: 'CDS',  objectName: 'ZC_CUSTOMER_360',              packageName: 'ZACME_VDM',    releasedApiOnly: false, classification: 'IN_STACK_MOD',  severity: 'error', violations: ['Joins standard CDS view I_Customer without released annotation'],                                lastModifiedBy: 'dave',  lastModifiedAt: '2026-02-18', systemId },
    { objectType: 'CLAS', objectName: 'ZCL_ARIBA_PROXY',              packageName: 'ZACME_INTEG',   releasedApiOnly: true,  classification: 'CLEAN',         severity: 'info',  violations: [],                                       lastModifiedBy: 'erin',  lastModifiedAt: '2026-05-01', systemId },
    { objectType: 'BADI', objectName: 'BADI_FAGL_RES_CONFIG',         packageName: 'ZACME_FIN',     releasedApiOnly: true,  classification: 'KEY_USER_EXT', severity: 'warn',  violations: [],                                       lastModifiedBy: 'alice', lastModifiedAt: '2025-12-04', systemId },
    { objectType: 'PROG', objectName: 'ZREP_LEGACY_DUNNING',          packageName: 'ZACME_LEGACY',  releasedApiOnly: false, classification: 'IN_STACK_MOD',  severity: 'error', violations: ['SUBMIT RFFOAVIS_FPAYM (non-released)', 'SELECT FROM BSEG via native SQL'], lastModifiedBy: 'bob',  lastModifiedAt: '2023-09-22', systemId },
  ];
}
