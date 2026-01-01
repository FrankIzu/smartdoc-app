const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Configure resolver to handle socket.io dependencies
// This forces Metro to use CommonJS versions instead of ESM
config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: false, // Disable package exports to use main entry
};

module.exports = config; 