sap.ui.define([
  'sap/ui/core/UIComponent',
  'sap/ui/Device',
  'sap/ui/model/json/JSONModel'
], function (UIComponent, Device, JSONModel) {
  'use strict';
  return UIComponent.extend('com.btpconsulting.certexpiry.Component', {
    metadata: { manifest: 'json' },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      const dev = new JSONModel(Device); dev.setDefaultBindingMode('OneWay');
      this.setModel(dev, 'device');
      this.setModel(new JSONModel({ summary: {}, certs: [], kindFilter: '', busy: false }), 'cert');
      this.getRouter().initialize();
    }
  });
});
