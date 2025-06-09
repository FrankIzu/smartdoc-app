// Web polyfill for import.meta
if (typeof globalThis !== 'undefined' && !globalThis.import) {
  globalThis.import = {
    meta: {
      env: typeof process !== 'undefined' ? process.env : {},
      url: '',
      hot: false,
    },
  };
}

// Also define on window for browser compatibility
if (typeof window !== 'undefined' && !window.import) {
  window.import = {
    meta: {
      env: {},
      url: '',
      hot: false,
    },
  };
} 