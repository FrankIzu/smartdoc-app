#!/usr/bin/env node
/**
 * Patch ios/Podfile: nest GrabDocsBroadcastUpload inside the main app target
 * so CocoaPods finds a host target. Run from repo root when you see:
 *   "[!] Unable to find host target(s) for GrabDocsBroadcastUpload"
 *
 * Uses insert-before-closing-end (same as the Expo plugin) so it works
 * regardless of main target name. Safe to run after prebuild.
 *
 * Usage: node scripts/patch-ios-podfile.js
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';
const PODFILE_PATH = path.join(__dirname, '..', 'ios', 'Podfile');

const EXTENSION_BLOCK = `
  target 'GrabDocsBroadcastUpload' do
    inherit! :search_paths
    use_modular_headers!
    pod 'HMSBroadcastExtensionSDK'
  end`;

function insertExtensionBeforeMainTargetEnd(podfile, extensionName) {
  if (podfile.includes("target '" + extensionName + "' do") && podfile.includes('inherit! :search_paths')) {
    return podfile;
  }

  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);

  // Main app target opens at column 0: `target 'Name' do`
  let mainTargetLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^target\s+['"]([^'"]+)['"]\s+do\b/);
    if (m && m[1] !== extensionName) {
      mainTargetLine = i;
      break;
    }
  }
  if (mainTargetLine === -1) return podfile;

  // First unindented `end` after the target opener = the target's closing `end`.
  let closingLine = -1;
  for (let i = mainTargetLine + 1; i < lines.length; i++) {
    if (/^end(\s*(#.*)?)$/.test(lines[i])) {
      closingLine = i;
      break;
    }
  }
  if (closingLine === -1) return podfile;

  const block = EXTENSION_BLOCK.replace(/GrabDocsBroadcastUpload/g, extensionName);
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
    console.log('Podfile already has nested GrabDocsBroadcastUpload target.');
    process.exit(0);
  }

  fs.writeFileSync(PODFILE_PATH, newContents);
  console.log('Patched ios/Podfile: nested GrabDocsBroadcastUpload inside main app target.');
  console.log('Run: cd ios && pod install');
}

main();
