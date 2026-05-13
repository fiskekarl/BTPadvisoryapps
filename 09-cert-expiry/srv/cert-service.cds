using { com.btpconsulting.certexpiry as db } from '../db/schema';

/**
 * CertService — single pane of glass for every certificate in the BTP
 * landscape with rotation responsibility, blast radius, and expiry alerts.
 *
 * Cert kinds in scope:
 *   • XSUAA trust configurations (per subaccount)
 *   • IAS SAML / OIDC signing & encryption certs
 *   • Destination service ClientCert authentication
 *   • cTMS / Cloud Transport Management signing keys
 *   • Service-instance binding certs (x509 type credentials)
 *
 * Data sources are aggregated from the same APIs as apps #2 and #4 plus
 * IAS_API_URL for IAS certs. The same DESTINATION_KEYS env var from app #2
 * is reused so a single deploy can scan the whole global account.
 */
@requires: 'CertViewer'
service CertService {

  type CertRow {
    kind            : String(30);    // XSUAA_TRUST | IAS_SAML | DESTINATION | CTMS | SERVICE_BINDING
    subaccountId    : String(100);
    subaccountName  : String(200);
    name            : String(200);
    subject         : String(500);
    issuer          : String(500);
    notBefore       : String(10);
    notAfter        : String(10);
    daysToExpiry    : Integer;       // negative when already expired
    severity        : String(10);    // notice | warn | error | expired
    blastRadius     : String(500);   // human-readable: "all production destinations to S/4"
    rotationOwner   : String(200);   // populated from a per-engagement YAML registry
    acknowledged    : Boolean;
    ackReason       : String(500);
  }

  type CertSummary {
    totalCerts        : Integer;
    expiredCount      : Integer;
    critical14d       : Integer;
    warn30d           : Integer;
    notice90d         : Integer;
    unacknowledged    : Integer;
  }

  function getSummary() returns CertSummary;
  function getCerts()   returns array of CertRow;

  @(restrict: [
    { grant: 'READ',             to: 'CertViewer' },
    { grant: ['WRITE','DELETE'], to: 'CertAdmin'  }
  ])
  entity AlertThresholds as projection on db.AlertThreshold;

  @(restrict: [
    { grant: 'READ',             to: 'CertViewer' },
    { grant: ['WRITE','DELETE'], to: 'CertAdmin'  }
  ])
  entity Acknowledgements as projection on db.Acknowledgement;
}
