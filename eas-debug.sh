#!/bin/sh
echo "=== DEBUG: Current Working Directory ==="
pwd
echo ""
echo "=== DEBUG: Listing files ==="
ls -la
echo ""
echo "=== DEBUG: index.js check ==="
test -f index.js && echo "✓ index.js EXISTS" || echo "✗ index.js NOT FOUND"
test -f index.js && cat index.js
echo ""
echo "=== DEBUG END ==="

