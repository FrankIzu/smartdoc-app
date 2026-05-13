import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';
import { calendarGoogleConnectUrl } from '../../../services/calendarApi';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/**
 * Headless component: opens Google OAuth in the system browser immediately
 * when `visible` becomes true — no intermediate screen shown.
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
        const authUrl = await calendarGoogleConnectUrl();
        if (!active) return;
        await WebBrowser.openBrowserAsync(authUrl);
        if (!active) return;
        ok();
        close();
      } catch (e: unknown) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : 'Could not start Google sign-in';
        err(msg);
        close();
      }
    };

    run();

    return () => { active = false; };
  }, [visible]);

  return null;
}
