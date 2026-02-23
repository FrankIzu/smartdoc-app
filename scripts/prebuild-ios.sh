#!/bin/sh
# Called by EAS via prebuildCommand in eas.json.
# Runs expo prebuild then patches the Podfile so GrabDocsBroadcastUpload
# is nested inside the main app target (required by CocoaPods).
set -e

npx expo prebuild --platform ios --no-install
node scripts/patch-ios-podfile.js

echo "===== Podfile after patch (first 60 lines) ====="
head -60 ios/Podfile || true
echo "================================================="
