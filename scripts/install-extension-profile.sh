#!/bin/bash
# Installs the GrabDocsBroadcastUpload provisioning profile by its exact UUID.
# EAS does not auto-manage extension credentials, so we install it manually
# from the EXT_PROVISIONING_PROFILE file-type env var (set in EAS environment variables).
# Runs via eas-build-post-install (after npm install).

PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
EXT_UUID="f5a9c6da-0810-4a56-8963-3cb9894f83a1"
DEST="$PROFILE_DIR/$EXT_UUID.mobileprovision"

if [ -z "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] WARNING: EXT_PROVISIONING_PROFILE not set — profile will not be installed"
  exit 0
fi

if [ ! -f "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] WARNING: File not found at: $EXT_PROVISIONING_PROFILE"
  exit 0
fi

mkdir -p "$PROFILE_DIR"
cp "$EXT_PROVISIONING_PROFILE" "$DEST"
echo "[install-extension-profile] Installed: $DEST"
echo "[install-extension-profile] All profiles in directory:"
ls "$PROFILE_DIR"
