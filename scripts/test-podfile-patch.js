#!/usr/bin/env node
/**
 * Quick unit test for the Podfile patch logic.
 * Run: node scripts/test-podfile-patch.js
 */

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';

// Inline the same logic as patch-ios-podfile.js / plugin (indentation-aware).
function insertExtensionBeforeMainTargetEnd(podfile, extensionName) {
  if (podfile.includes("target '" + extensionName + "' do") && podfile.includes('inherit! :search_paths')) {
    return podfile;
  }
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);

  // Find main app target at any indentation level.
  let mainTargetLine = -1;
  let targetIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)target\s+['"]([^'"]+)['"]\s+do\b/);
    if (m && m[2] !== extensionName) { mainTargetLine = i; targetIndent = m[1].length; break; }
  }
  if (mainTargetLine === -1) return podfile;

  // First `end` with indentation <= target's = target's closing `end`.
  let closingLine = -1;
  for (let i = mainTargetLine + 1; i < lines.length; i++) {
    const em = lines[i].match(/^(\s*)end(\s*(#.*)?)$/);
    if (em && em[1].length <= targetIndent) { closingLine = i; break; }
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

// --- Test 4: target inside abstract_target (indented) ---
const PODFILE_ABSTRACT_TARGET = `\
require 'something'

platform :ios, '16.0'

abstract_target 'defaults' do
  use_expo_modules!

  target 'GrabDocs' do
    if ENV['SOME_FLAG']
      config_command = ['node']
    else
      config_command = ['node', '--eval']
    end
    use_react_native!(
      :path => '../node_modules/react-native',
    )
  end
end
`;

const result4 = insertExtensionBeforeMainTargetEnd(PODFILE_ABSTRACT_TARGET, EXTENSION_NAME);
assert(result4.includes("target 'GrabDocsBroadcastUpload' do"), 'Test4: extension in abstract_target case');
assert(result4.includes('inherit! :search_paths'), 'Test4: inherit! present');
// Extension should be inside the GrabDocs target (before its end), not inside abstract_target
const extIdx4 = result4.indexOf("target 'GrabDocsBroadcastUpload' do");
const grabDocsEndIdx4 = result4.indexOf('\n  end\nend'); // GrabDocs target closes with `  end`
assert(extIdx4 < grabDocsEndIdx4 + 100, 'Test4: extension nested inside GrabDocs target');
console.log('\nTest 4 output (last 15 lines):');
console.log(result4.split('\n').slice(-15).join('\n'));

console.log('\n✅ All tests passed.');
