import { NetworkState, NetworkStateType } from 'expo-network';

/** Treat as offline when we should not rely on API calls (calendar reads use disk instead). */
export function isDeviceOfflineForCalendar(state: NetworkState | null | undefined): boolean {
  if (!state) return false;
  if (state.isConnected === false) return true;
  if (state.type === NetworkStateType.NONE) return true;
  if (state.isInternetReachable === false) return true;
  return false;
}
