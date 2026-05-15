'use strict';

const axios = require('axios');
const { getOAuthToken } = require('./oauth-cache');

function loadKeys() {
  const out = [];
  if (process.env.SUBACCOUNT_KEYS) {
    try { out.push(...JSON.parse(process.env.SUBACCOUNT_KEYS)); }
    catch (e) { /* fall through */ }
  }
  if (out.length === 0) {
    const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
    const dest = vcap.destination?.[0]?.credentials;
    const xs   = vcap['authorization']?.[0]?.credentials || vcap['xsuaa']?.[0]?.credentials;
    const sm   = vcap['service-manager']?.[0]?.credentials;
    const aud  = vcap['auditlog-management']?.[0]?.credentials || vcap['auditlog-api']?.[0]?.credentials;
    if (dest || xs || sm || aud) {
      out.push({
        subaccountId:   'self',
        subaccountName: 'Local subaccount',
        destination:    dest && { uaa: dest.uaa, uri: dest.uri },
        xsuaa:          xs   && { uaa: xs.uaa,   apiurl: xs.apiurl },
        serviceManager: sm   && { uaa: sm.uaa,   sm_url: sm.sm_url || sm.uri },
        auditLog:       aud  && { uaa: aud.uaa,  url: aud.url },
      });
    }
  }
  return out;
}

async function authedGet(uaa, baseUrl, path) {
  const token = await getOAuthToken(uaa);
  const resp  = await axios.get(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout:      30_000,
    maxRedirects: 0,
    validateStatus: (s) => s < 500,
  });
  if (resp.status >= 400) {
    const err = new Error(`${baseUrl}${path} → HTTP ${resp.status}`);
    err.code = resp.status;
    throw err;
  }
  return resp.data;
}

async function getDestinations(saKey) {
  if (!saKey.destination) return [];
  const data = await authedGet(saKey.destination.uaa, saKey.destination.uri,
                               '/destination-configuration/v1/subaccountDestinations');
  return Array.isArray(data) ? data : (data?.destinationConfigurations ?? []);
}

async function getServiceInstances(saKey) {
  if (!saKey.serviceManager) return [];
  const data = await authedGet(saKey.serviceManager.uaa, saKey.serviceManager.sm_url,
                               '/v1/service_instances?max_items=200');
  return data?.items || data?.service_instances || [];
}

async function getRoleCollections(saKey) {
  if (!saKey.xsuaa) return [];
  const data = await authedGet(saKey.xsuaa.uaa, saKey.xsuaa.apiurl,
                               '/sap/rest/authorization/v2/role-collections');
  return data?.resources || data || [];
}

async function getTrustConfigurations(saKey) {
  if (!saKey.xsuaa) return [];
  const data = await authedGet(saKey.xsuaa.uaa, saKey.xsuaa.apiurl,
                               '/sap/rest/authorization/v2/trust-configurations');
  return data?.trustConfigurations || data || [];
}

module.exports = {
  loadKeys,
  getDestinations,
  getServiceInstances,
  getRoleCollections,
  getTrustConfigurations,
};
