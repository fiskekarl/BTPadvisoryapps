sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/m/MessageToast',
  'sap/m/MessageBox',
  'sap/m/Dialog',
  'sap/m/Button',
  'sap/m/Label',
  'sap/m/Input',
  'sap/m/CheckBox',
  'sap/m/VBox',
  'sap/m/HBox',
  'sap/ui/export/Spreadsheet'
], function (Controller, MessageToast, MessageBox, Dialog, Button, Label, Input, CheckBox, VBox, HBox, Spreadsheet) {
  'use strict';

  return Controller.extend('com.btpconsulting.destinationinventory.controller.Main', {
    onInit: function () { this._loadAll(); },
    _model: function () { return this.getOwnerComponent().getModel('destinv'); },

    _loadAll: async function () {
      const m = this._model(); m.setProperty('/busy', true);
      try {
        const [summary, destinations, findings, policy, ignoreRules] = await Promise.all([
          this._invokeFn('/getSummary()'),
          this._invokeFn('/getDestinations()'),
          this._invokeFn('/getFindings()'),
          this._fetchEntity('/ScanPolicies?$top=1'),
          this._fetchEntity('/IgnoreRules?$orderby=createdAt desc&$top=200')
        ]);
        m.setProperty('/summary',      summary || {});
        m.setProperty('/destinations', destinations || []);
        m.setProperty('/findings',     findings || []);
        m.setProperty('/policy',       (policy && policy[0]) || _defaultPolicy());
        m.setProperty('/ignoreRules',  ignoreRules || []);
      } catch (e) {
        MessageToast.show('Load failed: ' + (e.message || e));
      } finally {
        m.setProperty('/busy', false);
      }
    },

    _invokeFn: async function (path) {
      const r = await fetch('/odata/v4/destinv' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value !== undefined ? d.value : d;
    },

    _fetchEntity: async function (path) {
      const r = await fetch('/odata/v4/destinv' + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); return d.value;
    },

    onRefresh: function () { this._loadAll(); },

    formatSyncTime: function (iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); }
      catch (e) { return iso; }
    },

    // ── Scan policy editor ───────────────────────────────────────────────────
    onEditPolicy: function () {
      const m = this._model();
      const p = JSON.parse(JSON.stringify(m.getProperty('/policy') || _defaultPolicy()));
      const i18n = this.getView().getModel('i18n').getResourceBundle();

      const flagBasic   = new CheckBox({ selected: !!p.flagBasicAuth });
      const mtls        = new CheckBox({ selected: !!p.requireMtlsForProd });
      const warn        = new Input({ value: String(p.maxCertExpiryWarnDays ?? 60),     type: 'Number' });
      const critical    = new Input({ value: String(p.maxCertExpiryCriticalDays ?? 14), type: 'Number' });
      const dangling    = new CheckBox({ selected: !!p.flagDanglingTargets });

      const row = (label, ctrl) => new HBox({ alignItems: 'Center',
        items: [new Label({ text: label, width: '18rem' }), ctrl] });

      const dialog = new Dialog({
        title: i18n.getText('policyDialogTitle'),
        contentWidth: '34rem',
        content: new VBox({ items: [
          row(i18n.getText('policyFlagBasic'), flagBasic),
          row(i18n.getText('policyMtls'),      mtls),
          row(i18n.getText('policyWarn'),      warn),
          row(i18n.getText('policyCritical'),  critical),
          row(i18n.getText('policyDangling'),  dangling),
        ]}).addStyleClass('sapUiSmallMargin'),
        beginButton: new Button({ text: i18n.getText('btnSave'), type: 'Emphasized', press: async () => {
          const updated = {
            id: p.id || 'default',
            flagBasicAuth:             flagBasic.getSelected(),
            requireMtlsForProd:        mtls.getSelected(),
            maxCertExpiryWarnDays:     parseInt(warn.getValue(), 10) || 60,
            maxCertExpiryCriticalDays: parseInt(critical.getValue(), 10) || 14,
            flagDanglingTargets:       dangling.getSelected(),
          };
          try {
            await this._upsertPolicy(updated);
            MessageToast.show('Policy saved');
            dialog.close();
            this._loadAll();
          } catch (e) {
            MessageToast.show('Save failed: ' + (e.message || e));
          }
        }}),
        endButton: new Button({ text: i18n.getText('btnCancel'), press: () => dialog.close() }),
        afterClose: () => dialog.destroy(),
      });
      dialog.open();
    },

    _upsertPolicy: async function (p) {
      // Try PATCH first, fall back to POST if not found.
      const patch = await fetch(`/odata/v4/destinv/ScanPolicies('${p.id}')`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify(p),
      });
      if (patch.ok || patch.status === 204) return;
      if (patch.status !== 404) throw new Error(`PATCH HTTP ${patch.status}`);
      const post = await fetch('/odata/v4/destinv/ScanPolicies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify(p),
      });
      if (!post.ok) throw new Error(`POST HTTP ${post.status}`);
    },

    // ── Acknowledge/ignore finding ───────────────────────────────────────────
    onFindingPress: function (oEvent) {
      const ctx = oEvent.getSource().getBindingContext('destinv');
      if (!ctx) return;
      const f = ctx.getObject();
      if (f.ignored) {
        MessageToast.show('Already acknowledged. Remove the entry from the Acknowledged tab to re-enable.');
        return;
      }
      const i18n = this.getView().getModel('i18n').getResourceBundle();
      const reason  = new Input({ placeholder: 'why' });
      const expires = new Input({ placeholder: 'YYYY-MM-DD (optional)' });

      const dialog = new Dialog({
        title: i18n.getText('ignoreDialogTitle'),
        contentWidth: '30rem',
        content: new VBox({ items: [
          new Label({ text: f.summary }).addStyleClass('sapUiSmallMarginBottom'),
          new Label({ text: i18n.getText('ignoreReason') }), reason,
          new Label({ text: i18n.getText('ignoreExpiresAt') }), expires,
        ]}).addStyleClass('sapUiSmallMargin'),
        beginButton: new Button({ text: i18n.getText('btnSave'), type: 'Emphasized', press: async () => {
          try {
            const body = {
              destinationName: f.destinationName,
              subaccountId:    f.subaccountId,
              findingCode:     f.code,
              reason:          reason.getValue(),
              expiresAt:       expires.getValue() || null,
            };
            const r = await fetch('/odata/v4/destinv/IgnoreRules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              credentials: 'include',
              body: JSON.stringify(body),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            MessageToast.show('Acknowledged');
            dialog.close();
            this._loadAll();
          } catch (e) {
            MessageToast.show('Failed: ' + (e.message || e));
          }
        }}),
        endButton: new Button({ text: i18n.getText('btnCancel'), press: () => dialog.close() }),
        afterClose: () => dialog.destroy(),
      });
      dialog.open();
    },

    onDeleteIgnore: async function () {
      const tab = this.byId ? this.byId('tabs') : null;
      const tabContent = tab ? tab.getItems().find((i) => i.getKey && i.getKey() === 'ignoreRules') : null;
      const table = tabContent && tabContent.getContent ? tabContent.getContent().find((c) => c.getMetadata && c.getMetadata().getName() === 'sap.m.Table') : null;
      const sel = table && table.getSelectedItem();
      if (!sel) { MessageToast.show('Select a row first'); return; }
      const r = sel.getBindingContext('destinv').getObject();
      try {
        const resp = await fetch(`/odata/v4/destinv/IgnoreRules(${r.id})`, {
          method: 'DELETE', credentials: 'include'
        });
        if (!resp.ok && resp.status !== 204) throw new Error(`HTTP ${resp.status}`);
        MessageToast.show('Removed');
        this._loadAll();
      } catch (e) {
        MessageToast.show('Failed: ' + (e.message || e));
      }
    },

    // ── Excel export ─────────────────────────────────────────────────────────
    onExport: function () {
      const rows = this._model().getProperty('/destinations') || [];
      if (!rows.length) return MessageToast.show('Nothing to export');
      const sheet = new Spreadsheet({
        workbook: { columns: [
          { label: 'Subaccount',    property: 'subaccountName',  type: 'string' },
          { label: 'Name',          property: 'name',            type: 'string' },
          { label: 'Type',          property: 'type',            type: 'string' },
          { label: 'Proxy',         property: 'proxyType',       type: 'string' },
          { label: 'Auth',          property: 'authentication',  type: 'string' },
          { label: 'URL',           property: 'url',             type: 'string' },
          { label: 'Cert Expires',  property: 'certNotAfter',    type: 'string' },
          { label: 'Days',          property: 'daysToExpiry',    type: 'number' }
        ]},
        dataSource: rows,
        fileName: `destination-inventory-${new Date().toISOString().slice(0,10)}.xlsx`
      });
      sheet.build().finally(() => sheet.destroy());
    }
  });

  function _defaultPolicy() {
    return {
      id: 'default',
      flagBasicAuth: true,
      requireMtlsForProd: true,
      maxCertExpiryWarnDays: 60,
      maxCertExpiryCriticalDays: 14,
      flagDanglingTargets: true,
    };
  }
});
