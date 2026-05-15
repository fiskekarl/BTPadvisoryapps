sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.certexpiry.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('cert'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const [summary, certs] = await Promise.all([
          this._invoke('/getSummary()'),
          this._invoke('/getCerts()')
        ]);
        const kind = m.getProperty('/kindFilter');
        m.setProperty('/summary', summary || {});
        m.setProperty('/certs', kind ? certs.filter((c) => c.kind === kind) : certs);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _invoke: async function (path) {
      const r = await fetch('/odata/v4/cert' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d.value : d;
    },

    onFilterChange: function () { this._loadAll(); },
    onRefresh:      function () { this._loadAll(); },

    formatSyncTime: function (iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); }
      catch (e) { return iso; }
    },

    onExport: function () {
      const rows = this._model().getProperty('/certs') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Severity',     property: 'severity',       type: 'string' },
          { label: 'Kind',         property: 'kind',           type: 'string' },
          { label: 'Subaccount',   property: 'subaccountName', type: 'string' },
          { label: 'Name',         property: 'name',           type: 'string' },
          { label: 'Subject',      property: 'subject',        type: 'string' },
          { label: 'Issuer',       property: 'issuer',         type: 'string' },
          { label: 'Not After',    property: 'notAfter',       type: 'string' },
          { label: 'Days',         property: 'daysToExpiry',   type: 'number' },
          { label: 'Blast Radius', property: 'blastRadius',    type: 'string' },
          { label: 'Owner',        property: 'rotationOwner',  type: 'string' },
          { label: 'Acknowledged', property: 'acknowledged',   type: 'boolean' }
        ]},
        dataSource: rows,
        fileName:   `cert-inventory-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
