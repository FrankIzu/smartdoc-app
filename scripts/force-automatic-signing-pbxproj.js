#!/usr/bin/env node
/**
 * Re-apply Automatic signing to project.pbxproj for main app and extension.
 * Run AFTER eas/configure_ios_credentials so EAS cannot overwrite the project
 * with manual profile (which would assign the main app profile to the extension).
 * Same logic as plugins/ios-hms-screenshare.js forceAutomaticSigningInPbxForBundleId.
 *
 * Usage: node scripts/force-automatic-signing-pbxproj.js [path/to/project.pbxproj]
 * Default path: ios/<app>.xcodeproj/project.pbxproj (first match).
 */

const fs = require('fs');
const path = require('path');

const MAIN_BUNDLE = 'com.grabdocs.mobile';
const EXT_BUNDLE = 'com.grabdocs.mobile.GrabDocsBroadcastUpload';
const TEAM_ID = 'Q33K3Q7Q53';

function forceAutomaticSigningInPbxForBundleId(pbx, bundleId, defaultTeamId) {
  const escaped = bundleId.replace(/\./g, '\\.');
  const blockRe = new RegExp(
    '(PRODUCT_BUNDLE_IDENTIFIER = "' + escaped + '";)([\\s\\S]*?)(\\n\\s*\\};)',
    'g'
  );
  return pbx.replace(blockRe, (_, bundleLine, restOfBuildSettings, closing) => {
    // Remove any line containing these keys (EAS may inject PROVISIONING_PROFILE_SPECIFIER
    // with values like *[expo]...; must strip so Xcode uses true automatic signing).
    let rest = restOfBuildSettings
      .replace(/\s*CODE_SIGN_STYLE = [^\n]*\n?/g, '')
      .replace(/\s*CODE_SIGNING_ALLOWED = [^\n]*\n?/g, '')
      .replace(/\s*PROVISIONING_PROFILE = [^\n]*\n?/g, '')
      .replace(/\s*PROVISIONING_PROFILE_SPECIFIER = [^\n]*\n?/g, '')
      .replace(/\s*CODE_SIGN_IDENTITY = [^\n]*\n?/g, '');
    rest = rest.trimEnd() + '\n\t\t\t\tCODE_SIGN_STYLE = "Automatic";\n\t\t\t\tCODE_SIGNING_ALLOWED = "YES";\n\t\t';
    if (defaultTeamId && !rest.includes('DEVELOPMENT_TEAM')) {
      rest = rest.trimEnd() + '\n\t\t\t\tDEVELOPMENT_TEAM = "' + defaultTeamId + '";\n\t\t\t';
    }
    return bundleLine + rest + closing;
  });
}

function main() {
  let pbxPath = process.argv[2];
  if (!pbxPath) {
    const iosRoot = path.join(process.cwd(), 'ios');
    if (!fs.existsSync(iosRoot)) {
      console.error('ios/ not found and no path given');
      process.exit(1);
    }
    const dirs = fs.readdirSync(iosRoot);
    const xcodeproj = dirs.find((d) => d.endsWith('.xcodeproj'));
    if (!xcodeproj) {
      console.error('No .xcodeproj found under ios/');
      process.exit(1);
    }
    pbxPath = path.join(iosRoot, xcodeproj, 'project.pbxproj');
  }
  if (!fs.existsSync(pbxPath)) {
    console.error('Not found:', pbxPath);
    process.exit(1);
  }

  let pbx = fs.readFileSync(pbxPath, 'utf8');
  const hadManual = /PROVISIONING_PROFILE\s*=/.test(pbx);
  pbx = forceAutomaticSigningInPbxForBundleId(pbx, MAIN_BUNDLE, TEAM_ID);
  pbx = forceAutomaticSigningInPbxForBundleId(pbx, EXT_BUNDLE, TEAM_ID);
  fs.writeFileSync(pbxPath, pbx);
  console.log('✅ Forced CODE_SIGN_STYLE = Automatic for', MAIN_BUNDLE, 'and', EXT_BUNDLE, 'in', pbxPath);
  if (hadManual) {
    console.log('   (Removed PROVISIONING_PROFILE / SPECIFIER that were set by EAS configure_ios_credentials)');
  }
}

main();
