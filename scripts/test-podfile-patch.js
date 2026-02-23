#!/usr/bin/env node
/**
 * Quick unit test for the Podfile patch logic.
 * Run: node scripts/test-podfile-patch.js
 */

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';

// Inline the same logic as patch-ios-podfile.js / plugin
const EXTENSION_BLOCK = `
  target '${EXTENSION_NAME}' do
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
  let mainTargetLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^target\s+['"]([^'"]+)['"]\s+do\b/);
    if (m && m[1] !== extensionName) { mainTargetLine = i; break; }
  }
  if (mainTargetLine === -1) return podfile;
  let closingLine = -1;
  for (let i = mainTargetLine + 1; i < lines.length; i++) {
    if (/^end(\s*(#.*)?)$/.test(lines[i])) { closingLine = i; break; }
  }
  if (closingLine === -1) return podfile;
  const block = EXTENSION_BLOCK.replace(/GrabDocsBroadcastUpload/g, extensionName);
  const before = lines.slice(0, closingLine).join(lineEnding);
  const after  = lines.slice(closingLine).join(lineEnding);
  return before + block + lineEnding + after;
}

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
  console.log('PASS:', msg);
}

// --- Test 1: post_install INSIDE target (older Expo template) ---
const PODFILE_POST_INSTALL_INSIDE = `\
require 'something'

def ccache_enabled?(props)
  props['apple.ccacheEnabled'] == 'true'
end

platform :ios, '15.1'

target 'GrabDocs' do
  use_expo_modules!

  if ENV['EXPO_USE_COMMUNITY_AUTOLINKING'] == '1'
    config_command = ['node', '-e', "require('cli')"]
  else
    config_command = ['node', '--eval', 'require("autolinking")']
  end

  config = use_native_modules!(config_command)

  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true,
  )

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )
  end
end
`;

const result1 = insertExtensionBeforeMainTargetEnd(PODFILE_POST_INSTALL_INSIDE, EXTENSION_NAME);
assert(result1.includes("  target 'GrabDocsBroadcastUpload' do"), 'Test1: extension target present');
assert(result1.includes('inherit! :search_paths'), 'Test1: inherit! present');
// Must appear BEFORE the final `end` (main target's end)
const extIdx1 = result1.indexOf("  target 'GrabDocsBroadcastUpload' do");
const lastEndIdx1 = result1.lastIndexOf('\nend');
assert(extIdx1 < lastEndIdx1, 'Test1: extension is before main target closing end');
// Must NOT be inside the post_install block
const postInstallIdx1 = result1.indexOf('  post_install do');
assert(extIdx1 > postInstallIdx1, 'Test1: extension comes after post_install block start');
console.log('\nTest 1 output (last 20 lines):');
console.log(result1.split('\n').slice(-20).join('\n'));

// --- Test 2: post_install OUTSIDE target (newer RN template) ---
const PODFILE_POST_INSTALL_OUTSIDE = `\
require 'something'

platform :ios, '15.1'

target 'GrabDocs' do
  use_expo_modules!

  if ENV['SOME_FLAG'] == '1'
    config_command = ['node']
  else
    config_command = ['node', '--eval']
  end

  use_react_native!(
    :path => '../node_modules/react-native',
  )
end

post_install do |installer|
  react_native_post_install(installer)
end
`;

const result2 = insertExtensionBeforeMainTargetEnd(PODFILE_POST_INSTALL_OUTSIDE, EXTENSION_NAME);
assert(result2.includes("  target 'GrabDocsBroadcastUpload' do"), 'Test2: extension target present');
assert(result2.includes('inherit! :search_paths'), 'Test2: inherit! present');
// Extension must be before `end` of target (not after, not inside post_install)
const extIdx2 = result2.indexOf("  target 'GrabDocsBroadcastUpload' do");
const postInstallLineIdx2 = result2.indexOf('\npost_install do');
assert(extIdx2 < postInstallLineIdx2, 'Test2: extension is BEFORE post_install block (outside target)');
console.log('\nTest 2 output (last 20 lines):');
console.log(result2.split('\n').slice(-20).join('\n'));

// --- Test 3: idempotent (already patched) ---
const result3 = insertExtensionBeforeMainTargetEnd(result1, EXTENSION_NAME);
assert(result3 === result1, 'Test3: idempotent - no double-insertion');

console.log('\n✅ All tests passed.');
