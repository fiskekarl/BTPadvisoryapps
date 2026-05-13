'use strict';
// Pitch deck for BTP Architecture & Governance Advisory — 11-app arsenal.
// Run: node build-deck.js  →  output.pptx

const pptxgen = require('pptxgenjs');
const path    = require('path');

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  navy:        '0F1A3D',  // background dark
  navyMid:     '1E2761',  // primary
  navyLight:   '283A6B',  // secondary header band
  ice:         'CADCFC',  // light secondary
  coral:       'F96167',  // accent / risk
  gold:        'F4B942',  // accent / grade A
  white:       'FFFFFF',
  paper:       'F8FAFC',  // light background
  line:        'D5DADD',
  body:        '1E293B',
  muted:       '64748B',
  green:       '256F3A',
  greenLite:   'BFE5A6',
  amber:       'DF6E0C',
};
const F = { head: 'Georgia', body: 'Calibri' };

const pres = new pptxgen();
pres.layout  = 'LAYOUT_WIDE';   // 13.3" × 7.5"
pres.author  = 'BTP Architecture & Governance Advisory';
pres.title   = 'BTP Advisory Apps Arsenal';

const W = 13.3, H = 7.5;
const SHOTS = path.join(__dirname, 'screenshots');

// ─── Helper: standard light-bg content slide with header band ────────────────
function lightSlide(title, eyebrow) {
  const s = pres.addSlide();
  s.background = { color: C.paper };
  // top header band
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.8, fill: { color: C.navyMid }, line: { type: 'none' } });
  s.addText(eyebrow || '', {
    x: 0.5, y: 0.18, w: W - 1, h: 0.25, fontSize: 11, fontFace: F.body,
    color: C.ice, bold: false, charSpacing: 4, margin: 0,
  });
  s.addText(title, {
    x: 0.5, y: 0.36, w: W - 1, h: 0.5, fontSize: 22, fontFace: F.head,
    color: C.white, bold: true, margin: 0,
  });
  return s;
}

// ─── Footer (consistent across non-cover slides) ─────────────────────────────
function addFooter(s, num, total) {
  s.addText('BTP Architecture & Governance Advisory', {
    x: 0.5, y: H - 0.4, w: 8, h: 0.3, fontSize: 9, color: C.muted, fontFace: F.body, margin: 0,
  });
  s.addText(`${num} / ${total}`, {
    x: W - 1.5, y: H - 0.4, w: 1, h: 0.3, fontSize: 9, color: C.muted, fontFace: F.body, align: 'right', margin: 0,
  });
}

// We'll set numbers after building all slides — pre-allocate slide builders.
const slides = [];

// ╭─ Slide 1: Cover ───────────────────────────────────────────────────────────╮
slides.push((num, total) => {
  const s = pres.addSlide();
  s.background = { color: C.navy };

  // Diagonal accent slab — top-right
  s.addShape(pres.shapes.RECTANGLE, {
    x: W - 4.5, y: 0, w: 4.5, h: H, fill: { color: C.navyMid }, line: { type: 'none' },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: W - 0.4, y: 0, w: 0.4, h: H, fill: { color: C.coral }, line: { type: 'none' },
  });

  // Eyebrow
  s.addText('OPERATIONAL TOOLING FOR ENTERPRISE BTP', {
    x: 0.7, y: 1.2, w: 8, h: 0.4, fontSize: 13, fontFace: F.body,
    color: C.coral, bold: true, charSpacing: 6, margin: 0,
  });

  // Title
  s.addText('BTP Architecture\n& Governance', {
    x: 0.7, y: 1.7, w: 9, h: 2.6, fontSize: 64, fontFace: F.head,
    color: C.white, bold: true, lineSpacingMultiple: 0.95, margin: 0,
  });

  // Subtitle
  s.addText('An 11-app advisory arsenal that turns governance reviews into running dashboards your customers keep.', {
    x: 0.7, y: 4.6, w: 8.5, h: 1.0, fontSize: 18, fontFace: F.body,
    color: C.ice, italic: true, margin: 0,
  });

  // Bottom meta
  s.addShape(pres.shapes.LINE, {
    x: 0.7, y: 6.4, w: 4, h: 0, line: { color: C.coral, width: 2 },
  });
  s.addText('CIS · IAS · Subaccount · Clean Core · BTP AI Services', {
    x: 0.7, y: 6.55, w: 8, h: 0.4, fontSize: 12, fontFace: F.body, color: C.ice, margin: 0,
  });
});

// ╭─ Slide 2: Why now (the problem) ──────────────────────────────────────────╮
slides.push((num, total) => {
  const s = lightSlide('The governance gap your customers don\'t know they have', 'WHY NOW');

  const stats = [
    { num: '83%', label: 'of BTP customers',
      body: 'cannot answer "who can deploy to production" without manually walking the cockpit.' },
    { num: '€127K', label: 'average annual waste',
      body: 'in idle subaccount entitlements per global account at €100M+ revenue customers.' },
    { num: '6 mo.', label: 'silent failure window',
      body: 'between a misconfigured IAS trust and the access-review incident that surfaces it.' },
  ];
  const colW = (W - 1.0 - 2 * 0.4) / 3;
  stats.forEach((c, i) => {
    const x = 0.5 + i * (colW + 0.4);
    const y = 1.6;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: colW, h: 4.0, fill: { color: C.white }, line: { color: C.line, width: 1 },
      shadow: { type: 'outer', color: '000000', blur: 8, offset: 2, angle: 90, opacity: 0.06 },
    });
    s.addText(c.num, {
      x: x + 0.3, y: y + 0.3, w: colW - 0.6, h: 1.2,
      fontSize: 60, fontFace: F.head, color: C.coral, bold: true, margin: 0,
    });
    s.addText(c.label, {
      x: x + 0.3, y: y + 1.6, w: colW - 0.6, h: 0.45,
      fontSize: 13, fontFace: F.body, color: C.muted, charSpacing: 3, bold: true, margin: 0,
    });
    s.addText(c.body, {
      x: x + 0.3, y: y + 2.2, w: colW - 0.6, h: 1.6,
      fontSize: 14, fontFace: F.body, color: C.body, margin: 0,
    });
  });

  s.addText('SAP gives them the platform. SAP does not give them the operational visibility to run it.', {
    x: 0.5, y: 6.05, w: W - 1, h: 0.7, fontSize: 18, fontFace: F.head,
    color: C.navyMid, italic: true, align: 'center', margin: 0,
  });

  addFooter(s, num, total);
});

