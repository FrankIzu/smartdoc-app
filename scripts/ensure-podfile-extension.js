#!/usr/bin/env node
/**
 * Standalone script: ensures GrabDocsBroadcastUpload is nested inside
 * `target 'GrabDocs' do` in ios/Podfile. Run after `expo prebuild`.
 *
 * Works independently of the Expo config plugin Podfile mods — acts as
 * a guaranteed safety net for EAS cloud and local builds.
 *
 * Usage: node scripts/ensure-podfile-extension.js
 */

const fs = require('fs');
const path = require('path');

const PODFILE = path.join(process.cwd(), 'ios', 'Podfile');
const MAIN_TARGET = 'GrabDocs';
const EXTENSION_NAME = 'GrabDocsBroadcastUpload';
const HMS_POD = 'HMSBroadcastExtensionSDK';

if (!fs.existsSync(PODFILE)) {
  console.log('[ensure-podfile-extension] ios/Podfile not found — skipping');
  process.exit(0);
}

let content = fs.readFileSync(PODFILE, 'utf8');
const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

// ── Remove any existing extension block (nested or standalone) ──────────────
const extBlockRe = new RegExp(
  '\\n?[ \\t]*# @generated ios-hms-screenshare extension-target\\n' +
  '[ \\t]*target \'' + EXTENSION_NAME + '\' do[\\s\\S]*?\\n[ \\t]*end\\n?',
  'g'
);
content = content.replace(extBlockRe, '\n');
// Also remove any bare extension block without marker
const bareExtRe = new RegExp(
  '\\n?[ \\t]*target \'' + EXTENSION_NAME + '\' do[\\s\\S]*?\\n[ \\t]*end\\n?',
  'g'
);
content = content.replace(bareExtRe, '\n');

// ── Find target 'GrabDocs' do or target "GrabDocs" do ────────────────────────
const lines = content.split(/\r?\n/);
const mainTargetRe = new RegExp('^(\\s*)target\\s+[\'"]' + MAIN_TARGET + '[\'"]\\s+do\\s*$');
let mainLine = -1;
let mainIndent = '';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(mainTargetRe);
  if (m) { mainLine = i; mainIndent = m[1]; break; }
}

if (mainLine === -1) {
  console.error('[ensure-podfile-extension] ❌ Could not find target \'' + MAIN_TARGET + '\' in Podfile!');
  console.error('Looked for: target \'' + MAIN_TARGET + '\' do or target "' + MAIN_TARGET + '" do');
  console.error('First 50 lines of Podfile:');
  console.error(lines.slice(0, 50).join('\n'));
  process.exit(1);
}

// ── Find closing `end` at same indentation level ─────────────────────────────
const mainIndentLen = mainIndent.length;
let closingLine = -1;
for (let i = mainLine + 1; i < lines.length; i++) {
  const m = lines[i].match(/^(\s*)end\s*$/);
  if (m && m[1].length === mainIndentLen) {
    closingLine = i;
    break;
  }
}

if (closingLine === -1) {
  console.error('[ensure-podfile-extension] ❌ Could not find closing end for target \'' + MAIN_TARGET + '\'!');
  process.exit(1);
}

// ── Build the extension block ─────────────────────────────────────────────────
const ii = mainIndent + '  ';  // inner indent (2 more than target line)
const ei = mainIndent + '    '; // extension inner indent
const block = [
  '',
  ii + '# @generated ios-hms-screenshare extension-target',
  ii + 'target \'' + EXTENSION_NAME + '\' do',
  ei + 'platform :ios, \'16.0\'',
  ei + 'inherit! :search_paths',
  ei + 'pod \'' + HMS_POD + '\'',
  ii + 'end',
].join(lineEnding);

const before = lines.slice(0, closingLine).join(lineEnding);
const after  = lines.slice(closingLine).join(lineEnding);
const result = before + block + lineEnding + after;

fs.writeFileSync(PODFILE, result);

// ── Verify and print the relevant section ─────────────────────────────────────
const written = fs.readFileSync(PODFILE, 'utf8').split(/\r?\n/);
const showFrom = Math.max(0, mainLine - 1);
const showTo   = Math.min(written.length, closingLine + 3);
console.log('[ensure-podfile-extension] ✅ Extension block inserted. Podfile lines ' + (showFrom + 1) + '-' + (showTo + 1) + ':');
console.log(written.slice(showFrom, showTo).join('\n'));
