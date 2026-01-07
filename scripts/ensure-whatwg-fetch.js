#!/usr/bin/env node
/**
 * Ensure required dist files exist for packages that may have missing dist files on EAS Build
 * This script ensures that whatwg-fetch's dist/fetch.umd.js and abort-controller dist files exist,
 * copying from source files if necessary (for EAS Build where prepare scripts may not run)
 */

const fs = require('fs');
const path = require('path');

// Ensure whatwg-fetch dist files
try {
  const whatwgFetchPath = path.dirname(require.resolve('whatwg-fetch/package.json'));
  const distPath = path.join(whatwgFetchPath, 'dist', 'fetch.umd.js');
  const jsPath = path.join(whatwgFetchPath, 'fetch.js');
  
  if (!fs.existsSync(distPath)) {
    console.log('⚠️  whatwg-fetch: dist/fetch.umd.js not found, creating...');
    const distDir = path.join(whatwgFetchPath, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
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
  if (error.code !== 'MODULE_NOT_FOUND') {
    console.warn('⚠️  Could not check whatwg-fetch:', error.message);
  }
}

// Ensure abort-controller dist files exist
try {
  const abortControllerPath = path.dirname(require.resolve('abort-controller/package.json'));
  const distDir = path.join(abortControllerPath, 'dist');
  const distJsPath = path.join(distDir, 'abort-controller.js');
  
  if (!fs.existsSync(distJsPath)) {
    console.log('⚠️  abort-controller: dist/abort-controller.js not found');
    // abort-controller should have dist files from npm package
    // If missing, this is a corrupted install
    console.warn('⚠️  abort-controller: Dist files missing - may need npm install');
  } else {
    console.log('✅ abort-controller: dist/abort-controller.js exists');
  }
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    console.warn('⚠️  Could not check abort-controller:', error.message);
  }
}