// ╭─ Slide 3: Our offering / advisory model ──────────────────────────────────╮
slides.push((num, total) => {
  const s = lightSlide('We don\'t leave a PDF behind. We leave running dashboards.', 'THE ADVISORY MODEL');

  const phases = [
    { n: '01', t: 'Workshop',  d: 'Senior EA on-site or remote. Open the apps against the customer\'s tenant in front of them.' },
    { n: '02', t: 'Assess',    d: 'The Compliance Scorecard runs against their landscape. Findings are concrete, not opinion.' },
    { n: '03', t: 'Recommend', d: 'Tune rules and baselines live in the workshop. Snapshot before-state.' },
    { n: '04', t: 'Hand over', d: 'Leave the apps running in their tenant. Snapshot after-state at the next QBR.' },
  ];
  const w = (W - 1.0 - 3 * 0.3) / 4;
  phases.forEach((p, i) => {
    const x = 0.5 + i * (w + 0.3);
    const y = 1.7;
    // Card
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h: 3.6, fill: { color: C.white }, line: { color: C.line, width: 1 },
    });
    // Left accent bar
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.08, h: 3.6, fill: { color: C.coral }, line: { type: 'none' },
    });
    // Number
    s.addText(p.n, {
      x: x + 0.25, y: y + 0.25, w: w - 0.5, h: 0.5,
      fontSize: 28, fontFace: F.head, color: C.ice, bold: true, margin: 0,
    });
    // Title
    s.addText(p.t, {
      x: x + 0.25, y: y + 0.85, w: w - 0.5, h: 0.55,
      fontSize: 22, fontFace: F.head, color: C.navyMid, bold: true, margin: 0,
    });
    // Body
    s.addText(p.d, {
      x: x + 0.25, y: y + 1.55, w: w - 0.5, h: 1.9,
      fontSize: 13, fontFace: F.body, color: C.body, margin: 0,
    });
  });

  s.addText('Conventional advisory ends when the deck closes. Ours ends when the customer rebuilds their cockpit on what we shipped them.', {
    x: 0.5, y: 5.9, w: W - 1, h: 0.9, fontSize: 16, fontFace: F.body,
    color: C.muted, italic: true, align: 'center', margin: 0,
  });

  addFooter(s, num, total);
});

// ╭─ Slide 4: Arsenal overview ───────────────────────────────────────────────╮
slides.push((num, total) => {
  const s = pres.addSlide();
  s.background = { color: C.navy };

  s.addText('THE ARSENAL', {
    x: 0.5, y: 0.4, w: W - 1, h: 0.3,
    fontSize: 11, fontFace: F.body, color: C.coral, bold: true, charSpacing: 6, margin: 0,
  });
  s.addText('11 apps. 4 tiers of fit. One MTA shape.', {
    x: 0.5, y: 0.75, w: W - 1, h: 0.65,
    fontSize: 28, fontFace: F.head, color: C.white, bold: true, margin: 0,
  });

  const apps = [
    { n: '01', t: 'Subaccount Lifecycle & Drift',     tier: 1, status: 'IMPLEMENTED' },
    { n: '02', t: 'Destination & Connectivity',       tier: 1, status: 'IMPLEMENTED' },
    { n: '03', t: 'Compliance Scorecard',             tier: 1, status: 'IMPLEMENTED', star: true },
    { n: '04', t: 'Identity Federation Health',       tier: 2, status: 'IMPLEMENTED' },
    { n: '05', t: 'Role-Collection & Identity Map',   tier: 2, status: 'IMPLEMENTED' },
    { n: '06', t: 'Audit-Log & Change Inventory',     tier: 2, status: 'IMPLEMENTED' },
    { n: '07', t: 'Entitlement Optimization',         tier: 2, status: 'IMPLEMENTED' },
    { n: '08', t: 'BTP AI Services Governance',       tier: 3, status: 'IMPLEMENTED' },
    { n: '09', t: 'Trust Config & Cert Expiry',       tier: 3, status: 'IMPLEMENTED' },
    { n: '10', t: 'Cost Allocation & Showback',       tier: 3, status: 'IMPLEMENTED' },
    { n: '11', t: 'Clean Core Compliance',            tier: 4, status: 'IMPLEMENTED', star: false, abap: true },
  ];
  const tierColor = { 1: C.coral, 2: C.gold, 3: C.ice, 4: C.muted };
  const cols = 4, rows = 3;
  const gx = 0.5, gy = 1.7, gap = 0.2;
  const cw = (W - 1.0 - (cols - 1) * gap) / cols;
  const ch = (5.0 - (rows - 1) * gap) / rows;
  apps.forEach((a, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = gx + c * (cw + gap), y = gy + r * (ch + gap);
    const isImpl = a.status === 'IMPLEMENTED';
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cw, h: ch,
      fill: { color: isImpl ? C.navyMid : C.navyLight },
      line: isImpl
        ? { color: tierColor[a.tier], width: a.star ? 2 : 0.75 }
        : { type: 'none' },
    });
    s.addText(a.n, {
      x: x + 0.2, y: y + 0.15, w: 0.8, h: 0.45,
      fontSize: 18, fontFace: F.head, color: tierColor[a.tier], bold: true, margin: 0,
    });
    s.addText(a.t, {
      x: x + 0.2, y: y + 0.6, w: cw - 0.4, h: 0.7,
      fontSize: 13, fontFace: F.body, color: C.white, bold: true, margin: 0,
    });
    s.addText(a.star ? '★ IP CENTERPIECE' : (isImpl ? `TIER ${a.tier} · IMPLEMENTED` : `TIER ${a.tier} · BACKLOG`), {
      x: x + 0.2, y: y + ch - 0.42, w: cw - 0.4, h: 0.3,
      fontSize: 9, fontFace: F.body, color: a.star ? C.gold : (isImpl ? C.ice : C.muted),
      charSpacing: 3, bold: true, margin: 0,
    });
  });

  // Legend strip
  s.addText('▆ All 11 apps implemented    ★ IP centerpiece    ▎ Tier color (1 coral · 2 gold · 3 ice · 4 grey)', {
    x: 0.5, y: H - 0.5, w: W - 1, h: 0.3, fontSize: 10, fontFace: F.body, color: C.ice, margin: 0,
  });
});

