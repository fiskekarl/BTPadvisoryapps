sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.subaccountlifecycle.controller.Main', {

    onInit: function () {
      this._loadAll();
    },

    _model: function () { return this.getOwnerComponent().getModel('lifecycle'); },

    _setBusy: function (b) { this._model().setProperty('/busy', b); },

    _loadAll: async function () {
      this._setBusy(true);
      try {
        const tier = this._model().getProperty('/tierFilter');
        const driftPath = `/getDrift(tier=${tier ? `'${tier}'` : 'null'})`;

        const [summary, subaccounts, drift, audit] = await Promise.all([
          this._invoke('/getSummary()'),
          this._invoke('/getSubaccounts()'),
          this._invoke(driftPath),
          this._invoke('/getAuditActivity(subaccountId=null,days=30)')
        ]);

        const m = this._model();
        m.setProperty('/summary', summary || {});
        m.setProperty('/subaccounts', tier ? subaccounts.filter((r) => r.tier === tier) : subaccounts);
        m.setProperty('/drift', drift || []);
        m.setProperty('/audit', audit || []);
      } catch (e) {
        MessageToast.show('Failed to load data: ' + (e.message || e));
      } finally {
        this._setBusy(false);
      }
    },

    /**
     * Invoke an OData v4 unbound function via fetch — kept simple to avoid
     * pulling in the full v4 model just for function imports. The HTML5 app
     * has the approuter destination wired so /odata/v4/lifecycle resolves
     * through xs-app.json to the CAP service.
     */
    _invoke: async function (path) {
      const resp = await fetch('/odata/v4/lifecycle' + path, {
        headers: { Accept: 'application/json' },
        credentials: 'include'
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} on ${path}`);
      const data = await resp.json();
      return data.value !== undefined ? data.value : data;
    },

    onTierChange: function () { this._loadAll(); },
    onRefresh:    function () { this._loadAll(); },

    formatSyncTime: function (iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); }
      catch (e) { return iso; }
    },

    onExport: function () {
      const rows = this._model().getProperty('/subaccounts') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');

      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Subaccount',    property: 'displayName',    type: 'string'  },
          { label: 'Subaccount ID', property: 'subaccountId',   type: 'string'  },
          { label: 'Tier',          property: 'tier',           type: 'string'  },
          { label: 'State',         property: 'state',          type: 'string'  },
          { label: 'Environment',   property: 'environment',    type: 'string'  },
          { label: 'Region',        property: 'region',         type: 'string'  },
          { label: 'Cost Center',   property: 'costCenter',     type: 'string'  },
          { label: 'Department',    property: 'department',     type: 'string'  },
          { label: 'Created',       property: 'createdAt',      type: 'string'  },
          { label: 'Last Activity', property: 'lastActivityAt', type: 'string'  },
          { label: 'Days Inactive', property: 'daysInactive',   type: 'number'  },
          { label: 'Production',    property: 'usedForProd',    type: 'string'  }
        ]},
        dataSource: rows,
        fileName:   `subaccount-inventory-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });
});
