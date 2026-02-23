// Load base config from app.json. Exclude expo-dev-client when:
// 1. CI (e.g. GitHub Actions submit) - avoids "Failed to resolve plugin for module expo-dev-client"
// 2. EAS build profile is "development" - dev builds should be standalone (no Metro), avoid "download" screen on open
const appJson = require("./app.json");

const isCI = !!process.env.CI;
const isDevProfile = process.env.EAS_BUILD_PROFILE === "development";
const basePlugins = appJson.expo.plugins || [];

const plugins = isCI || isDevProfile
  ? basePlugins.filter((p) => {
      const name = Array.isArray(p) ? p[0] : p;
      return name !== "expo-dev-client";
    })
  : basePlugins;

const config = {
  expo: {
    ...appJson.expo,
    plugins,
    // EAS Update: Bare workflow requires a literal runtime version, not a policy.
    runtimeVersion: appJson.expo.version,
    updates: {
      url: 'https://u.expo.dev/341d1cdf-5759-41ef-8ae3-36e4cf7fab00',
    },
  },
};

module.exports = config;
