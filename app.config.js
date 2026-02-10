// Load base config from app.json. In CI (e.g. GitHub Actions submit step),
// exclude expo-dev-client from plugins so EAS doesn't need to resolve it
// (avoids "Failed to resolve plugin for module expo-dev-client" during submit).
// Use !!process.env.CI so we catch CI=true, CI=1, or any set value (GHA can use 1).
const appJson = require("./app.json");

const isCI = !!process.env.CI;
const basePlugins = appJson.expo.plugins || [];

const plugins = isCI
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
