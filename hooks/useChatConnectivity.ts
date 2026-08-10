import { useCallback, useEffect, useMemo } from 'react';
import {
  getConnectivityBannerText,
  isComposerSendDisabled,
  promptBeforeSend,
  type ConnectivityGateState,
} from '../utils/chatConnectivityGate';
import { useConnectivity } from './useConnectivity';
import { useDelayedOfflineBanner } from './useDelayedOfflineBanner';

export function useChatConnectivity() {
  const connectivity = useConnectivity();
  const gateState: ConnectivityGateState = useMemo(
    () => ({
      deviceOffline: connectivity.deviceOffline,
      serverUnreachable: connectivity.serverUnreachable,
      connectionUnstable: connectivity.connectionUnstable,
    }),
    [
      connectivity.deviceOffline,
      connectivity.serverUnreachable,
      connectivity.connectionUnstable,
    ]
  );

  const bannerEligible =
    gateState.deviceOffline ||
    gateState.serverUnreachable ||
    gateState.connectionUnstable;

  const { offlineBannerVisible, showOfflineBannerAfterDelay } =
    useDelayedOfflineBanner(bannerEligible);

  useEffect(() => {
    if (bannerEligible) {
      showOfflineBannerAfterDelay();
    }
  }, [bannerEligible, showOfflineBannerAfterDelay]);

  const bannerText = getConnectivityBannerText(gateState);
  const sendDisabled = isComposerSendDisabled(gateState);

  const confirmSend = useCallback(() => promptBeforeSend(gateState), [gateState]);

  return {
    ...connectivity,
    gateState,
    offlineBannerVisible: offlineBannerVisible && bannerText != null,
    bannerText,
    sendDisabled,
    confirmSend,
  };
}
