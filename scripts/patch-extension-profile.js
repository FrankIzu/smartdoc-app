#!/usr/bin/env node
/**
 * Patches project.pbxproj to set PROVISIONING_PROFILE for the GrabDocsBroadcastUpload
 * extension target. Runs via eas-build-post-install AFTER EAS credential manager, so our
 * patch overrides EAS's "Manual with no profile" for the extension.
 *
 * Requires: EXT_PROFILE_UUID env var (the provisioning profile UUID).
 * Usage: node scripts/patch-extension-profile.js
 */

const fs = require('fs');
const path = require('path');

const EXT_BUNDLE_ID = 'com.grabdocs.mobile.GrabDocsBroadcastUpload';

const uuid = process.env.EXT_PROFILE_UUID;
if (!uuid || uuid.length !== 36) {
  console.warn('[patch-extension-profile] EXT_PROFILE_UUID not set or invalid — skipping project patch');
  process.exit(0);
}

const iosRoot = path.join(process.cwd(), 'ios');
const xcodeprojDir = fs.readdirSync(iosRoot, { withFileTypes: true })
  .find((f) => f.isDirectory() && f.name.endsWith('.xcodeproj'));
if (!xcodeprojDir) {
  console.warn('[patch-extension-profile] No .xcodeproj found in ios/');
  process.exit(0);
}

const pbxPath = path.join(iosRoot, xcodeprojDir.name, 'project.pbxproj');
if (!fs.existsSync(pbxPath)) {
  console.warn('[patch-extension-profile] project.pbxproj not found');
  process.exit(0);
}

let pbx = fs.readFileSync(pbxPath, 'utf8');
const escapedBundleId = EXT_BUNDLE_ID.replace(/\./g, '\\.');

// Find XCBuildConfiguration block that contains the extension's bundle ID.
// Replace or add PROVISIONING_PROFILE in that block.
const blockRe = new RegExp(
  '(PRODUCT_BUNDLE_IDENTIFIER = "' + escapedBundleId + '";)([\\s\\S]*?)(\\n\\s*\\};)',
  'g'
);

let patched = false;
const newPbx = pbx.replace(blockRe, (_, bundleLine, restOfBuildSettings, closing) => {
  patched = true;
  // Remove existing PROVISIONING_PROFILE / PROVISIONING_PROFILE_SPECIFIER
  let rest = restOfBuildSettings
    .replace(/\s*PROVISIONING_PROFILE = "[^"]*";\s*\n?/g, '')
    .replace(/\s*PROVISIONING_PROFILE_SPECIFIER = "[^"]*";\s*\n?/g, '');
  // Add our PROVISIONING_PROFILE
  rest = rest.trimEnd() + '\n\t\t\t\tPROVISIONING_PROFILE = "' + uuid + '";\n\t\t\t\t';
  return bundleLine + rest + closing;
});

if (patched) {
  fs.writeFileSync(pbxPath, newPbx);
  console.log('[patch-extension-profile] Set extension PROVISIONING_PROFILE to', uuid);
} else {
  console.warn('[patch-extension-profile] Extension build config not found in project.pbxproj');
}
