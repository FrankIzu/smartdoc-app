#!/bin/bash
# Runs after pod install (eas-build-post-install hook).
# Checks if EAS already installed the extension profile (it should if credentials are set up).
# If not, installs it from the EXT_PROVISIONING_PROFILE file-type env var.

PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
EXT_UUID="f5a9c6da-0810-4a56-8963-3cb9894f83a1"
EXT_PROFILE_PATH="$PROFILE_DIR/$EXT_UUID.mobileprovision"

echo "[install-extension-profile] Provisioning profiles directory:"
ls -la "$PROFILE_DIR" 2>/dev/null || echo "  (directory does not exist yet)"

if [ -f "$EXT_PROFILE_PATH" ]; then
  echo "[install-extension-profile] Extension profile already installed by EAS: $EXT_PROFILE_PATH"
  exit 0
fi

echo "[install-extension-profile] Extension profile NOT found at $EXT_PROFILE_PATH"

if [ -n "$EXT_PROVISIONING_PROFILE" ] && [ -f "$EXT_PROVISIONING_PROFILE" ]; then
  mkdir -p "$PROFILE_DIR"
  cp "$EXT_PROVISIONING_PROFILE" "$EXT_PROFILE_PATH"
  echo "[install-extension-profile] Installed from EXT_PROVISIONING_PROFILE env var: $EXT_PROFILE_PATH"
  exit 0
fi

echo "[install-extension-profile] WARNING: Could not install extension profile - EXT_PROVISIONING_PROFILE not set or file missing"
echo "[install-extension-profile] Listing all installed profiles:"
ls -la "$PROFILE_DIR" 2>/dev/null
