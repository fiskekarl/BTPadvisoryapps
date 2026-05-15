sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.entitlement.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('entitle'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const months = m.getProperty('/months') || 12;
        const [summary, entitlements, renewals] = await Promise.all([
          this._invoke(`/getSummary(months=${months})`),
          this._invoke(`/getEntitlements(months=${months})`),
          this._invoke('/getRenewalAlerts(daysAhead=90)')
        ]);
        m.setProperty('/summary',      summary || {});
        m.setProperty('/entitlements', this._withSparklinePoints(entitlements || []));
        m.setProperty('/renewals',     renewals || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    // LineMicroChart wants numeric x. yearMonth is a string like "2025-04",
    // so we attach an x = index alongside, keeping the usage value as-is.
    _withSparklinePoints: function (entitlements) {
      return entitlements.map((e) => {
        const history = Array.isArray(e.history) ? e.history : [];
        const points = history.map((p, i) => ({ x: i, y: Number(p.usage) || 0, yearMonth: p.yearMonth }));
        return { ...e, sparkline: points };
      });
    },

    _invoke: async function (path) {
      const r = await fetch('/odata/v4/entitle' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d.value : d;
    },

    onWindowChange: function () { this._loadAll(); },
    onRefresh:      function () { this._loadAll(); },

    formatSyncTime: function (iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); }
      catch (e) { return iso; }
    },

    onExport: function () {
      const rows = this._model().getProperty('/entitlements') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Service',        property: 'serviceName',     type: 'string' },
          { label: 'Plan',           property: 'planName',        type: 'string' },
          { label: 'Unit',           property: 'unit',            type: 'string' },
          { label: 'Entitled',       property: 'entitled',        type: 'number' },
          { label: 'Avg Usage',      property: 'avgUsage',        type: 'number' },
          { label: 'Peak Usage',     property: 'peakUsage',       type: 'number' },
          { label: 'Utilization %',  property: 'utilizationPct',  type: 'number' },
          { label: 'Recommendation', property: 'recommendation',  type: 'string' },
          { label: 'Suggested',      property: 'suggestedQuota',  type: 'number' },
          { label: 'Annual Saving',  property: 'annualSaving',    type: 'number' },
          { label: 'Renewal',        property: 'renewalDate',     type: 'string' }
        ]},
        dataSource: rows,
        fileName: `entitlements-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
