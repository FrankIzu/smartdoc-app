/**
 * Expo config plugin: set React Native's edgeToEdgeEnabled=false in android/gradle.properties.
 *
 * This works around Google Play Console warnings about deprecated edge-to-edge APIs
 * (setStatusBarColor, getStatusBarColor, setNavigationBarColor, getNavigationBarColor)
 * that are still used by React Native core and react-native-screens when edge-to-edge
 * is enabled. See:
 * - https://github.com/facebook/react-native/issues/48256
 * - https://developer.android.com/about/versions/15/behavior-changes-15#edge-to-edge
 *
 * With edgeToEdgeEnabled=false, the app does not call enableEdgeToEdge() and avoids
 * those deprecated API paths. On Android 16+ devices the system may still enforce
 * edge-to-edge; this only affects the app's own use of the deprecated APIs so the
 * Play Console warning can be resolved.
 *
 * Safe to run every prebuild (idempotent).
 */
const { withDangerousMod } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

const PROP = 'edgeToEdgeEnabled';
const VALUE = 'false';
const LINE = `${PROP}=${VALUE}`;

function withAndroidEdgeToEdgeOptOut(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const dir = config.modRequest.platformProjectRoot;
      const gradlePath = path.join(dir, 'gradle.properties');
      let content = await fs.promises.readFile(gradlePath, 'utf8');

      const lineRegex = new RegExp(`^\\s*${PROP}\\s*=.*$`, 'm');
      if (lineRegex.test(content)) {
        content = content.replace(lineRegex, LINE);
      } else {
        const trimmed = content.trimEnd();
        const suffix = trimmed.endsWith('\n') ? '' : '\n';
        content = trimmed + suffix + LINE + '\n';
      }

      await fs.promises.writeFile(gradlePath, content);
      return config;
    },
  ]);
}

module.exports = withAndroidEdgeToEdgeOptOut;
