#!/usr/bin/env node
/**
 * Verify GrabDocsBroadcastUpload extension is configured (run on Windows).
 * Does NOT require ios/ — checks app config and plugin.
 */
const fs = require('fs');
const path = require('path');

const EXT = 'GrabDocsBroadcastUpload';
const ROOT = path.join(__dirname, '..');

function check(name, ok, msg) {
  console.log(ok ? '  ✅' : '  ❌', name + ':', msg || (ok ? 'OK' : 'MISSING'));
  return ok;
}

let allOk = true;

console.log('\n===== GrabDocsBroadcastUpload extension config check =====\n');

// 1. Plugin in app.config.js
const appConfig = fs.readFileSync(path.join(ROOT, 'app.config.js'), 'utf8');
allOk &= check('Plugin registered', appConfig.includes('ios-hms-screenshare'), 'ios-hms-screenshare plugin');
allOk &= check('Extension name in plugin', appConfig.includes(EXT), 'GrabDocsBroadcastUpload in plugin options');

// 2. EAS appExtensions (for credentials)
allOk &= check('EAS appExtensions', appConfig.includes('appExtensions') && appConfig.includes(EXT), 'extra.eas.build.experimental.ios.appExtensions');

// 3. Plugin file exists and references extension
const pluginPath = path.join(ROOT, 'plugins', 'ios-hms-screenshare.js');
if (fs.existsSync(pluginPath)) {
  const plugin = fs.readFileSync(pluginPath, 'utf8');
  allOk &= check('Plugin defines extension', plugin.includes(EXT), 'DEFAULT_EXTENSION_NAME / extension target');
} else {
  allOk &= check('Plugin file exists', false, 'plugins/ios-hms-screenshare.js not found');
}

// 3b. Android screenshare activity plugin
allOk &= check(
  'Android screenshare plugin registered',
  appConfig.includes('android-hms-screenshare'),
  'plugins/android-hms-screenshare'
);

// 4. Constants/Config
const configPath = path.join(ROOT, 'constants', 'Config.ts');
if (fs.existsSync(configPath)) {
  const config = fs.readFileSync(configPath, 'utf8');
  allOk &= check('Config.ts references extension', config.includes(EXT), 'EXPO_PUBLIC_HMS_IOS_PREFERRED_EXTENSION');
}

// 5. Patch script
const patchPath = path.join(ROOT, 'scripts', 'patch-ios-podfile.js');
allOk &= check('Patch script exists', fs.existsSync(patchPath), 'patch-ios-podfile.js');

console.log('\n' + (allOk ? '✅ All config checks passed.' : '❌ Some checks failed.'));
console.log('\nNote: ios/ is generated on macOS during prebuild. To verify Podfile/Xcode project,');
console.log('      run the Prebuild iOS or Build iOS workflow and check the logs.\n');

process.exit(allOk ? 0 : 1);
