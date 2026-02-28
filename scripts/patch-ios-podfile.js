#!/usr/bin/env node
/**
 * Patch ios/Podfile for 100ms broadcast extension: main target only (no extension target).
 * - Removes any "target 'GrabDocsBroadcastUpload' do ... end" block.
 * - Adds pod 'HMSBroadcastExtensionSDK' to the main app target (extension links it in Xcode).
 * - Ensures ENV['RCT_NEW_ARCH_ENABLED'] ||= '0'.
 *
 * Run from repo root when manually patching after prebuild. CI uses the Expo plugin instead.
 *
 * Usage: node scripts/patch-ios-podfile.js
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';
const MAIN_APP_TARGET = 'GrabDocs';
const HMS_POD = 'HMSBroadcastExtensionSDK';
const PODFILE_PATH = path.join(__dirname, '..', 'ios', 'Podfile');

/**
 * Remove any "target 'GrabDocsBroadcastUpload' do ... end" block (nested or top-level).
 */
function removeExtensionBlock(podfile, extensionName) {
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);
  const extRe = new RegExp("^\\s*target\\s+['\"]" + extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s+do\\s*$");
  let start = -1;
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    if (extRe.test(lines[i])) {
      start = i;
      indent = (lines[i].match(/^(\s*)/) || ['', ''])[1].length;
      break;
    }
  }
  if (start === -1) return podfile;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    const em = lines[i].match(/^(\s*)end(\s*(#.*)?)$/);
    if (em && em[1].length <= indent) {
      end = i;
      break;
    }
  }
  if (end === -1) return podfile;
  const before = lines.slice(0, start).join(lineEnding);
  const after = lines.slice(end + 1).join(lineEnding);
  return before + (before.endsWith(lineEnding) ? '' : lineEnding) + after;
}

/**
 * Add pod 'HMSBroadcastExtensionSDK' to main target before use_react_native!(.
 */
function addHmsPodToMainTarget(podfile) {
  if (podfile.includes("pod '" + HMS_POD + "'")) return podfile;
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);
  const mainRe = new RegExp("^\\s*target\\s+['\"]" + MAIN_APP_TARGET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s+do\\s*$");
  let mainLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (mainRe.test(lines[i])) {
      mainLine = i;
      break;
    }
  }
  if (mainLine === -1) return podfile;
  const useRnRe = /use_react_native!\s*\(/;
  let insertAt = -1;
  for (let i = mainLine + 1; i < lines.length; i++) {
    if (useRnRe.test(lines[i])) {
      insertAt = i;
      break;
    }
  }
  if (insertAt === -1) return podfile;
  const ind = (lines[insertAt].match(/^(\s*)/) || ['', '  '])[1];
  const podLine = ind + "  pod '" + HMS_POD + "'  # for broadcast extension (linked by Xcode)";
  const before = lines.slice(0, insertAt).join(lineEnding);
  const after = lines.slice(insertAt).join(lineEnding);
  return before + lineEnding + podLine + lineEnding + after;
}

function ensureNewArchDisabled(podfile) {
  if (podfile.includes("RCT_NEW_ARCH_ENABLED")) return podfile;
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  return "ENV['RCT_NEW_ARCH_ENABLED'] ||= '0'" + lineEnding + podfile;
}

function main() {
  const iosDir = path.join(__dirname, '..', 'ios');
  if (!fs.existsSync(PODFILE_PATH)) {
    if (!fs.existsSync(iosDir)) {
      console.log('[patch-ios-podfile] Skipping: ios/ not found (Android build or prebuild not run).');
    } else {
      console.error('ios/Podfile not found. Run from repo root after prebuild.');
      process.exit(1);
    }
    process.exit(0);
  }

  let contents = fs.readFileSync(PODFILE_PATH, 'utf8');
  const orig = contents;

  contents = removeExtensionBlock(contents, EXTENSION_NAME);
  contents = ensureNewArchDisabled(contents);
  contents = addHmsPodToMainTarget(contents);

  if (contents === orig) {
    console.log('✅ Podfile already patched (main target only + ' + HMS_POD + ', ENV set).');
    process.exit(0);
  }

  fs.writeFileSync(PODFILE_PATH, contents);
  console.log('✅ Patched ios/Podfile: removed extension target, added pod to main target, ENV RCT_NEW_ARCH_ENABLED=0.');
}

main();
