import { useCallback, useEffect, useRef, useState } from 'react';
import { OFFLINE_BANNER_DELAY_MS } from '../constants/Config';

/**
 * `isOffline` stays immediate (queue saves, empty-state copy). Banner visibility is delayed
 * for transient failures so a quick retry does not flash the bar.
 */
export function useDelayedOfflineBanner(isOffline: boolean) {
  const [offlineBannerVisible, setOfflineBannerVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerShownRef = useRef(false);

  useEffect(() => {
    if (!isOffline) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      bannerShownRef.current = false;
      setOfflineBannerVisible(false);
    }
  }, [isOffline]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showOfflineBannerAfterDelay = useCallback(() => {
    if (bannerShownRef.current) return;
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      bannerShownRef.current = true;
      setOfflineBannerVisible(true);
    }, OFFLINE_BANNER_DELAY_MS);
  }, []);

  const showOfflineBannerNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    bannerShownRef.current = true;
    setOfflineBannerVisible(true);
  }, []);

  return { offlineBannerVisible, showOfflineBannerAfterDelay, showOfflineBannerNow };
}
