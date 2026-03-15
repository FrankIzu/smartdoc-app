/**
 * Expo config plugin: remove resizability and orientation restrictions for Android 16
 * large screen devices (foldables, tablets).
 *
 * From Android 16, the system ignores such restrictions on large screens; removing them
 * avoids layout/usability issues and satisfies Play Console recommendations.
 *
 * - MainActivity: set screenOrientation to fullUser (allow rotation).
 * - GmsBarcodeScanningDelegateActivity (from ML Kit / expo-camera): override dependency's
 *   PORTRAIT lock via manifest merge (tools:replace) so the activity allows rotation.
 *
 * @see https://developer.android.com/about/versions/16/behavior-changes-16#large-screen-orientation
 */
const { withAndroidManifest } = require('expo/config-plugins');

const TOOLS_NS = 'http://schemas.android.com/tools';
const ML_KIT_DELEGATE_ACTIVITY = 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

function withAndroidLargeScreen(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest) return config;

    // Ensure tools namespace is declared so we can use tools:replace
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = TOOLS_NS;
    }

    const application = manifest.application?.[0];
    const activities = application?.activity;
    if (!Array.isArray(activities) || activities.length === 0) return config;

    // MainActivity (first activity): allow rotation instead of PORTRAIT lock
    const mainActivity = activities[0];
    mainActivity.$ = mainActivity.$ || {};
    mainActivity.$['android:screenOrientation'] = 'fullUser';

    // Override ML Kit barcode scanning delegate activity (from dependency) to allow rotation
    let mlKitActivity = activities.find(
      (a) => a.$?.['android:name'] === ML_KIT_DELEGATE_ACTIVITY
    );
    if (!mlKitActivity) {
      mlKitActivity = {
        $: {
          'android:name': ML_KIT_DELEGATE_ACTIVITY,
          'android:screenOrientation': 'fullUser',
          'tools:replace': 'android:screenOrientation',
        },
      };
      activities.push(mlKitActivity);
    } else {
      mlKitActivity.$ = mlKitActivity.$ || {};
      mlKitActivity.$['android:screenOrientation'] = 'fullUser';
      mlKitActivity.$['tools:replace'] = 'android:screenOrientation';
    }

    return config;
  });
}

module.exports = withAndroidLargeScreen;
