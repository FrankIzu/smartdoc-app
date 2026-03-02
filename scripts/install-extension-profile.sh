#!/bin/bash
# Installs the GrabDocsBroadcastUpload provisioning profile and patches project.pbxproj.
# EAS does not auto-manage extension credentials, so we install manually and patch
# AFTER EAS credential manager (which would set Manual with no profile).
# Runs via eas-build-post-install.
#
# Env: EXT_PROVISIONING_PROFILE (path to .mobileprovision), EXT_PROFILE_UUID (optional, else extracted).

PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"

if [ -z "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] WARNING: EXT_PROVISIONING_PROFILE not set — skipping"
  exit 0
fi

if [ ! -f "$EXT_PROVISIONING_PROFILE" ]; then
  echo "[install-extension-profile] WARNING: File not found at: $EXT_PROVISIONING_PROFILE"
  exit 0
fi

# Use EXT_PROFILE_UUID if set, else extract from profile
if [ -n "$EXT_PROFILE_UUID" ] && [ "${#EXT_PROFILE_UUID}" -eq 36 ]; then
  UUID="$EXT_PROFILE_UUID"
else
  UUID=$(security cms -D -i "$EXT_PROVISIONING_PROFILE" 2>/dev/null | /usr/libexec/PlistBuddy -c 'Print UUID' /dev/stdin 2>/dev/null || true)
  if [ -z "$UUID" ] || [ "${#UUID}" -ne 36 ]; then
    echo "[install-extension-profile] WARNING: Could not extract UUID from profile"
    exit 0
  fi
  export EXT_PROFILE_UUID="$UUID"
fi

mkdir -p "$PROFILE_DIR"
cp "$EXT_PROVISIONING_PROFILE" "$PROFILE_DIR/$UUID.mobileprovision"
echo "[install-extension-profile] Installed: $PROFILE_DIR/$UUID.mobileprovision"

# Patch project.pbxproj so extension target uses this profile (overrides EAS credential manager)
if [ -d "ios" ]; then
  node scripts/patch-extension-profile.js 2>/dev/null || true
fi
