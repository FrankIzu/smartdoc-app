#!/bin/bash
# Installs the GrabDocsBroadcastUpload provisioning profile before xcodebuild.
# Runs via eas-build-post-install (after pod install, before archive).
# EXT_PROVISIONING_PROFILE is a file-type EAS env var: its value is the path
# to the decoded .mobileprovision file written to disk by EAS.

if [ "$EAS_BUILD_PLATFORM" != "ios" ]; then
  echo "[install-extension-profile] Not an iOS build, skipping."
  exit 0
fi

if [ -z "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] EXT_PROVISIONING_PROFILE not set, skipping."
  exit 0
fi

if [ ! -f "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] File not found at: $EXT_PROVISIONING_PROFILE"
  exit 0
fi

PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$PROFILE_DIR"

# Xcode identifies profiles by the UUID embedded INSIDE the file, not the filename.
# Copying with a recognisable name is sufficient.
DEST="$PROFILE_DIR/GrabDocsBroadcastUpload.mobileprovision"
cp "$EXT_PROVISIONING_PROFILE" "$DEST"

if [ -f "$DEST" ]; then
  echo "[install-extension-profile] Installed: $DEST"
  ls -la "$DEST"
else
  echo "[install-extension-profile] ERROR: copy failed"
  exit 1
fi
