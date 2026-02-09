// Load base config from app.json. In CI (e.g. GitHub Actions submit step),
// exclude expo-dev-client from plugins so EAS doesn't need to resolve it
// (avoids "Failed to resolve plugin for module expo-dev-client" during submit).
const appJson = require("./app.json");

const config = { expo: { ...appJson.expo } };

if (process.env.CI === "true") {
  config.expo.plugins = (config.expo.plugins || []).filter((p) => {
    const name = Array.isArray(p) ? p[0] : p;
    return name !== "expo-dev-client";
  });
}

module.exports = config;
