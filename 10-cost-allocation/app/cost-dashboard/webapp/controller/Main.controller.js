sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.costallocation.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('cost'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const ym = m.getProperty('/yearMonth') || '';
        const arg = ym ? `'${ym}'` : 'null';
        const [summary, tree, invoices] = await Promise.all([
          this._invoke(`/getSummary(yearMonth=${arg})`),
          this._invoke(`/getCostTree(yearMonth=${arg})`),
          this._invoke(`/getInvoices(yearMonth=${arg})`)
        ]);
        m.setProperty('/summary',  summary || {});
        m.setProperty('/tree',     tree || []);
        m.setProperty('/invoices', invoices || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _invoke: async function (path) {
      const r = await fetch('/odata/v4/cost' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d.value : d;
    },

    onRefresh: function () { this._loadAll(); },

    onExport: function () {
      const rows = this._model().getProperty('/invoices') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Cost Center', property: 'costCenter', type: 'string' },
          { label: 'BU',          property: 'buName',     type: 'string' },
          { label: 'Department',  property: 'department', type: 'string' },
          { label: 'Year-Month',  property: 'yearMonth',  type: 'string' },
          { label: 'Direct',      property: 'directCost', type: 'number' },
          { label: 'Shared',      property: 'sharedCost', type: 'number' },
          { label: 'Total',       property: 'totalCost',  type: 'number' }
        ]},
        dataSource: rows,
        fileName: `chargeback-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
