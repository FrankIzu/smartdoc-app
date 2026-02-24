#!/usr/bin/env node
/**
 * Verify iOS Podfile and run pod install (for local check on macOS after prebuild).
 * Patches the Podfile so GrabDocsBroadcastUpload is nested in the main target, then runs pod install.
 *
 * Usage (on macOS, after prebuild):
 *   npx expo prebuild --platform ios --clean
 *   node scripts/verify-ios-pods.js
 *
 * Expect: "Pod installation complete!" with no errors.
 */

const path = require('path');
const { execSync } = require('child_process');

const iosDir = path.join(__dirname, '..', 'ios');
const podfilePath = path.join(iosDir, 'Podfile');

function main() {
  const fs = require('fs');
  if (!fs.existsSync(podfilePath)) {
    console.error('ios/Podfile not found.');
    if (!fs.existsSync(iosDir)) {
      console.error('The ios/ folder is missing. Expo generates it only on macOS/Linux.');
      console.error('  Run on a Mac: npx expo prebuild --platform ios --clean');
    }
    process.exit(1);
  }

  // Patch Podfile (idempotent) by running the patch script
  try {
    execSync('node scripts/patch-ios-podfile.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  } catch (e) {
    process.exit(e.status ?? 1);
  }

  console.log('Running: cd ios && pod install --repo-update');
  try {
    execSync('pod install --repo-update', { cwd: iosDir, stdio: 'inherit' });
  } catch (e) {
    process.exit(e.status ?? 1);
  }
  console.log('Done. If you saw "Pod installation complete!", you can run EAS build.');
}

main();
