#!/bin/bash
# Installs the correct extension provisioning profile (with App Groups) by its UUID
# so Xcode's UUID-based lookup finds our profile, not EAS's auto-generated one.
# Runs via eas-build-post-install (after npm install, before EAS installs credentials).

PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
EXT_UUID="f5a9c6da-0810-4a56-8963-3cb9894f83a1"

mkdir -p "$PROFILE_DIR"

if [ -z "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] EXT_PROVISIONING_PROFILE not set"
  exit 0
fi

if [ ! -f "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] File not found: $EXT_PROVISIONING_PROFILE"
  exit 0
fi

# Always install our profile at its UUID path — overrides whatever EAS puts there
DEST="$PROFILE_DIR/$EXT_UUID.mobileprovision"
cp "$EXT_PROVISIONING_PROFILE" "$DEST"
echo "[install-extension-profile] Installed: $DEST"

echo "[install-extension-profile] All installed profiles:"
ls -la "$PROFILE_DIR"
