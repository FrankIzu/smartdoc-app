#!/usr/bin/env node
// This script ignores all command-line arguments to work with EAS prebuildCommand
const fs = require('fs');

console.log('=== DEBUG: PWD ===');
console.log(process.cwd());

console.log('\n=== DEBUG: Listing files ===');
try {
  const files = fs.readdirSync('.');
  files.forEach(file => {
    const stats = fs.statSync(file);
    console.log(`${stats.isDirectory() ? 'd' : '-'} ${file}`);
  });
} catch (error) {
  console.log('Error listing files:', error.message);
}

console.log('\n=== DEBUG: Checking index.js ===');
try {
  if (fs.existsSync('index.js')) {
    console.log('✅ index.js EXISTS');
    console.log('Content:');
    console.log(fs.readFileSync('index.js', 'utf8'));
  } else {
    console.log('❌ index.js NOT FOUND');
  }
} catch (error) {
  console.log('Error reading index.js:', error.message);
}

console.log('\n=== DEBUG: Checking package.json main field ===');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log('package.json main:', pkg.main);
} catch (error) {
  console.log('Error reading package.json:', error.message);
}

