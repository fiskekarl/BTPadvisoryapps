sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/m/Dialog',
  'sap/m/Button',
  'sap/m/Table',
  'sap/m/Column',
  'sap/m/ColumnListItem',
  'sap/m/Text',
  'sap/m/ObjectStatus',
  'sap/ui/model/Filter',
  'sap/ui/model/FilterOperator',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Dialog, Button, Table, Column, ColumnListItem, Text, ObjectStatus, Filter, FilterOperator, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.rolecollectionmap.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('role'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const [summary, users, rcs, findings] = await Promise.all([
          this._invoke('/getSummary()'),
          this._invoke('/getUserMap()'),
          this._invoke('/getRoleCollections()'),
          this._invoke('/getToxicFindings()')
        ]);
        m.setProperty('/summary',  summary || {});
        m.setProperty('/users',    users || []);
        m.setProperty('/rcs',      rcs || []);
        m.setProperty('/findings', findings || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _invoke: async function (path) {
      const r = await fetch('/odata/v4/role' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d.value : d;
    },

    onSearch: function (oEvent) {
      const q = (oEvent.getParameter('newValue') || '').toLowerCase();
      this._applyFilter('usersTable',    q, ['email', 'displayName']);
      this._applyFilter('rcsTable',      q, ['rcName', 'subaccountName', 'tier']);
      this._applyFilter('findingsTable', q, ['email', 'summary', 'policyId']);
    },

    _applyFilter: function (tableId, q, fields) {
      const tbl = this.byId(tableId);
      if (!tbl) return;
      const binding = tbl.getBinding('items');
      if (!binding) return;
      if (!q) { binding.filter([]); return; }
      const filters = fields.map((f) => new Filter(f, FilterOperator.Contains, q));
      binding.filter(new Filter({ filters, and: false }));
    },

    onRefresh: function () { this._loadAll(); },

    onUserPress: function (oEvent) {
      const ctx = oEvent.getSource().getBindingContext('role');
      const u = ctx.getObject();
      const dialog = new Dialog({
        title: `${u.displayName} — ${u.email}`,
        contentWidth: '40rem',
        contentHeight: '24rem',
        resizable: true,
        content: new Table({
          columns: [
            new Column({ header: new Text({ text: 'Subaccount' }) }),
            new Column({ header: new Text({ text: 'Tier' }) }),
            new Column({ header: new Text({ text: 'Role Collection' }) }),
          ],
          items: u.assignments.map((a) =>
            new ColumnListItem({ cells: [
              new Text({ text: a.subaccountName }),
              new Text({ text: a.tier }),
              new Text({ text: a.rcName }),
            ]})
          ),
        }),
        endButton: new Button({ text: 'Close', press: () => dialog.close() }),
        afterClose: () => dialog.destroy(),
      });
      dialog.open();
    },

    onExport: function () {
      const findings = this._model().getProperty('/findings') || [];
      if (!findings.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Severity',     property: 'severity',      type: 'string' },
          { label: 'Policy',       property: 'policyId',      type: 'string' },
          { label: 'Email',        property: 'email',         type: 'string' },
          { label: 'Display Name', property: 'displayName',   type: 'string' },
          { label: 'RC A',         property: 'rcA',           type: 'string' },
          { label: 'Tier A',       property: 'tierA',         type: 'string' },
          { label: 'Subaccount A', property: 'subaccountAId', type: 'string' },
          { label: 'RC B',         property: 'rcB',           type: 'string' },
          { label: 'Tier B',       property: 'tierB',         type: 'string' },
          { label: 'Subaccount B', property: 'subaccountBId', type: 'string' },
          { label: 'Summary',      property: 'summary',       type: 'string' },
          { label: 'Ignored',      property: 'ignored',       type: 'boolean' }
        ]},
        dataSource: findings,
        fileName:   `toxic-combo-findings-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
