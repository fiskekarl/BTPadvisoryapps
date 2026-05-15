sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.identityfederation.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('ident'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const [summary, trusts, apps, dormant, findings] = await Promise.all([
          this._invoke('/getSummary()'),
          this._invoke('/getTrusts()'),
          this._invoke('/getAppPolicies()'),
          this._invoke('/getDormantUsers()'),
          this._invoke('/getFindings()')
        ]);
        m.setProperty('/summary',  summary || {});
        m.setProperty('/trusts',   trusts || []);
        m.setProperty('/apps',     apps || []);
        m.setProperty('/dormant',  dormant || []);
        m.setProperty('/findings', findings || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _invoke: async function (path) {
      const r = await fetch('/odata/v4/ident' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d.value : d;
    },

    onRefresh: function () { this._loadAll(); },

    formatSyncTime: function (iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); }
      catch (e) { return iso; }
    },

    onExport: function () {
      const findings = this._model().getProperty('/findings') || [];
      if (!findings.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Severity', property: 'severity', type: 'string' },
          { label: 'Code',     property: 'code',     type: 'string' },
          { label: 'Target',   property: 'target',   type: 'string' },
          { label: 'Summary',  property: 'summary',  type: 'string' },
          { label: 'Ignored',  property: 'ignored',  type: 'boolean' }
        ]},
        dataSource: findings,
        fileName:   `identity-findings-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
