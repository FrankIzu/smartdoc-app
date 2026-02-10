/**
 * App update flow:
 * 1. Min version (backend): GET /api/app-config returns minSupportedVersion (from Render env).
 *    If app is behind → show "Update required" and open store.
 * 2. OTA (EAS Update): Check on launch, fetch silently, show "Update ready. Restart to apply."
 */

import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { API_BASE_URL, API_ENDPOINTS, STORE_URLS } from '../constants/Config';
import semver from 'semver';

export type MinVersionResult =
  | { mustUpdate: true; storeUrl: string }
  | { mustUpdate: false };

/** Response from backend GET /api/app-config. Backend reads from Render env: MIN_SUPPORTED_APP_VERSION, MIN_SUPPORTED_BUILD_IOS, MIN_SUPPORTED_VERSION_CODE_ANDROID */
export interface AppConfigResponse {
  minSupportedVersion?: string;
  minSupportedBuildNumber?: number;
  minSupportedVersionCode?: number;
}

function getAppVersion(): string {
  return Constants.expoConfig?.version ?? process.env.EXPO_PUBLIC_APP_VERSION ?? '0.0.0';
}

function getIosBuildNumber(): number {
  const raw = Constants.expoConfig?.ios?.buildNumber ?? '';
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? 0 : n;
}

function getAndroidVersionCode(): number {
  return Constants.expoConfig?.android?.versionCode ?? 0;
}

/**
 * Check if the current app is below the backend's minimum supported version.
 * Call without auth (so "Update required" works before login).
 */
export async function checkMinVersion(baseUrl: string = API_BASE_URL): Promise<MinVersionResult> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}${API_ENDPOINTS.APP_CONFIG}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return { mustUpdate: false };
    const data: AppConfigResponse = await res.json();

    const minVer = data.minSupportedVersion?.trim();
    if (minVer && semver.valid(minVer)) {
      const current = getAppVersion();
      if (semver.lt(semver.coerce(current) ?? current, minVer)) {
        const storeUrl = Platform.OS === 'ios' ? STORE_URLS.ios : STORE_URLS.android;
        return { mustUpdate: true, storeUrl };
      }
    }

    if (Platform.OS === 'ios' && data.minSupportedBuildNumber != null) {
      const current = getIosBuildNumber();
      if (current < data.minSupportedBuildNumber) {
        return { mustUpdate: true, storeUrl: STORE_URLS.ios };
      }
    }

    if (Platform.OS === 'android' && data.minSupportedVersionCode != null) {
      const current = getAndroidVersionCode();
      if (current < data.minSupportedVersionCode) {
        return { mustUpdate: true, storeUrl: STORE_URLS.android };
      }
    }

    return { mustUpdate: false };
  } catch {
    return { mustUpdate: false };
  }
}

/** True when running in a standalone build where expo-updates is available (not Expo Go). */
export function isUpdatesSupported(): boolean {
  return Constants.appOwnership !== 'expo' && Constants.appOwnership != null;
}

/**
 * Check for OTA update and fetch in background. Do not reload.
 * Returns true if an update was downloaded and is ready to apply on next restart.
 */
export async function checkOtaAndFetch(): Promise<{ updateReady: boolean }> {
  if (!isUpdatesSupported()) return { updateReady: false };
  try {
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable) return { updateReady: false };
    await Updates.fetchUpdateAsync();
    return { updateReady: true };
  } catch {
    return { updateReady: false };
  }
}

/** Reload the app to apply a previously fetched OTA update. */
export async function reloadToApplyUpdate(): Promise<void> {
  if (!isUpdatesSupported()) return;
  await Updates.reloadAsync();
}
