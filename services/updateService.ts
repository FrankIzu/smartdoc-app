/**
 * App update flow:
 * 1. Min version (backend): GET /api/app-config. If app is behind min and (no grace window or past enforcedAt) → block.
 *    Grace window: minSupportedEnforcedAt in future → show soft warning only until that time.
 * 2. Soft store update: If current < latestVersion → show dismissible banner (persist dismiss per version).
 * 3. OTA (EAS Update): Check on launch, fetch silently, show "Update ready. Restart to apply."
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import semver from 'semver';
import { API_BASE_URL, API_ENDPOINTS, STORE_URLS } from '../constants/Config';

const DISMISSED_STORE_UPDATE_KEY = 'dismissedStoreUpdateVersion';

export type UpdateReason = 'security' | 'breaking' | 'feature';

export type MinVersionResult =
  | { mustUpdate: true; storeUrl: string; message?: string; updateReason?: UpdateReason }
  | { mustUpdate: false; softWarning?: { storeUrl: string; message: string; enforcedAt: string; updateReason?: UpdateReason } };

/** Response from backend GET /api/app-config */
export interface AppConfigResponse {
  minSupportedVersion?: string;
  minSupportedBuildNumber?: number;
  minSupportedVersionCode?: number;
  minSupportedEnforcedAt?: string;
  updateReason?: UpdateReason;
  latestVersion?: string;
  storeUrls?: { ios?: string; android?: string };
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

function getStoreUrl(data?: AppConfigResponse): string {
  if (data?.storeUrls) {
    return Platform.OS === 'ios' ? (data.storeUrls.ios ?? STORE_URLS.ios) : (data.storeUrls.android ?? STORE_URLS.android);
  }
  return Platform.OS === 'ios' ? STORE_URLS.ios : STORE_URLS.android;
}

/**
 * iOS: only minSupportedVersion (semver) is used; build number is ignored.
 * Android: minSupportedVersion (semver) and optionally minSupportedVersionCode for stricter control.
 */
function isBehindMinVersion(data: AppConfigResponse): boolean {
  const minVer = data.minSupportedVersion?.trim();
  if (minVer && semver.valid(minVer)) {
    const current = getAppVersion();
    if (semver.lt(semver.coerce(current) ?? current, minVer)) return true;
  }
  // iOS: do not use build number; App Store uses version (minSupportedVersion) only.
  if (Platform.OS === 'android' && data.minSupportedVersionCode != null) {
    if (getAndroidVersionCode() < data.minSupportedVersionCode) return true;
  }
  return false;
}

function messageForReason(reason?: UpdateReason): string {
  switch (reason) {
    case 'security':
      return 'A security update is required. Please update from the store to continue.';
    case 'breaking':
      return 'This version is no longer supported. Please update from the store to continue.';
    case 'feature':
      return 'A new version of GrabDocs is available. Please update from the store to continue.';
    default:
      return 'A new version of GrabDocs is available. Please update from the store to continue.';
  }
}

/** Fetch app config (no auth). */
export async function fetchAppConfig(baseUrl: string = API_BASE_URL): Promise<AppConfigResponse | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}${API_ENDPOINTS.APP_CONFIG}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Check if the current app is below the backend's minimum supported version.
 * If minSupportedEnforcedAt is set and in the future, return softWarning instead of blocking.
 * "feature" reason never blocks: user can continue; only security/breaking can force update.
 */
export async function checkMinVersion(baseUrl: string = API_BASE_URL, config?: AppConfigResponse | null): Promise<MinVersionResult> {
  try {
    const data = config ?? await fetchAppConfig(baseUrl);
    if (!data || !isBehindMinVersion(data)) return { mustUpdate: false };

    const storeUrl = getStoreUrl(data);
    const reason = data.updateReason;
    const message = messageForReason(reason);
    const enforcedAtStr = data.minSupportedEnforcedAt?.trim();

    // "feature" = new version available but do not block; show soft warning only so user can continue
    if (reason === 'feature') {
      return {
        mustUpdate: false,
        softWarning: { storeUrl, message, enforcedAt: enforcedAtStr ?? '', updateReason: reason },
      };
    }

    if (enforcedAtStr) {
      const enforcedAt = new Date(enforcedAtStr).getTime();
      if (!Number.isNaN(enforcedAt) && Date.now() < enforcedAt) {
        return {
          mustUpdate: false,
          softWarning: { storeUrl, message, enforcedAt: enforcedAtStr, updateReason: reason },
        };
      }
    }

    return { mustUpdate: true, storeUrl, message, updateReason: reason };
  } catch {
    return { mustUpdate: false };
  }
}

export type SoftStoreUpdateResult = { updateAvailable: true; latestVersion: string; storeUrl: string } | { updateAvailable: false };

/**
 * Check if a newer store version is available (soft prompt). Respects persisted dismiss per version.
 */
export async function checkSoftStoreUpdate(
  baseUrl: string = API_BASE_URL,
  config?: AppConfigResponse | null
): Promise<SoftStoreUpdateResult> {
  try {
    const data = config ?? await fetchAppConfig(baseUrl);
    const latest = data?.latestVersion?.trim();
    if (!latest || !semver.valid(latest)) return { updateAvailable: false };

    const current = getAppVersion();
    if (semver.gte(semver.coerce(current) ?? current, latest)) return { updateAvailable: false };

    const dismissed = await AsyncStorage.getItem(DISMISSED_STORE_UPDATE_KEY);
    if (dismissed === latest) return { updateAvailable: false };

    return { updateAvailable: true, latestVersion: latest, storeUrl: getStoreUrl(data) };
  } catch {
    return { updateAvailable: false };
  }
}

/** Persist "Later" for this store version so we don't show again until a newer version exists. */
export async function setDismissedStoreUpdateVersion(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_STORE_UPDATE_KEY, version);
  } catch {
    // ignore
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
    reportUpdateTelemetry('ota_fetch_success', {}).catch(() => {});
    return { updateReady: true };
  } catch {
    reportUpdateTelemetry('ota_fetch_failure', {}).catch(() => {});
    return { updateReady: false };
  }
}

/** Report update-related events for telemetry (blocked %, soft tap, OTA, etc.). No-op if backend does not implement. */
export async function reportUpdateTelemetry(
  event: 'min_version_blocked' | 'soft_update_tapped' | 'ota_fetch_success' | 'ota_fetch_failure',
  payload: { currentVersion?: string; minVersion?: string; latestVersion?: string }
): Promise<void> {
  try {
    const body = {
      event,
      ...payload,
      platform: Platform.OS,
      appVersion: getAppVersion(),
    };
    await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/app-config/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // ignore
  }
}

/** Reload the app to apply a previously fetched OTA update. */
export async function reloadToApplyUpdate(): Promise<void> {
  if (!isUpdatesSupported()) return;
  await Updates.reloadAsync();
}
