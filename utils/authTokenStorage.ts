import { STORAGE_KEYS } from '../constants/Config';
import { secureStorage } from './storage';

export type MobileAuthTokenPayload = {
  token?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
};

/** Persist access + refresh tokens from any mobile auth response (login, refresh, OAuth exchange). */
export async function persistMobileAuthTokens(payload: MobileAuthTokenPayload): Promise<void> {
  const access = (payload.access_token || payload.token || '').trim();
  if (access) {
    await secureStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, access);
  } else if (payload.token === null || payload.access_token === null) {
    await secureStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  }

  const refresh = (payload.refresh_token || '').trim();
  if (refresh) {
    await secureStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh);
  } else if (payload.refresh_token === null) {
    await secureStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  }
}

export async function getStoredRefreshToken(): Promise<string | null> {
  const raw = await secureStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  return raw?.trim() ? raw.trim() : null;
}

export async function clearMobileAuthTokens(): Promise<void> {
  await secureStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  await secureStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
}