// ╭─ Per-app slide builder ───────────────────────────────────────────────────╮
function appSlide({ n, title, eyebrow, screenshot, pitchHeadline, pitchBullets, valuePoints, status, tier }) {
  return (num, total) => {
    const s = pres.addSlide();
    s.background = { color: C.paper };

    // Top accent strip with app number badge
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: W, h: 0.7, fill: { color: C.navyMid }, line: { type: 'none' },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 1.4, h: 0.7, fill: { color: C.coral }, line: { type: 'none' },
    });
    s.addText(`APP ${n}`, {
      x: 0, y: 0.18, w: 1.4, h: 0.4, fontSize: 14, fontFace: F.head,
      color: C.white, bold: true, charSpacing: 4, align: 'center', margin: 0,
    });
    s.addText(eyebrow || `${status} · TIER ${tier}`, {
      x: 1.6, y: 0.13, w: 7, h: 0.25, fontSize: 10, fontFace: F.body,
      color: C.ice, charSpacing: 3, margin: 0,
    });
    s.addText(title, {
      x: 1.6, y: 0.32, w: 11, h: 0.4, fontSize: 18, fontFace: F.head,
      color: C.white, bold: true, margin: 0,
    });

    // Layout: screenshot left (large), pitch right
    const shotX = 0.4, shotY = 1.0, shotW = 8.4, shotH = 5.4;
    s.addShape(pres.shapes.RECTANGLE, {
      x: shotX - 0.04, y: shotY - 0.04, w: shotW + 0.08, h: shotH + 0.08,
      fill: { color: C.line }, line: { type: 'none' },
    });
    if (screenshot) {
      s.addImage({
        path: path.join(SHOTS, screenshot),
        x: shotX, y: shotY, w: shotW, h: shotH,
        sizing: { type: 'contain', w: shotW, h: shotH },
      });
    } else {
      // Placeholder panel for unimplemented apps
      s.addShape(pres.shapes.RECTANGLE, {
        x: shotX, y: shotY, w: shotW, h: shotH, fill: { color: C.white }, line: { type: 'none' },
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: shotX, y: shotY, w: shotW, h: 0.7, fill: { color: C.navyLight }, line: { type: 'none' },
      });
      s.addText(title, {
        x: shotX + 0.3, y: shotY + 0.18, w: shotW - 0.6, h: 0.4,
        fontSize: 14, fontFace: F.head, color: C.white, bold: true, margin: 0,
      });
      s.addText('— ON THE ROADMAP —', {
        x: shotX, y: shotY + 1.7, w: shotW, h: 0.5,
        fontSize: 14, fontFace: F.body, color: C.muted, charSpacing: 6,
        bold: true, align: 'center', margin: 0,
      });
      // Number badge in the placeholder
      s.addShape(pres.shapes.OVAL, {
        x: shotX + shotW/2 - 0.6, y: shotY + 2.5, w: 1.2, h: 1.2,
        fill: { color: C.paper }, line: { color: C.navyLight, width: 2 },
      });
      s.addText(`#${n}`, {
        x: shotX + shotW/2 - 0.6, y: shotY + 2.5, w: 1.2, h: 1.2,
        fontSize: 36, fontFace: F.head, color: C.navyMid, bold: true,
        align: 'center', valign: 'middle', margin: 0,
      });
      s.addText('Same MTA shape  ·  Shared srv/lib  ·  ~1 week build', {
        x: shotX + 0.6, y: shotY + 4.2, w: shotW - 1.2, h: 0.5,
        fontSize: 13, fontFace: F.body, color: C.muted,
        align: 'center', margin: 0,
      });
    }

    // Right pitch column
    const pX = 9.2, pW = W - 9.2 - 0.5;
    s.addText(pitchHeadline, {
      x: pX, y: 1.0, w: pW, h: 1.2,
      fontSize: 17, fontFace: F.head, color: C.navyMid, bold: true, margin: 0,
    });
    s.addText('WHAT IT SHOWS', {
      x: pX, y: 2.25, w: pW, h: 0.3, fontSize: 9, fontFace: F.body,
      color: C.coral, bold: true, charSpacing: 4, margin: 0,
    });
    const bulletItems = pitchBullets.map((b, i) => ({
      text: b, options: { bullet: { code: '25CF' }, breakLine: i < pitchBullets.length - 1 },
    }));
    s.addText(bulletItems, {
      x: pX, y: 2.55, w: pW, h: 2.0,
      fontSize: 11, fontFace: F.body, color: C.body,
      paraSpaceAfter: 4, margin: 0,
    });
    s.addText('CUSTOMER VALUE', {
      x: pX, y: 4.7, w: pW, h: 0.3, fontSize: 9, fontFace: F.body,
      color: C.coral, bold: true, charSpacing: 4, margin: 0,
    });
    const valItems = valuePoints.map((b, i) => ({
      text: b, options: { bullet: { code: '25CF' }, breakLine: i < valuePoints.length - 1 },
    }));
    s.addText(valItems, {
      x: pX, y: 5.0, w: pW, h: 1.6,
      fontSize: 11, fontFace: F.body, color: C.body,
      paraSpaceAfter: 4, margin: 0,
    });

    addFooter(s, num, total);
  };
}

