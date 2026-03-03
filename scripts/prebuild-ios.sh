#!/bin/sh
# Called by EAS via prebuildCommand in eas.json.
# Runs expo prebuild then patches Podfile and project.pbxproj for GrabDocsBroadcastUpload.
set -e

npx expo prebuild --platform ios --clean --no-install
node scripts/ensure-podfile-extension.js
node scripts/ensure-pbxproj-embed-phase.js

echo "===== Podfile after patch (first 60 lines) ====="
head -60 ios/Podfile || true
echo "================================================="
