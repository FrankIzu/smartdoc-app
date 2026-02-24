#!/bin/bash
# Installs the GrabDocsBroadcastUpload provisioning profile before the Xcode build.
# Runs via the eas-build-post-install hook (after pod install, before xcodebuild).
# EXT_PROVISIONING_PROFILE is a file-type EAS env var: at build time it contains
# the path to the decoded .mobileprovision file written by EAS.

set -e

if [ "$EAS_BUILD_PLATFORM" != "ios" ]; then
  echo "[install-extension-profile] Not an iOS build, skipping."
  exit 0
fi

if [ -z "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] ⚠️  EXT_PROVISIONING_PROFILE not set, skipping."
  exit 0
fi

if [ ! -f "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] ⚠️  Profile file not found at: $EXT_PROVISIONING_PROFILE"
  exit 0
fi

PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$PROFILE_DIR"

# Extract the UUID embedded in the .mobileprovision plist
UUID=$(security cms -D -i "$EXT_PROVISIONING_PROFILE" 2>/dev/null \
  | /usr/libexec/PlistBuddy -c 'Print UUID' /dev/stdin 2>/dev/null)

if [ -n "$UUID" ]; then
  cp "$EXT_PROVISIONING_PROFILE" "$PROFILE_DIR/$UUID.mobileprovision"
  echo "[install-extension-profile] ✅ Installed profile UUID: $UUID"
else
  # Fallback: Xcode reads the embedded UUID regardless of filename
  cp "$EXT_PROVISIONING_PROFILE" "$PROFILE_DIR/GrabDocsBroadcastUpload.mobileprovision"
  echo "[install-extension-profile] ⚠️  Could not extract UUID, installed with fixed filename."
fi
