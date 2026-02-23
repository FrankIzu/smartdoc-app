#!/usr/bin/env node
/**
 * One-time patch for ios/Podfile: nest GrabDocsBroadcastUpload inside the main app target
 * so CocoaPods finds a host target. Run from repo root when you see:
 *   "[!] Unable to find host target(s) for GrabDocsBroadcastUpload"
 *
 * Usage: node scripts/patch-ios-podfile.js
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';
const PODFILE_PATH = path.join(__dirname, '..', 'ios', 'Podfile');

function findMainTargetInPodfile(podfile, extensionName) {
  const targetRegex = /target\s+['"]([^'"]+)['"]\s+do\b/g;
  let m;
  while ((m = targetRegex.exec(podfile)) !== null) {
    if (m[1] !== extensionName) return m[1];
  }
  return null;
}

function applyPodfilePatch(podfile, extensionName, mainTargetName) {
  const escaped = mainTargetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mainTargetRegex = new RegExp(
    "target\\s+['\"]" + escaped + "['\"]\\s+do\\b"
  );
  const replacement = `target '${mainTargetName}' do

  target '${extensionName}' do
    inherit! :search_paths
    use_modular_headers!
    pod 'HMSBroadcastExtensionSDK'
  end`;
  return podfile.replace(mainTargetRegex, replacement);
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

  let contents = fs.readFileSync(PODFILE_PATH, 'utf8');

  if (
    contents.includes("target '" + EXTENSION_NAME + "' do") &&
    contents.includes('inherit! :search_paths')
  ) {
    console.log('Podfile already has nested GrabDocsBroadcastUpload target.');
    process.exit(0);
  }

  const mainTarget = findMainTargetInPodfile(contents, EXTENSION_NAME);
  if (!mainTarget) {
    console.error('Could not find main app target in Podfile.');
    process.exit(1);
  }

  const newContents = applyPodfilePatch(contents, EXTENSION_NAME, mainTarget);
  if (newContents === contents) {
    console.error('Patch did not change Podfile (target name not found?).');
    process.exit(1);
  }

  fs.writeFileSync(PODFILE_PATH, newContents);
  console.log('Patched ios/Podfile: nested GrabDocsBroadcastUpload under target "' + mainTarget + '".');
  console.log('Run: cd ios && pod install');
}

main();
