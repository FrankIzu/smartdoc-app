jest.mock('expo-network', () => ({
  NetworkStateType: {
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
    CELLULAR: 'CELLULAR',
    WIFI: 'WIFI',
    BLUETOOTH: 'BLUETOOTH',
    ETHERNET: 'ETHERNET',
    WIMAX: 'WIMAX',
    VPN: 'VPN',
    OTHER: 'OTHER',
  },
  getNetworkStateAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../../constants/Config', () => ({
  STORAGE_KEYS: { WIFI_ONLY_UPLOAD: 'wifi_only_upload', USER_PREFERENCES: 'user_preferences' },
}));

jest.mock('../userPreferences', () => ({
  getUserPreferences: jest.fn(),
  updateUserPreferences: jest.fn(),
}));

import { NetworkStateType } from 'expo-network';
import { isNetworkStateAllowedForWifiOnlyUpload } from '../wifiOnlyUpload';

describe('isNetworkStateAllowedForWifiOnlyUpload', () => {
  test('allows Wi‑Fi', () => {
    expect(
      isNetworkStateAllowedForWifiOnlyUpload({
        type: NetworkStateType.WIFI,
        isConnected: true,
      }),
    ).toBe(true);
  });

  test('allows Ethernet', () => {
    expect(
      isNetworkStateAllowedForWifiOnlyUpload({
        type: NetworkStateType.ETHERNET,
        isConnected: true,
      }),
    ).toBe(true);
  });

  test('blocks cellular / mobile data', () => {
    expect(
      isNetworkStateAllowedForWifiOnlyUpload({
        type: NetworkStateType.CELLULAR,
        isConnected: true,
      }),
    ).toBe(false);
  });

  test('blocks unknown and empty network state (fail closed)', () => {
    expect(isNetworkStateAllowedForWifiOnlyUpload({})).toBe(false);
    expect(
      isNetworkStateAllowedForWifiOnlyUpload({
        type: NetworkStateType.UNKNOWN,
        isConnected: true,
      }),
    ).toBe(false);
    expect(
      isNetworkStateAllowedForWifiOnlyUpload({
        isConnected: true,
      }),
    ).toBe(false);
  });

  test('blocks when disconnected', () => {
    expect(
      isNetworkStateAllowedForWifiOnlyUpload({
        type: NetworkStateType.WIFI,
        isConnected: false,
      }),
    ).toBe(false);
  });

  test('blocks VPN and other metered/ambiguous types', () => {
    expect(
      isNetworkStateAllowedForWifiOnlyUpload({
        type: NetworkStateType.VPN,
        isConnected: true,
      }),
    ).toBe(false);
    expect(
      isNetworkStateAllowedForWifiOnlyUpload({
        type: NetworkStateType.OTHER,
        isConnected: true,
      }),
    ).toBe(false);
  });
});
