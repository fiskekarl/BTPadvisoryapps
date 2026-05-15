sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/m/Dialog',
  'sap/m/Button',
  'sap/m/Table',
  'sap/m/Column',
  'sap/m/ColumnListItem',
  'sap/m/Text',
  'sap/m/ObjectNumber',
  'sap/m/ObjectStatus',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Dialog, Button, Table, Column, ColumnListItem, Text, ObjectNumber, ObjectStatus, Spreadsheet) {
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

    formatSyncTime: function (iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); }
      catch (e) { return iso; }
    },

    onInvoicePress: function (oEvent) {
      const inv = oEvent.getSource().getBindingContext('cost').getObject();
      const lines = (inv.lineItems || []).slice()
        .sort((a, b) => Number(b.cost) - Number(a.cost));

      const dialog = new Dialog({
        title:         `${inv.costCenter} — ${lines.length} services (${inv.yearMonth})`,
        contentWidth:  '60rem',
        contentHeight: '32rem',
        resizable:     true,
        content: new Table({
          columns: [
            new Column({ header: new Text({ text: 'Service' }) }),
            new Column({ header: new Text({ text: 'Plan' }) }),
            new Column({ header: new Text({ text: 'Subaccount' }) }),
            new Column({ header: new Text({ text: 'Cost' }), hAlign: 'End' }),
            new Column({ header: new Text({ text: 'Type' }), width: '5rem' }),
          ],
          items: lines.map((l) =>
            new ColumnListItem({ cells: [
              new Text({ text: l.serviceName }),
              new Text({ text: l.planName || '' }),
              new Text({ text: l.subaccountName || l.subaccountId }),
              new ObjectNumber({ number: l.cost, unit: l.currency, emphasized: true }),
              new ObjectStatus({
                text:  l.shared ? 'shared' : 'direct',
                state: l.shared ? 'Warning' : 'Information',
              }),
            ]})
          ),
        }),
        endButton: new Button({ text: 'Close', press: () => dialog.close() }),
        afterClose: () => dialog.destroy(),
      });
      dialog.open();
    },

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
