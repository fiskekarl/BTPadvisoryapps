sap.ui.define([
  'sap/ui/core/UIComponent', 'sap/ui/Device', 'sap/ui/model/json/JSONModel'
], function (UIComponent, Device, JSONModel) {
  'use strict';
  return UIComponent.extend('com.btpconsulting.auditlog.Component', {
    metadata: { manifest: 'json' },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      const dev = new JSONModel(Device); dev.setDefaultBindingMode('OneWay');
      this.setModel(dev, 'device');
      this.setModel(new JSONModel({ summary: {}, events: [], anomalies: [], timeline: [], days: 30, busy: false }), 'audit');
      this.getRouter().initialize();
    }
  });
});