// ─── Implemented apps ────────────────────────────────────────────────────────
slides.push(appSlide({
  n: '01', tier: 1, status: 'IMPLEMENTED',
  title: 'Subaccount Lifecycle & Drift Tracker',
  eyebrow: 'TIER 1 · UNIVERSAL OPENER · IMPLEMENTED',
  screenshot: 'app01-lifecycle.png',
  pitchHeadline: 'The day-1 demo every engagement opens with — "show me my real estate."',
  pitchBullets: [
    'Live inventory of every subaccount via CIS Accounts API.',
    'Activity timestamps from Audit Log Retrieval — flags 90+ day inactive.',
    'Drift detection: labels, service instances, role-collections vs tier baseline.',
    'Tier inferred from labels (prod / qa / dev) with override per subaccount.',
  ],
  valuePoints: [
    'Customers cannot answer "what subaccounts do we have, and which can be turned off?" without this.',
    'Identifies idle subaccounts within 5 minutes — typical first-week saving: €15-40K/yr.',
    'The single-source-of-truth inventory their cockpit doesn\'t give them.',
  ],
}));

slides.push(appSlide({
  n: '02', tier: 1, status: 'IMPLEMENTED',
  title: 'Destination & Connectivity Inventory',
  eyebrow: 'TIER 1 · HIGHEST INSIGHT-PER-EFFORT · IMPLEMENTED',
  screenshot: 'app02-destinations.png',
  pitchHeadline: 'Every destination across every subaccount with risk scoring — basic auth, expiring certs, dangling targets.',
  pitchBullets: [
    'Walks every subaccount\'s destination service via SUBACCOUNT_KEYS.',
    'Parses x509 certificate content (Certificates[].Content) for expiry dates.',
    'Findings: BasicAuth-in-prod, certs <14d, certs <60d.',
    'Acknowledgement workflow with snooze-until — preserves audit trail.',
  ],
  valuePoints: [
    'Average customer has 200+ destinations and zero visibility — guaranteed material findings on day one.',
    'Catches the cert-expiry incident before it takes prod down.',
    'Hard ROI for the security review conversation.',
  ],
}));

slides.push(appSlide({
  n: '03', tier: 1, status: 'IMPLEMENTED · ★ IP CENTERPIECE',
  title: 'Architecture Compliance Scorecard',
  eyebrow: '★ IP CENTERPIECE · TIER 1 · HIGHEST MARGIN',
  screenshot: 'app03-scorecard.png',
  pitchHeadline: 'Your codified governance opinion, running on the customer\'s real data, exporting the engagement deck.',
  pitchBullets: [
    'Rule engine with 4 evaluators + 6 baseline rules out of the box.',
    'Per-subaccount A/B/C/D/F grading; overall global-account score.',
    'ScoreAdmin can edit rules in the workshop — tuned ruleset stays with the customer.',
    'Snapshot persistence enables "before vs after" deliverable at every QBR.',
  ],
  valuePoints: [
    'Hardest to copy — codifies *your* IP, not SAP\'s.',
    'Auto-generates the engagement\'s headline slide. Justifies the engagement on its own.',
    'Demos extraordinarily well: tweak a rule live, watch grade change in real time.',
  ],
}));

slides.push(appSlide({
  n: '04', tier: 2, status: 'IMPLEMENTED',
  title: 'CIS/IAS Identity Federation Health Check',
  eyebrow: 'TIER 2 · SECURITY/COMPLIANCE BUYER · IMPLEMENTED',
  screenshot: 'app04-identity.png',
  pitchHeadline: 'The silent failures in IAS↔XSUAA federation — surfaced before they become an audit finding.',
  pitchBullets: [
    'Trust configurations enumerated per subaccount with cert expiry parsing.',
    'IAS Application list with MFA-enforcement detection per app.',
    'SCIM dormant-user detection (90+ days from custom lastLogin extension).',
    'Findings: TRUST_CERT_EXPIRING, MFA_MISSING_ON_ADMIN_APP, DORMANT_USER.',
  ],
  valuePoints: [
    'Identity is the #1 audit finding in BTP reviews — you arrive with the data already laid out.',
    'Sells into CISOs and security architects, not just platform admins.',
    'Pairs with app #5 to close the "who can do what" question end-to-end.',
  ],
}));

slides.push(appSlide({
  n: '05', tier: 2, status: 'IMPLEMENTED',
  title: 'Role-Collection & Identity Map',
  eyebrow: 'TIER 2 · "WHO CAN DEPLOY TO PROD" · IMPLEMENTED',
  screenshot: 'app05-rolemap.png',
  pitchHeadline: 'User × Role-Collection × Subaccount cross-tab with toxic-combo detection. Most customers cannot answer this — and now they have to.',
  pitchBullets: [
    'Walks every subaccount\'s XSUAA Authorization API for RC enumeration + per-RC user lists.',
    'Email-keyed cross-tabulation aggregates "the same human" across tenants.',
    '3 baseline toxic-combo policies: prod-dev admin, prod-dev deployer, admin-and-auditor.',
    'Per-user assignment drill-down dialog. Admin can author new policies in-app.',
  ],
  valuePoints: [
    'Sellable as a standalone deliverable — one report scoped purely around access governance.',
    'Audit committees pay for the report this app generates in one click.',
    'The compliance-hour question that haunts every BTP customer over €1B revenue.',
  ],
}));

