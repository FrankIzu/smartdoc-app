import { Linking } from 'react-native';
import { apiService } from '../services/api';

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
};

/** Extract session token from grabdocs://login-success?token=... */
export function parseLoginSuccessToken(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'login-success') return null;
    const token = parsed.searchParams.get('token');
    return token?.trim() ? token : null;
  } catch {
    return null;
  }
}

export function isLoginSuccessDeepLink(url: string | null | undefined): boolean {
  return !!parseLoginSuccessToken(url);
}

const exchangeCache = new Map<string, GoogleOAuthExchangeResult>();
const inFlightExchanges = new Map<string, Promise<GoogleOAuthExchangeResult | null>>();

/** Exchange a one-time login token for a JWT + user. Dedupes concurrent and repeat calls for the same token. */
export async function exchangeGoogleLoginToken(
  loginToken: string
): Promise<GoogleOAuthExchangeResult | null> {
  const token = loginToken.trim();
  if (!token) return null;

  const cached = exchangeCache.get(token);
  if (cached) return cached;

  const existing = inFlightExchanges.get(token);
  if (existing) return existing;

  const promise = (async (): Promise<GoogleOAuthExchangeResult | null> => {
    try {
      const result = await apiService.exchangeGoogleOAuthToken(token);
      if (!result.success || !result.user) return null;

      const u = result.user;
      const name =
        [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.email || '';
      const exchanged: GoogleOAuthExchangeResult = {
        user: {
          id: String(u.id),
          email: u.email || '',
          name,
          first_name: u.firstName ?? undefined,
          last_name: u.lastName ?? undefined,
          username: u.username ?? undefined,
        },
        jwt: (result as { token?: string }).token,
      };
      exchangeCache.set(token, exchanged);
      return exchanged;
    } catch {
      return null;
    } finally {
      inFlightExchanges.delete(token);
    }
  })();

  inFlightExchanges.set(token, promise);
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
