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

  // Match root Podfile platform so extension has same iOS deployment target (required for static RN + CocoaPods host resolution).
  const platformMatch = podfile.match(/platform\s+:\s*ios\s*,\s*['"]([\d.]+)['"]/);
  const iosDeploymentTarget = platformMatch ? platformMatch[1] : '16.0';

  const ind  = ' '.repeat(targetIndent + 2);
  const ind2 = ' '.repeat(targetIndent + 4);
  const block = [
    '',
    ind  + "target '" + extensionName + "' do",
    ind2 + "platform :ios, '" + iosDeploymentTarget + "'",
    ind2 + 'inherit! :search_paths',
    ind2 + 'use_modular_headers!',
    ind2 + "pod 'HMSBroadcastExtensionSDK'",
    ind  + 'end',
  ].join(lineEnding);

  const before = lines.slice(0, closingLine).join(lineEnding);
  const after  = lines.slice(closingLine).join(lineEnding);
  return before + block + lineEnding + after;
}

/**
 * Prepend ENV['RCT_NEW_ARCH_ENABLED'] ||= '0' if not already set (legacy arch for Reanimated 3 + old arch).
 */
function ensureNewArchDisabled(podfile) {
  if (podfile.includes("RCT_NEW_ARCH_ENABLED")) return podfile;
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  return "ENV['RCT_NEW_ARCH_ENABLED'] ||= '0'" + lineEnding + podfile;
}

/**
 * Inject APPLICATION_EXTENSION_API_ONLY = YES for the extension into the existing post_install block.
 */
function injectPostInstallExtensionApiOnly(podfile, extensionName) {
  if (podfile.includes('APPLICATION_EXTENSION_API_ONLY') && podfile.includes(extensionName)) return podfile;
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);
  const postInstallRe = /post_install\s+do\s+\|installer\|/;
  let piLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (postInstallRe.test(lines[i])) { piLine = i; break; }
  }
  if (piLine === -1) return podfile;
  let depth = 1, closingLine = -1;
  for (let i = piLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*end\s*$/.test(line)) { if (--depth === 0) { closingLine = i; break; } }
    else if (/\bdo\s*$/.test(line)) depth++;
  }
  if (closingLine === -1) return podfile;
  const indent = (lines[closingLine].match(/^(\s*)/) || ['', ''])[1] || '  ';
  const block = [
    indent + '# patch-ios-podfile: app extension API only',
    indent + "installer.pods_project.targets.each do |t|",
    indent + "  if t.name == '" + extensionName + "'",
    indent + "    t.build_configurations.each do |c|",
    indent + "      c.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'",
    indent + "    end",
    indent + "  end",
    indent + "end",
  ].join(lineEnding);
  const before = lines.slice(0, closingLine).join(lineEnding);
  const after  = lines.slice(closingLine).join(lineEnding);
  return before + lineEnding + block + lineEnding + after;
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

  // Step 1: ensure extension is nested
  const nested = insertExtensionBeforeMainTargetEnd(contents, EXTENSION_NAME);
  if (nested === contents && !isExtensionProperlyNested(contents, EXTENSION_NAME)) {
    console.error('❌ Failed to patch Podfile — could not find main app target.');
    console.error('Full Podfile contents:');
    console.error(contents);
    process.exit(1);
  }
  const didNest = nested !== contents;
  contents = nested;

  // Step 2: ensure ENV['RCT_NEW_ARCH_ENABLED'] ||= '0'
  const afterEnv = ensureNewArchDisabled(contents);
  const didEnv = afterEnv !== contents;
  contents = afterEnv;

  // Step 3: inject APPLICATION_EXTENSION_API_ONLY in post_install
  const afterPostInstall = injectPostInstallExtensionApiOnly(contents, EXTENSION_NAME);
  const didPostInstall = afterPostInstall !== contents;
  contents = afterPostInstall;

  if (!didNest && !didEnv && !didPostInstall) {
    console.log('✅ Podfile already fully patched (extension nested, ENV set, post_install injected).');
    process.exit(0);
  }

  fs.writeFileSync(PODFILE_PATH, contents);
  const changes = [
    didNest       && 'nested extension inside main target',
    didEnv        && 'added RCT_NEW_ARCH_ENABLED=0',
    didPostInstall && 'injected APPLICATION_EXTENSION_API_ONLY',
  ].filter(Boolean).join(', ');
  console.log('✅ Patched ios/Podfile: ' + changes + '.');
}

main();
