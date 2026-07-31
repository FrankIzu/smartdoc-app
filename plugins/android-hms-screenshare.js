/**
 * Expo config plugin: declare 100ms HmsScreenshareActivity in AndroidManifest.
 *
 * @100mslive/react-native-hms ships the activity class but an empty library
 * manifest, so startScreenshare() crashes without this entry.
 * See docs/MOBILE_SCREENSHARE_WHITEBOARD.md
 */
const { withAndroidManifest } = require('expo/config-plugins');

const SCREENSHARE_ACTIVITY = 'com.reactnativehmssdk.HmsScreenshareActivity';

function withAndroidHmsScreenshare(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest?.application?.[0];
    if (!application) return config;

    application.activity = application.activity || [];

    const alreadyDeclared = application.activity.some(
      (entry) => entry.$?.['android:name'] === SCREENSHARE_ACTIVITY
    );
    if (alreadyDeclared) return config;

    application.activity.push({
      $: {
        'android:name': SCREENSHARE_ACTIVITY,
        'android:exported': 'false',
        'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
      },
    });

    return config;
  });
}

module.exports = withAndroidHmsScreenshare;
