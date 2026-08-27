import * as WebBrowser from 'expo-web-browser';
import { inboxConnectUrl } from '../../../services/emailSyncApi';

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

export async function openEmailInboxOAuth(
  provider: 'gmail' | 'outlook',
  workspaceId: number
): Promise<{ result: 'success' } | { result: 'error'; reason: string } | { result: 'cancel' }> {
  WebBrowser.maybeCompleteAuthSession();
  const authUrl = await inboxConnectUrl(provider, workspaceId);
  const result = await WebBrowser.openAuthSessionAsync(authUrl, EMAIL_OAUTH_RETURN);
  if (result.type === 'success' && result.url) {
    const parsed = parseEmailOAuthReturnUrl(result.url);
    if (parsed) return parsed;
  }
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { result: 'cancel' };
  }
  return { result: 'error', reason: 'unknown' };
}
