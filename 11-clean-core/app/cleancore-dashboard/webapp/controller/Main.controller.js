sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/m/MessageBox',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, MessageBox, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.cleancore.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('cleancore'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const sys = m.getProperty('/systemId') || 'S4P';
        const [summary, exts] = await Promise.all([
          this._invoke('/getSummary()'),
          this._invoke(`/getExtensions(systemId='${sys}')`)
        ]);
        m.setProperty('/summary',    summary || {});
        m.setProperty('/extensions', exts || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _invoke: async function (path) {
      const r = await fetch('/odata/v4/cleancore' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d.value : d;
    },

    onSystemChange: function () { this._loadAll(); },
    onRefresh:      function () { this._loadAll(); },

    onScan: async function () {
      const sys = this._model().getProperty('/systemId') || 'S4P';
      MessageBox.confirm(`Run ATC clean-core scan against ${sys}? Can take 10-30 minutes.`, {
        onClose: async (action) => {
          if (action !== MessageBox.Action.OK) return;
          try {
            const r = await fetch('/odata/v4/cleancore/runScan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ systemId: sys }),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            MessageToast.show('Scan started — refresh in 10-30 min');
          } catch (e) {
            MessageToast.show('Scan failed: ' + (e.message || e));
          }
        },
      });
    },

    onExport: function () {
      const rows = this._model().getProperty('/extensions') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Severity',       property: 'severity',        type: 'string' },
          { label: 'Classification', property: 'classification',  type: 'string' },
          { label: 'Type',           property: 'objectType',      type: 'string' },
          { label: 'Object',         property: 'objectName',      type: 'string' },
          { label: 'Package',        property: 'packageName',     type: 'string' },
          { label: 'Released APIs',  property: 'releasedApiOnly', type: 'boolean' },
          { label: 'Modified By',    property: 'lastModifiedBy',  type: 'string' },
          { label: 'Modified At',    property: 'lastModifiedAt',  type: 'string' }
        ]},
        dataSource: rows,
        fileName: `cleancore-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
