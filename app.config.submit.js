// Minimal config for EAS submit only. No plugins = no plugin resolution.
// Used when swapping app.config.js during submit to avoid "Failed to resolve
// plugin for module expo-dev-client" (EAS submit does not need plugins).
const base = require("./app.config.js").expo;
module.exports = {
  expo: {
    ...base,
    plugins: [],
  },
};
