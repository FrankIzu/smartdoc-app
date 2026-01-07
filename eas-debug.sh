#!/bin/bash
# Debug script to verify EAS build environment
# This script ignores all arguments to work with EAS prebuildCommand

echo "=== DEBUG: PWD ==="
pwd

echo ""
echo "=== DEBUG: Listing files ==="
ls -la

echo ""
echo "=== DEBUG: Checking index.js ==="
if [ -f "index.js" ]; then
  echo "✅ index.js EXISTS"
  echo "Content:"
  cat index.js
else
  echo "❌ index.js NOT FOUND"
fi

echo ""
echo "=== DEBUG: Checking package.json main field ==="
if [ -f "package.json" ]; then
  grep -A 1 '"main"' package.json || echo "main field not found"
fi

