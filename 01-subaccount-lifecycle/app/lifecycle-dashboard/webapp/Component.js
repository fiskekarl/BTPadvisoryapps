sap.ui.define([
  'sap/ui/core/UIComponent',
  'sap/ui/Device',
  'sap/ui/model/json/JSONModel'
], function (UIComponent, Device, JSONModel) {
  'use strict';

  return UIComponent.extend('com.btpconsulting.subaccountlifecycle.Component', {
    metadata: { manifest: 'json' },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      const oDeviceModel = new JSONModel(Device);
      oDeviceModel.setDefaultBindingMode('OneWay');
      this.setModel(oDeviceModel, 'device');

      this.setModel(new JSONModel({
        summary: {},
        subaccounts: [],
        drift: [],
        audit: [],
        tierFilter: '',
        busy: false
      }), 'lifecycle');

      this.getRouter().initialize();
    }
  });
});
