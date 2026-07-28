import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync, NetworkStateType, type NetworkState } from 'expo-network';
import { STORAGE_KEYS } from '../constants/Config';
import { getUserPreferences, updateUserPreferences } from './userPreferences';

export const WIFI_ONLY_UPLOAD_MESSAGE =
  'Wi‑Fi connection required for uploads. Connect to Wi‑Fi or turn off Wi‑Fi Only Upload in Settings.';

/** Unmetered / non-cellular links treated as allowed when Wi‑Fi Only is on. */
const WIFI_ONLY_ALLOWED_TYPES = new Set<NetworkStateType>([
  NetworkStateType.WIFI,
  NetworkStateType.ETHERNET,
]);

const KNOWN_TYPES = new Set<string>(Object.values(NetworkStateType));

function normalizeNetworkType(type: unknown): NetworkStateType | null {
  if (type == null || type === '') return null;
  const raw = String(type).trim().toUpperCase();
  if (!KNOWN_TYPES.has(raw)) return null;
  return raw as NetworkStateType;
}

/** Pure gate used by uploads — exported for unit tests. */
export function isNetworkStateAllowedForWifiOnlyUpload(state: NetworkState): boolean {
  const type = normalizeNetworkType(state.type);

  if (state.isConnected === false) return false;
  if (!type || type === NetworkStateType.NONE || type === NetworkStateType.UNKNOWN) {
    return false;
  }

  return WIFI_ONLY_ALLOWED_TYPES.has(type);
}

export async function getWifiOnlyUploadEnabled(): Promise<boolean> {
  try {
    const prefs = await getUserPreferences();
    return !!prefs.upload_settings.wifi_only_upload;
  } catch {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.WIFI_ONLY_UPLOAD);
      return raw === 'true';
    } catch {
      return false;
    }
  }
}

export async function setWifiOnlyUploadEnabled(enabled: boolean): Promise<void> {
  await updateUserPreferences({
    upload_settings: {
      ...(await getUserPreferences()).upload_settings,
      wifi_only_upload: enabled,
    },
  });
}

/**
 * When Wi‑Fi Only Upload is enabled, only allow explicitly known Wi‑Fi / Ethernet.
 * Unknown, cellular, VPN, and errors fail closed (block) so mobile data cannot slip through.
 */
export async function isCurrentNetworkAllowedForUpload(
  wifiOnlyEnabled?: boolean,
): Promise<boolean> {
  const enabled =
    typeof wifiOnlyEnabled === 'boolean' ? wifiOnlyEnabled : await getWifiOnlyUploadEnabled();
  if (!enabled) return true;

  try {
    const state = await getNetworkStateAsync();
    return isNetworkStateAllowedForWifiOnlyUpload(state);
  } catch {
    return false;
  }
}

/**
 * Throws when Wi‑Fi Only Upload is enabled and the device is not on Wi‑Fi / Ethernet.
 */
export async function assertUploadAllowedForCurrentNetwork(): Promise<void> {
  const allowed = await isCurrentNetworkAllowedForUpload();
  if (!allowed) {
    throw new Error(WIFI_ONLY_UPLOAD_MESSAGE);
  }
}