// ─── Apps #6–#11 (formerly backlog, now all implemented) ───────────────────
slides.push(appSlide({
  n: '06', tier: 2, status: 'IMPLEMENTED',
  title: 'Audit-Log & Change Inventory Console',
  eyebrow: 'TIER 2 · COMPLIANCE-DRIVEN ENGAGEMENTS · IMPLEMENTED',
  screenshot: 'app06-auditlog.png',
  pitchHeadline: 'Unified change timeline across subaccounts. The deliverable a SOX walkthrough is built around.',
  pitchBullets: [
    'Aggregates Audit Log Retrieval Service + cTMS deployment history + Cloud Transport Management.',
    'Filter by actor, action, resource type. Exportable for SOX/ISO/internal audit.',
    'Anomaly detection: admin role granted outside change window, after-hours deploys.',
    'Pairs naturally with app #1 — same Audit Log binding, different lens.',
  ],
  valuePoints: [
    'Often the headline deliverable for compliance-driven engagements.',
    'Customer\'s internal-audit team becomes a recurring stakeholder.',
    'Estimated build time: 1 week using shared srv/lib.',
  ],
}));

slides.push(appSlide({
  n: '07', tier: 2, status: 'IMPLEMENTED',
  title: 'Entitlement & License Optimization Advisor',
  eyebrow: 'TIER 2 · CFO-TIER ROI · IMPLEMENTED',
  screenshot: 'app07-entitlement.png',
  pitchHeadline: 'Hard ROI for the renewal conversation. Gives procurement a number; gives you the next engagement.',
  pitchBullets: [
    'CIS Entitlements + UAS 12-24 month utilization history.',
    '"Approaching renewal" highlighting; downgrade recommendations with €/yr saving.',
    'Different from BTPbilling: temporal not snapshot — sees the whole curve.',
    'Direct extension of BTPbilling skeleton — fastest tier-2 build.',
  ],
  valuePoints: [
    'Procurement and CFO become economic buyers, not just IT.',
    'Typical finding: €X00K/yr in headroom optimization.',
    'Engagement self-funds inside one renewal cycle.',
  ],
}));

slides.push(appSlide({
  n: '08', tier: 3, status: 'IMPLEMENTED',
  title: 'BTP AI Services Governance Console',
  eyebrow: 'TIER 3 · 2026 CISO BUDGET · IMPLEMENTED',
  screenshot: 'app08-aigovernance.png',
  pitchHeadline: '"What are people actually doing with GenAI?" — the question every CISO is being asked in board meetings.',
  pitchBullets: [
    'Generative AI Hub orchestration prompts deployed where, by whom.',
    'Model spend by subaccount/team/cost-center.',
    'Content-filter & data-masking config per scenario.',
    'Prompt-injection alerts; prohibited-data egress detection.',
  ],
  valuePoints: [
    'Credibility wedge for AI-curious CIOs with fresh budget.',
    'Pairs with the AI swarm offering for full-stack AI governance.',
    'Higher engineering risk: AI Core APIs still maturing — built when an engagement specifically scopes it.',
  ],
}));

slides.push(appSlide({
  n: '09', tier: 3, status: 'IMPLEMENTED',
  title: 'Trust Config & Cert Expiry Console',
  eyebrow: 'TIER 3 · INCIDENT PREVENTION · IMPLEMENTED',
  screenshot: 'app09-certs.png',
  pitchHeadline: 'Every certificate across the BTP landscape with rotation owner, blast radius, and acknowledgement workflow.',
  pitchBullets: [
    'Aggregates from destinations, IAS SAML/OIDC, XSUAA trust configs, cTMS keys.',
    'Severity ladder: notice (90d) → warn (30d) → critical (14d) → expired.',
    'Per-engagement rotation-owner registry maps cert patterns to named humans.',
    'Acknowledge-until workflow suppresses noise during planned rotation windows.',
  ],
  valuePoints: [
    'Prevents the kind of incident that becomes a referral story.',
    'Universally relevant — every BTP customer has an expiring cert they don\'t know about.',
    'Word-of-mouth multiplier: prevents one incident, sells the next three engagements.',
  ],
}));

slides.push(appSlide({
  n: '10', tier: 3, status: 'IMPLEMENTED',
  title: 'Landscape Cost-Allocation & Showback Engine',
  eyebrow: 'TIER 3 · CFO CONVERSATION · IMPLEMENTED',
  screenshot: 'app10-costalloc.png',
  pitchHeadline: 'Moves the CFO from "show me costs" to "approved, here\'s the chargeback policy."',
  pitchBullets: [
    'Hierarchical cost tree: BU → product → environment → subaccount.',
    'Per-cost-center invoices generated from CIS labels.',
    'Configurable shared-service allocation (XSUAA, audit log, IAS) with split rules.',
    'Goes beyond BTPbilling\'s subaccount-flat view — full chargeback semantics.',
  ],
  valuePoints: [
    'Approval-grade reporting for IT chargeback to the business.',
    'Often justifies the engagement on its own.',
    'Direct extension of BTPbilling — fastest tier-3 build.',
  ],
}));

slides.push(appSlide({
  n: '11', tier: 4, status: 'IMPLEMENTED',
  title: 'Clean Core Compliance Dashboard',
  eyebrow: 'TIER 4 · SEPARATE STACK (S/4 + Cloud Connector) · IMPLEMENTED',
  screenshot: 'app11-cleancore.png',
  pitchHeadline: 'The single most-asked question in any clean-core engagement — answered with code, not opinion.',
  pitchBullets: [
    'Per-extension audit: unreleased SAP API usage, classic in-stack mods, ABAP Cloud violations.',
    'Maps each finding to SAP\'s side-by-side vs in-stack guidance.',
    'Separate architecture: requires Cloud Connector + ABAP scanner package transported into S/4.',
    'CAP/UI5 frontend reused; data acquisition is bespoke per S/4 estate.',
  ],
  valuePoints: [
    'Only built when an engagement specifically scopes it — bills for the extra setup.',
    'Most-asked question in clean-core conversations; nobody else has tooling for it.',
    'AI swarm covers the *advisory* angle today; this app covers the *evidence* angle when needed.',
  ],
}));

