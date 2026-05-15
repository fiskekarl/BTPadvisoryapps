sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/m/MessageBox',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, MessageBox, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.compliancescorecard.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('score'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const [scorecard, rules] = await Promise.all([
          this._fetch('/odata/v4/score/getScorecard()'),
          this._fetch('/odata/v4/score/Rules?$top=200')
        ]);
        m.setProperty('/scorecard', scorecard || {});
        m.setProperty('/rules',     rules?.value || rules || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _fetch: async function (path) {
      const r = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d : d;
    },

    onRefresh: function () { this._loadAll(); },

    formatSyncTime: function (iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); }
      catch (e) { return iso; }
    },

    onRunScan: async function () {
      const label = await new Promise((resolve) =>
        MessageBox.prompt('Snapshot label?', { initialValue: `Scan ${new Date().toISOString()}` },
                          (r, val) => resolve(r === MessageBox.Action.OK ? val : null)));
      if (!label) return;

      try {
        const r = await fetch('/odata/v4/score/runScan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ label })
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        MessageToast.show('Snapshot saved');
        this._loadAll();
      } catch (e) {
        MessageToast.show('Scan failed: ' + (e.message || e));
      }
    },

    onExport: function () {
      const rows = this._model().getProperty('/scorecard/findings') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Status',     property: 'passed',         type: 'boolean' },
          { label: 'Severity',   property: 'severity',       type: 'string'  },
          { label: 'Subaccount', property: 'subaccountName', type: 'string'  },
          { label: 'Rule',       property: 'ruleTitle',      type: 'string'  },
          { label: 'Category',   property: 'category',       type: 'string'  },
          { label: 'Summary',    property: 'summary',        type: 'string'  }
        ]},
        dataSource: rows,
        fileName:   `compliance-findings-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
