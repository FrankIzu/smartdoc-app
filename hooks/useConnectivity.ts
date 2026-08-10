import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiService as api } from '../services/api';
import { isDeviceOfflineForCalendar } from '../utils/calendarOffline';

const DEFAULT_POLL_MS = 30000;
const UNSTABLE_WINDOW_MS = 60000;
const UNSTABLE_FAILURE_THRESHOLD = 2;

export function useConnectivity(pollIntervalMs = DEFAULT_POLL_MS) {
  const networkState = useNetworkState();
  const deviceOffline = useMemo(
    () => isDeviceOfflineForCalendar(networkState),
    [networkState?.isConnected, networkState?.type, networkState?.isInternetReachable]
  );

  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const recentFailuresRef = useRef<number[]>([]);
  const [failureTick, setFailureTick] = useState(0);

  const checkServerNow = useCallback(async (): Promise<boolean> => {
    if (deviceOffline) {
      setServerReachable(false);
      return false;
    }
    setIsCheckingServer(true);
    try {
      const result = await api.testConnectivity();
      const ok = result.success === true;
      setServerReachable(ok);
      return ok;
    } catch {
      setServerReachable(false);
      return false;
    } finally {
      setIsCheckingServer(false);
    }
  }, [deviceOffline]);

  useEffect(() => {
    if (deviceOffline) {
      setServerReachable(false);
      return;
    }
    void checkServerNow();
    const interval = setInterval(() => void checkServerNow(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [deviceOffline, checkServerNow, pollIntervalMs]);

  const recordNetworkFailure = useCallback(() => {
    const now = Date.now();
    recentFailuresRef.current = [
      ...recentFailuresRef.current.filter((t) => now - t < UNSTABLE_WINDOW_MS),
      now,
    ];
    setFailureTick((t) => t + 1);
  }, []);

  const clearNetworkFailures = useCallback(() => {
    recentFailuresRef.current = [];
    setFailureTick((t) => t + 1);
  }, []);

  const connectionUnstable = useMemo(() => {
    if (deviceOffline || serverReachable === false) return false;
    const now = Date.now();
    const recent = recentFailuresRef.current.filter((t) => now - t < UNSTABLE_WINDOW_MS);
    return recent.length >= UNSTABLE_FAILURE_THRESHOLD;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- failureTick triggers recompute
  }, [deviceOffline, serverReachable, failureTick]);

  const serverUnreachable = !deviceOffline && serverReachable === false;

  return {
    deviceOffline,
    serverUnreachable,
    serverReachable,
    isCheckingServer,
    connectionUnstable,
    checkServerNow,
    recordNetworkFailure,
    clearNetworkFailures,
  };
}
