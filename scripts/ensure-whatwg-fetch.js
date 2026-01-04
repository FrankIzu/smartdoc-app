#!/usr/bin/env node
/**
 * Ensure whatwg-fetch dist files exist
 * This script ensures that whatwg-fetch's dist/fetch.umd.js exists,
 * copying from fetch.js if necessary (for EAS Build where prepare script may not run)
 */

const fs = require('fs');
const path = require('path');

try {
  // Find whatwg-fetch package
  const whatwgFetchPath = path.dirname(require.resolve('whatwg-fetch/package.json'));
  const distPath = path.join(whatwgFetchPath, 'dist', 'fetch.umd.js');
  const jsPath = path.join(whatwgFetchPath, 'fetch.js');
  
  // Check if dist/fetch.umd.js exists
  if (!fs.existsSync(distPath)) {
    console.log('⚠️  whatwg-fetch: dist/fetch.umd.js not found, creating...');
    
    // Ensure dist directory exists
    const distDir = path.join(whatwgFetchPath, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    
    // If fetch.js exists, copy it as fallback
    // Note: This is a workaround - ideally the prepare script should run
    if (fs.existsSync(jsPath)) {
      fs.copyFileSync(jsPath, distPath);
      console.log('✅ whatwg-fetch: Created dist/fetch.umd.js from fetch.js');
    } else {
      console.warn('⚠️  whatwg-fetch: Neither dist/fetch.umd.js nor fetch.js found');
    }
  } else {
    console.log('✅ whatwg-fetch: dist/fetch.umd.js exists');
  }
} catch (error) {
  // Silently fail - whatwg-fetch might not be installed yet
  // Metro resolver will handle the fallback
  if (error.code !== 'MODULE_NOT_FOUND') {
    console.warn('⚠️  Could not check whatwg-fetch:', error.message);
  }
}

