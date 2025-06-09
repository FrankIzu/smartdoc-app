const { spawn } = require('child_process');

// Set Node.js options to handle TypeScript files using --import (new method)
process.env.NODE_OPTIONS = '--import tsx/esm';

// Start Expo with the tsx import
const expo = spawn('npx', ['expo', 'start', '--clear'], {
  stdio: 'inherit',
  shell: true
});

expo.on('error', (error) => {
  console.error('Error starting Expo:', error);
  process.exit(1);
});

expo.on('close', (code) => {
  console.log(`Expo process exited with code ${code}`);
  process.exit(code);
}); 