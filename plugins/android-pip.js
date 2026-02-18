/**
 * Expo config plugin: enable Android Picture-in-Picture for the main activity.
 * Required for 100ms meeting PiP (autoEnterPipMode) so the meeting can show in a floating window when the app is in background.
 * @see https://developer.android.com/develop/ui/compose/system/pip-setup
 */
const { withAndroidManifest } = require('expo/config-plugins');

function withAndroidPip(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest?.application?.[0];
    const activities = application?.activity;
    if (!Array.isArray(activities) || activities.length === 0) return config;

    const mainActivity = activities[0];
    mainActivity.$ = mainActivity.$ || {};
    mainActivity.$['android:supportsPictureInPicture'] = 'true';
    mainActivity.$['android:resizeableActivity'] = 'true';
    // configChanges: include smallestScreenSize for PiP view visibility (100ms docs)
    const configChanges = mainActivity.$['android:configChanges'] || 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode';
    if (!configChanges.includes('smallestScreenSize')) {
      mainActivity.$['android:configChanges'] = configChanges.replace('screenSize|', 'screenSize|smallestScreenSize|');
    }

    return config;
  });
}

module.exports = withAndroidPip;