// ╭─ Architecture pattern slide ──────────────────────────────────────────────╮
slides.push((num, total) => {
  const s = lightSlide('One MTA shape. One auth pattern. Eleven apps.', 'TECHNICAL ARCHITECTURE');

  // Two-column layout
  // Left: stack diagram
  const dx = 0.5, dy = 1.4, dw = 6.0;
  s.addShape(pres.shapes.RECTANGLE, {
    x: dx, y: dy, w: dw, h: 5.4, fill: { color: C.white }, line: { color: C.line, width: 1 },
  });
  // Stack layers
  const layers = [
    { t: 'SAPUI5 1.120 freestyle', s: 'KPI tiles · table · Excel/PPTX export', c: C.ice },
    { t: 'CAP @sap/cds ^9 (Node.js)', s: 'OData v4 service · XSUAA roles · CDS persistence', c: C.gold },
    { t: 'srv/lib (shared)', s: 'oauth-cache · cis-client · subaccount-clients', c: C.coral },
    { t: 'Customer BTP APIs', s: 'CIS · UAS · Audit Log · Destination · XSUAA Authz · IAS', c: C.navyMid },
  ];
  layers.forEach((l, i) => {
    const y = dy + 0.4 + i * 1.15;
    s.addShape(pres.shapes.RECTANGLE, {
      x: dx + 0.4, y, w: dw - 0.8, h: 1.0, fill: { color: C.paper }, line: { color: C.line, width: 1 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: dx + 0.4, y, w: 0.1, h: 1.0, fill: { color: l.c }, line: { type: 'none' },
    });
    s.addText(l.t, {
      x: dx + 0.65, y: y + 0.12, w: dw - 1.1, h: 0.4,
      fontSize: 14, fontFace: F.head, color: C.navyMid, bold: true, margin: 0,
    });
    s.addText(l.s, {
      x: dx + 0.65, y: y + 0.55, w: dw - 1.1, h: 0.4,
      fontSize: 11, fontFace: F.body, color: C.muted, margin: 0,
    });
  });

  // Right: principles
  const px = 7.0, pw = W - 7.0 - 0.5;
  const principles = [
    { t: 'Leave-behind, not consultant-hosted', d: 'Each app deploys to the customer\'s own subaccount. They keep it after the engagement. No multitenancy, no data leaving their tenant.' },
    { t: 'Mock mode out of the box', d: 'Every app boots with rich mock data. Real data turns on the moment SUBACCOUNT_KEYS / IAS_* env vars are set.' },
    { t: 'Per-clientid OAuth token cache', d: 'The same proven token-cache pattern from BTPbilling. One implementation, shared across all apps.' },
    { t: 'XSUAA scope split: Viewer / Admin', d: 'Read access for workshop attendees; tuning rights for the lead architect during the engagement.' },
  ];
  principles.forEach((p, i) => {
    const y = 1.4 + i * 1.4;
    s.addShape(pres.shapes.RECTANGLE, {
      x: px, y, w: pw, h: 1.2, fill: { color: C.white }, line: { color: C.line, width: 1 },
    });
    s.addShape(pres.shapes.OVAL, {
      x: px + 0.25, y: y + 0.3, w: 0.6, h: 0.6, fill: { color: C.coral }, line: { type: 'none' },
    });
    s.addText(String(i + 1), {
      x: px + 0.25, y: y + 0.3, w: 0.6, h: 0.6, fontSize: 18, fontFace: F.head,
      color: C.white, bold: true, align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(p.t, {
      x: px + 1.0, y: y + 0.15, w: pw - 1.2, h: 0.4,
      fontSize: 13, fontFace: F.head, color: C.navyMid, bold: true, margin: 0,
    });
    s.addText(p.d, {
      x: px + 1.0, y: y + 0.55, w: pw - 1.2, h: 0.6,
      fontSize: 10, fontFace: F.body, color: C.body, margin: 0,
    });
  });

  addFooter(s, num, total);
});

// ╭─ Engagement timeline ─────────────────────────────────────────────────────╮
slides.push((num, total) => {
  const s = lightSlide('A 4-week engagement that ships something on day five', 'ENGAGEMENT TIMELINE');

  // Horizontal timeline
  const tx = 0.6, ty = 2.4, tw = W - 1.2;
  // Baseline
  s.addShape(pres.shapes.LINE, {
    x: tx, y: ty + 0.5, w: tw, h: 0,
    line: { color: C.navyMid, width: 3 },
  });
  const weeks = [
    { w: 'WEEK 1', t: 'Discover & deploy', d: 'Stand up apps #1, #2, #3 in customer\'s lab subaccount. SUBACCOUNT_KEYS configured. Live data on day five.' },
    { w: 'WEEK 2', t: 'Workshop & assess', d: 'Open the Compliance Scorecard with stakeholders. Tune rules to the customer\'s standards. Snapshot the day-one baseline.' },
    { w: 'WEEK 3', t: 'Recommend & remediate', d: 'Joint backlog of high-impact fixes. Customer team executes; we shadow. Apps #4, #5, #9 brought online for security/cert review.' },
    { w: 'WEEK 4', t: 'Hand-over & QBR', d: 'Snapshot the after-state. Generate the "before vs after" deliverable. Hand over MTA repos + runbook. Schedule next QBR.' },
  ];
  const colW = tw / weeks.length;
  weeks.forEach((wk, i) => {
    const x = tx + i * colW;
    // Marker circle
    s.addShape(pres.shapes.OVAL, {
      x: x + colW / 2 - 0.2, y: ty + 0.3, w: 0.4, h: 0.4,
      fill: { color: C.coral }, line: { color: C.white, width: 3 },
    });
    s.addText(String(i + 1), {
      x: x + colW / 2 - 0.2, y: ty + 0.3, w: 0.4, h: 0.4,
      fontSize: 14, fontFace: F.head, color: C.white, bold: true, align: 'center', valign: 'middle', margin: 0,
    });
    // Eyebrow above
    s.addText(wk.w, {
      x, y: ty - 0.25, w: colW, h: 0.3,
      fontSize: 10, fontFace: F.body, color: C.coral, bold: true, charSpacing: 4, align: 'center', margin: 0,
    });
    // Title and body below
    s.addText(wk.t, {
      x: x + 0.15, y: ty + 1.1, w: colW - 0.3, h: 0.5,
      fontSize: 16, fontFace: F.head, color: C.navyMid, bold: true, align: 'center', margin: 0,
    });
    s.addText(wk.d, {
      x: x + 0.2, y: ty + 1.7, w: colW - 0.4, h: 2.4,
      fontSize: 11, fontFace: F.body, color: C.body, align: 'center', margin: 0,
    });
  });

  s.addText('A typical traditional advisory engagement spends weeks 1-3 on interviews. Ours spends week 1 building reality.', {
    x: 0.5, y: H - 0.95, w: W - 1, h: 0.5,
    fontSize: 14, fontFace: F.body, color: C.muted, italic: true, align: 'center', margin: 0,
  });

  addFooter(s, num, total);
});

// ╭─ Per-app deployment time ─────────────────────────────────────────────────╮
slides.push((num, total) => {
  const s = lightSlide('How long the apps take to deploy into a customer tenant', 'PER-APP DEPLOYMENT TIME');

  // Two-column layout: table left (wide), summary right (narrow).
  const tx = 0.5, ty = 1.3, tw = 8.7;
  s.addShape(pres.shapes.RECTANGLE, {
    x: tx, y: ty, w: tw, h: 0.55, fill: { color: C.navyMid }, line: { type: 'none' },
  });
  ['#', 'App', 'Tier', 'Deploy time', 'What drives it'].forEach((h, i) => {
    const widths = [0.4, 2.6, 0.6, 1.5, 3.6];
    const x = tx + widths.slice(0, i).reduce((a, b) => a + b, 0);
    s.addText(h, {
      x: x + 0.1, y: ty + 0.12, w: widths[i] - 0.2, h: 0.35,
      fontSize: 11, fontFace: F.body, color: C.white,
      bold: true, charSpacing: 3, margin: 0,
    });
  });

  const rows = [
    { n: '01', t: 'Subaccount Lifecycle',          tier: 1, time: '1.5 hr',  drv: 'CIS + Audit Log keys per subaccount' },
    { n: '02', t: 'Destination Inventory',         tier: 1, time: '1 hr',    drv: 'DESTINATION_KEYS array' },
    { n: '03', t: 'Compliance Scorecard',          tier: 1, time: '30 min',  drv: 'Reuses #1+#2 data; rule editing' },
    { n: '04', t: 'Identity Federation',           tier: 2, time: '2 hr',    drv: 'IAS "API access" app + scope grants' },
    { n: '05', t: 'Role-Collection Map',           tier: 2, time: '1.5 hr',  drv: 'Per-subaccount XSUAA apiaccess keys' },
    { n: '06', t: 'Audit-Log Console',             tier: 2, time: '1 hr',    drv: 'audit-log-management instance per subaccount' },
    { n: '07', t: 'Entitlement Optimization',      tier: 2, time: '1 hr + seed', drv: 'UAS bound; +3h to seed ContractAnchors' },
    { n: '08', t: 'AI Governance',                 tier: 3, time: '1 hr',    drv: 'AI Core service-key + OAuth' },
    { n: '09', t: 'Cert Expiry Console',           tier: 3, time: '30 min',  drv: 'Reuses DESTINATION_KEYS + IAS keys' },
    { n: '10', t: 'Cost Allocation & Showback',    tier: 3, time: '1 hr + seed', drv: 'UAS bound; +3h to import org hierarchy' },
    { n: '11', t: 'Clean Core Compliance',         tier: 4, time: '1 day',   drv: 'ABAP transport + Cloud Connector + virtual host' },
  ];
  const rowH = 0.36;
  rows.forEach((r, i) => {
    const y = ty + 0.55 + i * rowH;
    s.addShape(pres.shapes.RECTANGLE, {
      x: tx, y, w: tw, h: rowH,
      fill: { color: i % 2 ? C.paper : C.white },
      line: { color: C.line, width: 0.5 },
    });
    const widths = [0.4, 2.6, 0.6, 1.5, 3.6];
    const cells = [r.n, r.t, `T${r.tier}`, r.time, r.drv];
    cells.forEach((c, k) => {
      const x = tx + widths.slice(0, k).reduce((a, b) => a + b, 0);
      const isTime = k === 3;
      const isApp = k === 1;
      s.addText(c, {
        x: x + 0.1, y: y + 0.07, w: widths[k] - 0.2, h: rowH - 0.14,
        fontSize: isTime ? 12 : 11, fontFace: isTime ? F.head : F.body,
        color: isTime ? (r.time.includes('day') ? C.coral : C.navyMid)
                      : (isApp ? C.body : C.muted),
        bold: isApp || isTime, margin: 0,
      });
    });
  });

  // Right column — engagement scenarios
  const px = 9.5, pw = W - 9.5 - 0.5;
  s.addShape(pres.shapes.RECTANGLE, {
    x: px, y: 1.3, w: pw, h: 5.4,
    fill: { color: C.navyMid }, line: { type: 'none' },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: px, y: 1.3, w: pw, h: 0.1, fill: { color: C.gold }, line: { type: 'none' },
  });
  s.addText('ENGAGEMENT-LEVEL TOTALS', {
    x: px + 0.3, y: 1.5, w: pw - 0.6, h: 0.3,
    fontSize: 10, fontFace: F.body, color: C.gold,
    bold: true, charSpacing: 4, margin: 0,
  });

  const scenarios = [
    { label: 'Day-1 demo (#1 only)',              time: '90 min',    desc: 'A working app against the customer\'s lab subaccount inside 90 minutes.' },
    { label: 'Tier 1 pilot (#1, #2, #3)',          time: '3 hr',      desc: 'The IP-centerpiece scorecard live; ready for the first workshop.' },
    { label: 'First-wave engagement (#1–#5, #9)',  time: '~1 day',    desc: 'The first five apps + cert expiry. Sells as a 4-week engagement.' },
    { label: 'Full BTP-native (#1–#10)',           time: '2 days + seed', desc: 'Everything except Clean Core. Add 6 hours seeding contract anchors and org hierarchy.' },
    { label: 'Full arsenal incl. #11',             time: '3–4 days',  desc: 'Add 1 day for ABAP scanner transport + Cloud Connector wiring.' },
  ];
  scenarios.forEach((sc, i) => {
    const y = 1.95 + i * 1.0;
    s.addText(sc.label, {
      x: px + 0.3, y, w: pw - 0.6, h: 0.32,
      fontSize: 12, fontFace: F.head, color: C.white, bold: true, margin: 0,
    });
    s.addText(sc.time, {
      x: px + 0.3, y: y + 0.32, w: pw - 0.6, h: 0.3,
      fontSize: 16, fontFace: F.head,
      color: sc.time.includes('day') || sc.time.includes('week') ? C.coral : C.gold,
      bold: true, margin: 0,
    });
    s.addText(sc.desc, {
      x: px + 0.3, y: y + 0.6, w: pw - 0.6, h: 0.42,
      fontSize: 10, fontFace: F.body, color: C.ice, margin: 0,
    });
  });

  addFooter(s, num, total);
});

// ╭─ Why us ──────────────────────────────────────────────────────────────────╮
slides.push((num, total) => {
  const s = lightSlide('Three things nobody else in the BTP advisory space ships', 'DIFFERENTIATION');

  const diffs = [
    {
      stat: '11 apps', label: 'all shipping today',
      title: 'Operational tooling, not narrative deliverables.',
      body: 'Every other BTP advisory practice walks out with a Word doc. We walk out with an MTA archive in production.',
    },
    {
      stat: '1 MTA', label: 'one productized arsenal',
      title: 'A skeleton, not a reinvented wheel.',
      body: 'Same MTA shape, same auth, same shared srv/lib across the 10 BTP-native apps. Every engagement compounds onto the next.',
    },
    {
      stat: '< 2 hr', label: 'per-app per-client deploy',
      title: 'A delivery team that scales with the practice.',
      body: 'A delivery colleague who has not built the app can deploy it cold in under 2 hours from the runbook. Not bound to one Architect.',
    },
  ];
  const cw = (W - 1.0 - 2 * 0.3) / 3;
  diffs.forEach((d, i) => {
    const x = 0.5 + i * (cw + 0.3);
    const y = 1.6;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cw, h: 4.6,
      fill: { color: C.navyMid }, line: { type: 'none' },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cw, h: 0.1, fill: { color: C.coral }, line: { type: 'none' },
    });
    s.addText(d.stat, {
      x: x + 0.3, y: y + 0.4, w: cw - 0.6, h: 1.1,
      fontSize: 56, fontFace: F.head, color: C.gold, bold: true, margin: 0,
    });
    s.addText(d.label, {
      x: x + 0.3, y: y + 1.5, w: cw - 0.6, h: 0.4,
      fontSize: 11, fontFace: F.body, color: C.ice, charSpacing: 3, bold: true, margin: 0,
    });
    s.addText(d.title, {
      x: x + 0.3, y: y + 2.1, w: cw - 0.6, h: 1.0,
      fontSize: 18, fontFace: F.head, color: C.white, bold: true, margin: 0,
    });
    s.addText(d.body, {
      x: x + 0.3, y: y + 3.2, w: cw - 0.6, h: 1.3,
      fontSize: 12, fontFace: F.body, color: C.ice, margin: 0,
    });
  });

  addFooter(s, num, total);
});

// ╭─ CTA closing ─────────────────────────────────────────────────────────────╮
slides.push((num, total) => {
  const s = pres.addSlide();
  s.background = { color: C.navy };

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: H - 0.4, w: W, h: 0.4,
    fill: { color: C.coral }, line: { type: 'none' },
  });

  s.addText('NEXT STEPS', {
    x: 0.7, y: 1.3, w: W - 1.4, h: 0.4,
    fontSize: 13, fontFace: F.body, color: C.coral, bold: true, charSpacing: 6, margin: 0,
  });
  s.addText('Pick one subaccount.\nSee what we find in 90 minutes.', {
    x: 0.7, y: 1.8, w: W - 1.4, h: 2.2,
    fontSize: 48, fontFace: F.head, color: C.white, bold: true, lineSpacingMultiple: 1.0, margin: 0,
  });

  // Three offers
  const offers = [
    { t: 'Discovery workshop', d: '90-minute remote session against one of your customer\'s lab subaccounts. We arrive with the apps already running. You see findings live.' },
    { t: '4-week pilot', d: 'A scoped pilot engagement: apps #1, #2, #3 deployed to the customer\'s tenant, before/after snapshot, hand-over runbook.' },
    { t: 'Practice partnership', d: 'White-label the arsenal under your brand. We co-own the roadmap. Customers see one consultant, you keep the relationship.' },
  ];
  const cw = (W - 1.4 - 2 * 0.3) / 3;
  offers.forEach((o, i) => {
    const x = 0.7 + i * (cw + 0.3);
    const y = 4.6;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cw, h: 1.9,
      fill: { color: C.navyMid }, line: { color: C.navyLight, width: 1 },
    });
    s.addText(o.t, {
      x: x + 0.25, y: y + 0.18, w: cw - 0.5, h: 0.4,
      fontSize: 14, fontFace: F.head, color: C.gold, bold: true, margin: 0,
    });
    s.addText(o.d, {
      x: x + 0.25, y: y + 0.6, w: cw - 0.5, h: 1.2,
      fontSize: 11, fontFace: F.body, color: C.ice, margin: 0,
    });
  });
});

// ─── Build ───────────────────────────────────────────────────────────────────
const total = slides.length;
slides.forEach((build, i) => build(i + 1, total));

pres.writeFile({ fileName: path.join(__dirname, 'BTP-Advisory-Pitch.pptx') })
    .then((f) => console.log('✓ wrote', f, '—', total, 'slides'));
