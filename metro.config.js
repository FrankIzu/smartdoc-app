const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Suppress Metro bundler warnings
config.reporter = {
  update: (event) => {
    // Only log errors and important events, suppress warnings
    if (event.type === 'bundle_build_failed' || 
        event.type === 'global_cache_error' ||
        event.type === 'bundle_build_done') {
      console.log(event);
    }
  }
};

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