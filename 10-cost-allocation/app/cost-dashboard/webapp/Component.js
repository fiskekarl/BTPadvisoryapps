sap.ui.define([
  'sap/ui/core/UIComponent', 'sap/ui/Device', 'sap/ui/model/json/JSONModel'
], function (UIComponent, Device, JSONModel) {
  'use strict';
  return UIComponent.extend('com.btpconsulting.costallocation.Component', {
    metadata: { manifest: 'json' },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      const dev = new JSONModel(Device); dev.setDefaultBindingMode('OneWay');
      this.setModel(dev, 'device');
      const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      this.setModel(new JSONModel({ summary: {}, tree: [], invoices: [], yearMonth: ym, busy: false }), 'cost');
      this.getRouter().initialize();
    }
  });
});
