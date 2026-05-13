sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.auditlog.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('audit'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const days = m.getProperty('/days') || 30;
        const [summary, events, anomalies, timeline] = await Promise.all([
          this._invoke('/getSummary()'),
          this._invoke(`/getEvents(days=${days},subaccountId=null,actor=null)`),
          this._invoke(`/getAnomalies(days=${days})`),
          this._invoke(`/getChangeTimeline(days=${days})`)
        ]);
        m.setProperty('/summary',   summary || {});
        m.setProperty('/events',    events || []);
        m.setProperty('/anomalies', anomalies || []);
        m.setProperty('/timeline',  timeline || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _invoke: async function (path) {
      const r = await fetch('/odata/v4/audit' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d.value : d;
    },

    onWindowChange: function () { this._loadAll(); },
    onRefresh:      function () { this._loadAll(); },

    onExport: function () {
      const rows = this._model().getProperty('/events') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Time',         property: 'timestamp',      type: 'string' },
          { label: 'Subaccount',   property: 'subaccountName', type: 'string' },
          { label: 'Actor',        property: 'actor',          type: 'string' },
          { label: 'Action',       property: 'action',         type: 'string' },
          { label: 'Resource',     property: 'resourceId',     type: 'string' },
          { label: 'Outcome',      property: 'outcome',        type: 'string' },
          { label: 'Anomaly',      property: 'anomalyId',      type: 'string' }
        ]},
        dataSource: rows,
        fileName:   `audit-events-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
