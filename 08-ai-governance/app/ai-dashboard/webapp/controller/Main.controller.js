sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.aigovernance.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('ai'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const [summary, deployments, configs, alerts] = await Promise.all([
          this._invoke('/getSummary()'),
          this._invoke('/getDeployments()'),
          this._invoke('/getOrchestrationConfigs()'),
          this._invoke('/getAlerts(days=7)')
        ]);
        m.setProperty('/summary',     summary || {});
        m.setProperty('/deployments', deployments || []);
        m.setProperty('/configs',     configs || []);
        m.setProperty('/alerts',      alerts || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _invoke: async function (path) {
      const r = await fetch('/odata/v4/ai' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
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
      const rows = this._model().getProperty('/configs') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Template',    property: 'templateName',    type: 'string' },
          { label: 'Scenario',    property: 'scenarioId',      type: 'string' },
          { label: 'Model',       property: 'modelName',       type: 'string' },
          { label: 'Input Filter',  property: 'hasInputFilter',  type: 'boolean' },
          { label: 'Output Filter', property: 'hasOutputFilter', type: 'boolean' },
          { label: 'Masking',     property: 'hasMasking',      type: 'boolean' },
          { label: 'Grounding',   property: 'grounding',       type: 'string' },
          { label: 'Compliant',   property: 'compliant',       type: 'boolean' }
        ]},
        dataSource: rows,
        fileName: `ai-configs-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
