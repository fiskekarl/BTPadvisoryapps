'use strict';
// Render every _pitch-deck/mockups/*.html → _pitch-deck/screenshots/*.png at 1620×1020.
// Usage: node render-screenshots.js   (chromium auto-detected via $CHROMIUM or playwright path)

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const MOCKUPS = path.join(__dirname, 'mockups');
const SHOTS   = path.join(__dirname, 'screenshots');

const CHROME = process.env.CHROMIUM
  || (() => {
    for (const p of [
      '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    ]) if (fs.existsSync(p)) return p;
    throw new Error('Set $CHROMIUM to a chromium / chrome binary');
  })();

const MAP = {
  'app01-lifecycle.html':    'app01-lifecycle.png',
  'app02-destinations.html': 'app02-destinations.png',
  'app03-scorecard.html':    'app03-scorecard.png',
  'app04-identity.html':     'app04-identity.png',
  'app05-rolemap.html':      'app05-rolemap.png',
  'app06-auditlog.html':     'app06-auditlog.png',
  'app07-entitlement.html':  'app07-entitlement.png',
  'app08-aigovernance.html': 'app08-aigovernance.png',
  'app09-certs.html':        'app09-certs.png',
  'app10-costalloc.html':    'app10-costalloc.png',
  'app11-cleancore.html':    'app11-cleancore.png',
};

for (const [src, out] of Object.entries(MAP)) {
  const input  = `file://${path.join(MOCKUPS, src)}`;
  const output = path.join(SHOTS, out);
  process.stdout.write(`  ${src} → ${out} ... `);
  execFileSync(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--window-size=1620,1020`,
    `--screenshot=${output}`,
    input,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  process.stdout.write('done\n');
}
console.log(`\nAll ${Object.keys(MAP).length} screenshots rendered to ${SHOTS}`);
