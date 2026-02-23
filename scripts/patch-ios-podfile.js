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

function findMainTargetClosingEndIndex(podfile) {
  const lines = podfile.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*end\s*$/.test(lines[i])) {
      const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
      return lines.slice(0, i).join(lineEnding).length;
    }
  }
  return -1;
}

function insertExtensionBeforeMainTargetEnd(podfile, extensionName) {
  if (podfile.includes("target '" + extensionName + "' do") && podfile.includes('inherit! :search_paths')) {
    return podfile;
  }
  const block = EXTENSION_BLOCK.replace(/GrabDocsBroadcastUpload/g, extensionName);
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  let insertAt = findMainTargetClosingEndIndex(podfile);
  if (insertAt === -1) {
    insertAt = podfile.lastIndexOf('\nend');
    if (insertAt === -1) return podfile;
  }
  return podfile.slice(0, insertAt) + block + lineEnding + podfile.slice(insertAt);
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
