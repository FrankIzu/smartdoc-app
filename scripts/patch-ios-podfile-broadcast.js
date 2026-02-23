#!/usr/bin/env node
/**
 * Patches ios/Podfile to nest GrabDocsBroadcastUpload inside the main app target.
 * CocoaPods requires app extensions to have a host target; nesting fixes
 * "Unable to find host target(s) for GrabDocsBroadcastUpload".
 *
 * Run after prebuild: node scripts/patch-ios-podfile-broadcast.js
 * Idempotent: safe to run multiple times.
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';
const PODFILE = path.join(__dirname, '..', 'ios', 'Podfile');
const APP_JSON = path.join(__dirname, '..', 'app.json');

function getMainTarget() {
  try {
    const appJson = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
    const name = appJson?.expo?.name;
    if (name && typeof name === 'string') return name;
  } catch (_) {}
  return 'GrabDocs';
}

const MAIN_TARGET = getMainTarget();

function patch() {
  if (!fs.existsSync(PODFILE)) {
    console.warn('ios/Podfile not found, skipping patch');
    process.exit(0);
  }

  let contents = fs.readFileSync(PODFILE, 'utf8');
  const NL = /\r\n|\r|\n/;
  const newline = contents.match(NL)?.[0] || '\n';

  const nestedBlock = `${newline}  target '${EXTENSION_NAME}' do${newline}    inherit! :search_paths${newline}    use_modular_headers!${newline}    pod 'HMSBroadcastExtensionSDK'${newline}  end${newline}`;

  if (contents.includes("target '" + EXTENSION_NAME + "' do") && contents.includes('inherit! :search_paths')) {
    console.log('Podfile already has nested broadcast extension target');
    process.exit(0);
  }

  // Remove standalone extension target if present
  const standalonePattern = new RegExp(
    "(?:\\r?\\n)?target\\s+'" + EXTENSION_NAME.replace(/'/g, "\\\\'") + "'\\s+do\\s*(?:\\r?\\n)\\s*use_modular_headers![\\s\\S]*?(?:\\r?\\n)end\\s*(?:\\r?\\n)?",
    'g'
  );
  contents = contents.replace(standalonePattern, '');

  const escapedMain = MAIN_TARGET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mainTargetRegex = new RegExp(
    "(target\\s+['\"]" + escapedMain + "['\"]\\s+do\\s*(?:\\r?\\n))",
    'm'
  );
  const mainTargetMatch = contents.match(mainTargetRegex);
  if (mainTargetMatch) {
    contents = contents.replace(mainTargetMatch[1], mainTargetMatch[1] + nestedBlock);
    console.log('Patched Podfile: nested GrabDocsBroadcastUpload inside main target');
  } else {
    const firstTargetMatch = contents.match(/(target\s+['"][^'"]+['"]\s+do\s*(?:\r?\n))/m);
    if (firstTargetMatch) {
      contents = contents.replace(firstTargetMatch[1], firstTargetMatch[1] + nestedBlock);
      console.log('Patched Podfile: nested GrabDocsBroadcastUpload inside first target');
    } else {
      console.error('Could not find main target in Podfile');
      process.exit(1);
    }
  }

  fs.writeFileSync(PODFILE, contents);
}

patch();
