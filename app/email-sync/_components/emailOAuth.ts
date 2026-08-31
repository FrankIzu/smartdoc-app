import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import { inboxConnectUrl } from '../../../services/emailSyncApi';
import { emailSyncMarkOAuthCompleted } from './emailSyncCache';

export const EMAIL_OAUTH_RETURN = 'grabdocs://email-oauth';

export function parseEmailOAuthReturnUrl(
  url: string
): { result: 'success' } | { result: 'error'; reason: string } | null {
  if (!url.startsWith(EMAIL_OAUTH_RETURN)) return null;
  const q = url.includes('?') ? url.split('?')[1] ?? '' : '';
  const params = new URLSearchParams(q);
  const r = params.get('result');
  if (r === 'success') return { result: 'success' };
  if (r === 'error') {
    const reason = params.get('reason') || 'unknown';
    try {
      return { result: 'error', reason: decodeURIComponent(reason) };
    } catch {
      return { result: 'error', reason };
    }
  }
  return null;
}

/**
 * On Android the grabdocs:// return URL often fires before openAuthSessionAsync resolves
 * with `{ type: 'dismiss' }`, so listen while the session is open.
 */
function captureEmailOAuthReturn(): { get: () => string | null; stop: () => void } {
  let captured: string | null = null;
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (url.startsWith(EMAIL_OAUTH_RETURN)) captured = url;
  });
  return {
    get: () => captured,
    stop: () => sub.remove(),
  };
}

export async function openEmailInboxOAuth(
  provider: 'gmail' | 'outlook',
  workspaceId: number
): Promise<{ result: 'success' } | { result: 'error'; reason: string } | { result: 'cancel' }> {
  WebBrowser.maybeCompleteAuthSession();
  const capture = captureEmailOAuthReturn();
  try {
    const authUrl = await inboxConnectUrl(provider, workspaceId);
    const result = await WebBrowser.openAuthSessionAsync(authUrl, EMAIL_OAUTH_RETURN);
    const url = result.type === 'success' && result.url ? result.url : capture.get();
    if (url) {
      const parsed = parseEmailOAuthReturnUrl(url);
      if (parsed) {
        if (parsed.result === 'success') emailSyncMarkOAuthCompleted();
        return parsed;
      }
    }
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { result: 'cancel' };
    }
    return { result: 'error', reason: 'unknown' };
  } finally {
    capture.stop();
  }
}
