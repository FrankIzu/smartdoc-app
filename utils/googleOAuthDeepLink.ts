import { Linking } from 'react-native';
import { apiService } from '../services/api';
import { persistMobileAuthTokens } from './authTokenStorage';

export type GoogleOAuthExchangeUser = {
  id: string;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type GoogleOAuthExchangeResult = {
  user: GoogleOAuthExchangeUser;
  jwt?: string;
  refreshToken?: string;
};

/**
 * Extract the one-time OAuth exchange code from grabdocs://login-success?code=...
 * Backend sends `code` (opaque exchange token, not a JWT). Legacy `token=` is still accepted.
 */
export function parseLoginSuccessExchangeCode(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'login-success') return null;
    const code = parsed.searchParams.get('code');
    if (code?.trim()) return code.trim();
    const legacyToken = parsed.searchParams.get('token');
    return legacyToken?.trim() ? legacyToken.trim() : null;
  } catch {
    return null;
  }
}

/** @deprecated Use parseLoginSuccessExchangeCode — kept for existing call sites. */
export function parseLoginSuccessToken(url: string | null | undefined): string | null {
  return parseLoginSuccessExchangeCode(url);
}

export function isLoginSuccessDeepLink(url: string | null | undefined): boolean {
  return !!parseLoginSuccessExchangeCode(url);
}

const exchangeCache = new Map<string, GoogleOAuthExchangeResult>();
const inFlightExchanges = new Map<string, Promise<GoogleOAuthExchangeResult | null>>();

/** Exchange a one-time login code for access + refresh tokens. Dedupes concurrent calls. */
export async function exchangeGoogleLoginToken(
  exchangeCode: string
): Promise<GoogleOAuthExchangeResult | null> {
  const code = exchangeCode.trim();
  if (!code) return null;

  const cached = exchangeCache.get(code);
  if (cached) return cached;

  const existing = inFlightExchanges.get(code);
  if (existing) return existing;

  const promise = (async (): Promise<GoogleOAuthExchangeResult | null> => {
    try {
      const result = await apiService.exchangeGoogleOAuthToken(code);
      if (!result.success || !result.user) return null;

      const u = result.user;
      const name =
        [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.email || '';
      const accessToken = result.token || result.access_token;
      const refreshToken = result.refresh_token;

      if (accessToken || refreshToken) {
        await persistMobileAuthTokens({
          token: accessToken,
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }

      const exchanged: GoogleOAuthExchangeResult = {
        user: {
          id: String(u.id),
          email: u.email || '',
          name,
          first_name: u.firstName ?? undefined,
          last_name: u.lastName ?? undefined,
          username: u.username ?? undefined,
        },
        jwt: accessToken,
        refreshToken,
      };
      exchangeCache.set(code, exchanged);
      return exchanged;
    } catch {
      return null;
    } finally {
      inFlightExchanges.delete(code);
    }
  })();

  inFlightExchanges.set(code, promise);
  return promise;
}

/**
 * Listen for grabdocs://login-success while a Chrome Custom Tab OAuth session is open.
 * On Android the URL often fires before openAuthSessionAsync resolves with { type: 'dismiss' },
 * so the listener must be active during the session — not after it closes.
 */
export function createLoginSuccessDeepLinkCapture(): {
  getCapturedUrl: () => string | null;
  stop: () => void;
} {
  let capturedUrl: string | null = null;

  const sub = Linking.addEventListener('url', ({ url }) => {
    if (isLoginSuccessDeepLink(url)) {
      capturedUrl = url;
    }
  });

  void Linking.getInitialURL().then((url) => {
    if (isLoginSuccessDeepLink(url)) {
      capturedUrl = url;
    }
  });

  return {
    getCapturedUrl: () => capturedUrl,
    stop: () => sub.remove(),
  };
}
