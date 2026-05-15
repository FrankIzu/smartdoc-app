import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';
import { calendarGoogleConnectUrl } from '../../../services/calendarApi';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/** Must match backend `google_calendar_callback` mobile return URL (see calendar_api.py). */
const CALENDAR_OAUTH_RETURN = 'grabdocs://calendar-oauth';

function parseCalendarOAuthReturnUrl(url: string): { result: 'success' } | { result: 'error'; reason: string } | null {
  if (!url.startsWith(CALENDAR_OAUTH_RETURN)) {
    return null;
  }
  const q = url.includes('?') ? url.split('?')[1] ?? '' : '';
  const params = new URLSearchParams(q);
  const r = params.get('result');
  if (r === 'success') {
    return { result: 'success' };
  }
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
 * Opens Google Calendar OAuth in the browser and completes the session when the backend
 * redirects to grabdocs:// — same pattern as main Google login (HTTPS callback → app deep link).
 */
export function CalendarOAuthWebView({ visible, onClose, onSuccess, onError }: Props) {
  const handlersRef = useRef({ onSuccess, onError, onClose });
  handlersRef.current = { onSuccess, onError, onClose };

  useEffect(() => {
    if (!visible) return;
    let active = true;

    const run = async () => {
      const { onSuccess: ok, onError: err, onClose: close } = handlersRef.current;
      try {
        WebBrowser.maybeCompleteAuthSession();

        const authUrl = await calendarGoogleConnectUrl();
        if (!active) return;

        const result = await WebBrowser.openAuthSessionAsync(authUrl, CALENDAR_OAUTH_RETURN);
        if (!active) return;

        if (result.type === 'success' && result.url) {
          const parsed = parseCalendarOAuthReturnUrl(result.url);
          if (parsed?.result === 'success') {
            ok();
            close();
            return;
          }
          if (parsed?.result === 'error') {
            err(parsed.reason.replace(/_/g, ' ') || 'Could not connect Google Calendar');
            close();
            return;
          }
        }

        if (result.type === 'cancel' || result.type === 'dismiss') {
          close();
          return;
        }

        close();
      } catch (e: unknown) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : 'Could not start Google sign-in';
        err(msg);
        close();
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [visible]);

  return null;
}
