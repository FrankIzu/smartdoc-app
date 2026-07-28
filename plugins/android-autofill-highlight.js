/**
 * Expo config plugin: neutralize Android's default yellow autofill highlight
 * on TextInputs (intake, auth, and other forms).
 *
 * Android paints autofilled fields with android:autofilledHighlight (yellow by
 * default). That color is not controllable from React Native JS — only via the
 * app theme. This plugin sets it to transparent so fields keep GrabDocs styling.
 *
 * Requires a native rebuild (prebuild / EAS) — not an OTA/JS-only change.
 *
 * @see https://developer.android.com/guide/topics/text/autofill-optimize#highlighted
 */
const {
  AndroidConfig,
  withAndroidStyles,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DRAWABLE_NAME = 'autofill_highlight';
const DRAWABLE_CONTENTS = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="@android:color/transparent" />
</shape>
`;

function withAutofillHighlightDrawable(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const drawableDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable'
      );
      await fs.promises.mkdir(drawableDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(drawableDir, `${DRAWABLE_NAME}.xml`),
        DRAWABLE_CONTENTS,
        'utf8'
      );
      return cfg;
    },
  ]);
}

function withAutofillHighlightStyle(config) {
  return withAndroidStyles(config, (cfg) => {
    const { assignStylesValue, getAppThemeGroup } = AndroidConfig.Styles;
    cfg.modResults = assignStylesValue(cfg.modResults, {
      add: true,
      parent: getAppThemeGroup(),
      name: 'android:autofilledHighlight',
      value: `@drawable/${DRAWABLE_NAME}`,
    });
    return cfg;
  });
}

function withAndroidAutofillHighlight(config) {
  config = withAutofillHighlightDrawable(config);
  config = withAutofillHighlightStyle(config);
  return config;
}

module.exports = withAndroidAutofillHighlight;
