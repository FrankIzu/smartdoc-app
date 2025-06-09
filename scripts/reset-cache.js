const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Paths to clear
const paths = [
  '.expo',
  'node_modules/.cache',
  'node_modules/.vite',
];

// Clear caches
paths.forEach(cachePath => {
  const fullPath = path.join(__dirname, '..', cachePath);
  if (fs.existsSync(fullPath)) {
    console.log(`Clearing ${cachePath}...`);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
});

// Clear Metro bundler cache
console.log('Clearing Metro bundler cache...');
execSync('npx expo start --clear', { stdio: 'inherit' }); 