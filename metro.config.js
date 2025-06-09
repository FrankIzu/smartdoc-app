const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Configure resolver for @ path mapping
config.resolver = {
  ...config.resolver,
  alias: {
    '@': path.resolve(__dirname, '.'),
  },
};

// Add development proxy for web platform
if (process.env.NODE_ENV === 'development') {
  // This will only affect web development
  config.server = {
    ...config.server,
    rewriteRequestUrl: (url) => {
      if (url.startsWith('/api/')) {
        return `http://192.168.1.3:5000${url}`;
      }
      return url;
    },
  };
}

module.exports = config; 