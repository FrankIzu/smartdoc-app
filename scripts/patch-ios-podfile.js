#!/usr/bin/env node
/**
 * Patch ios/Podfile: nest GrabDocsBroadcastUpload inside the main app target
 * so CocoaPods finds a host target. Run from repo root when you see:
 *   "[!] Unable to find host target(s) for GrabDocsBroadcastUpload"
 *
 * Uses indentation-aware insert (same logic as the Expo plugin).
 *
 * Usage: node scripts/patch-ios-podfile.js
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';
const PODFILE_PATH = path.join(__dirname, '..', 'ios', 'Podfile');

function isExtensionProperlyNested(podfile, extensionName) {
  return new RegExp('\\n\\s+target\\s+[\'"]' + extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]\\s+do\\b').test(podfile);
}

function removeTopLevelExtensionBlock(podfile, extensionName) {
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);
  let extLine = -1;
  let extIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)target\s+['"]([^'"]+)['"]\s+do\b/);
    if (m && m[2] === extensionName) { extLine = i; extIndent = m[1].length; break; }
  }
  if (extLine === -1) return podfile;
  let endLine = -1;
  for (let i = extLine + 1; i < lines.length; i++) {
    const em = lines[i].match(/^(\s*)end(\s*(#.*)?)$/);
    if (em && em[1].length <= extIndent) { endLine = i; break; }
  }
  if (endLine === -1) return podfile;
  const before = lines.slice(0, extLine).join(lineEnding);
  const after  = lines.slice(endLine + 1).join(lineEnding);
  return before + (before.endsWith(lineEnding) ? '' : lineEnding) + after;
}

function insertExtensionBeforeMainTargetEnd(podfile, extensionName) {
  if (podfile.includes("target '" + extensionName + "' do") && podfile.includes('inherit! :search_paths')) {
    if (isExtensionProperlyNested(podfile, extensionName)) return podfile;
    podfile = removeTopLevelExtensionBlock(podfile, extensionName);
  }

  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);

  let mainTargetLine = -1;
  let targetIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)target\s+['"]([^'"]+)['"]\s+do\b/);
    if (m && m[2] !== extensionName) {
      mainTargetLine = i;
      targetIndent = m[1].length;
      break;
    }
  }
  if (mainTargetLine === -1) return podfile;

  let closingLine = -1;
  for (let i = mainTargetLine + 1; i < lines.length; i++) {
    const em = lines[i].match(/^(\s*)end(\s*(#.*)?)$/);
    if (em && em[1].length <= targetIndent) {
      closingLine = i;
      break;
    }
  }
  if (closingLine === -1) return podfile;

  const ind  = ' '.repeat(targetIndent + 2);
  const ind2 = ' '.repeat(targetIndent + 4);
  const block = [
    '',
    ind  + "target '" + extensionName + "' do",
    ind2 + 'inherit! :search_paths',
    ind2 + 'use_modular_headers!',
    ind2 + "pod 'HMSBroadcastExtensionSDK'",
    ind  + 'end',
  ].join(lineEnding);

  const before = lines.slice(0, closingLine).join(lineEnding);
  const after  = lines.slice(closingLine).join(lineEnding);
  return before + block + lineEnding + after;
}

function main() {
  const iosDir = path.join(__dirname, '..', 'ios');
  if (!fs.existsSync(PODFILE_PATH)) {
    console.error('ios/Podfile not found.');
    if (!fs.existsSync(iosDir)) {
      console.error('The ios/ folder is missing. Expo does not generate it on Windows.');
      console.error('  - Generate it on macOS/Linux: npx expo prebuild --platform ios --no-install');
      console.error('  - Or run the "Prebuild iOS" GitHub workflow to generate and commit ios/.');
    } else {
      console.error('Run from repo root after prebuild.');
    }
    process.exit(1);
  }

  const contents = fs.readFileSync(PODFILE_PATH, 'utf8');
  const newContents = insertExtensionBeforeMainTargetEnd(contents, EXTENSION_NAME);

  if (newContents === contents) {
    if (contents.includes("target '" + EXTENSION_NAME + "' do") && contents.includes('inherit! :search_paths') && isExtensionProperlyNested(contents, EXTENSION_NAME)) {
      console.log('Podfile already has nested GrabDocsBroadcastUpload target.');
      process.exit(0);
    }
    console.error('❌ Failed to patch Podfile — could not find main app target.');
    console.error('Full Podfile contents:');
    console.error(contents);
    process.exit(1);
  }

  fs.writeFileSync(PODFILE_PATH, newContents);
  console.log('✅ Patched ios/Podfile: nested GrabDocsBroadcastUpload inside main app target.');
  console.log('Run: cd ios && pod install');
}

main();
