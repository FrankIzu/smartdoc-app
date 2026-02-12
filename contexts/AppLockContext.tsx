import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { deviceSecurityService } from '../services/deviceSecurity';
import { secureStorage } from '../utils/storage';

const APP_LOCK_ENABLED = 'app_lock_enabled';
const APP_LOCK_LAST_BACKGROUNDED = 'app_lock_last_backgrounded';
// const APP_LOCK_PIN = 'app_lock_pin'; // GrabDocs PIN hidden: using phone biometric + device passcode only
const LOCK_AFTER_MINUTES = 10;

interface AppLockContextType {
  isLocked: boolean;
  appLockEnabled: boolean;
  lockAfterMinutes: number;
  hasPinSet: boolean;
  biometricAvailable: boolean;
  setAppLockEnabled: (enabled: boolean) => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  unlock: () => void;
  unlockWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  checkHasPinSet: () => Promise<boolean>;
  checkBiometricAvailable: () => Promise<boolean>;
  /** Clears PIN, disables app lock, and unlocks. Use for "Forgot PIN?" recovery. */
  resetAppLockAndUnlock: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [hasPinSet, setHasPinSet] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const lockAfterMinutes = LOCK_AFTER_MINUTES;
  const backgroundedAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const loadSettings = useCallback(async () => {
    try {
      const enabled = await secureStorage.getItem(APP_LOCK_ENABLED);
      const appLockOn = enabled === 'true';
      setAppLockEnabledState(appLockOn);
      // GrabDocs PIN hidden: no longer read stored PIN
      // const pin = await secureStorage.getItem(APP_LOCK_PIN);
      // setHasPinSet(!!pin && pin.length > 0);
      setHasPinSet(false); // PIN UI hidden; unlock is biometric + device passcode only
      const config = await deviceSecurityService.initializeBiometrics();
      setBiometricAvailable(config.enabled);

      // Android (and sometimes iOS): if app was killed in background, we never get AppState 'background'.
      // Persisted last-backgrounded time lets us lock on cold start when app was backgrounded > lockAfter.
      if (appLockOn) {
        const lastBg = await secureStorage.getItem(APP_LOCK_LAST_BACKGROUNDED);
        if (lastBg) {
          const ts = parseInt(lastBg, 10);
          if (!Number.isNaN(ts)) {
            const elapsed = Date.now() - ts;
            if (elapsed >= LOCK_AFTER_MINUTES * 60 * 1000) {
              setIsLocked(true);
            }
            await secureStorage.removeItem(APP_LOCK_LAST_BACKGROUNDED);
          }
        }
      }
    } catch {
      setAppLockEnabledState(false);
      setHasPinSet(false);
      setBiometricAvailable(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!appLockEnabled) return;

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        const now = Date.now();
        backgroundedAtRef.current = now;
        appStateRef.current = nextAppState;
        // Persist so we can lock on cold start (Android often kills app in background)
        secureStorage.setItem(APP_LOCK_LAST_BACKGROUNDED, String(now)).catch(() => {});
      } else if (nextAppState === 'active') {
        const now = Date.now();
        const elapsed = backgroundedAtRef.current != null ? now - backgroundedAtRef.current : 0;
        const lockAfterMs = lockAfterMinutes * 60 * 1000;
        if (elapsed >= lockAfterMs) {
          setIsLocked(true);
        }
        backgroundedAtRef.current = null;
        appStateRef.current = nextAppState;
        secureStorage.removeItem(APP_LOCK_LAST_BACKGROUNDED).catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [appLockEnabled, lockAfterMinutes]);

  const setAppLockEnabled = useCallback(async (enabled: boolean) => {
    // GrabDocs PIN hidden: require biometric available instead of PIN
    if (enabled) {
      const config = await deviceSecurityService.initializeBiometrics();
      if (!config.enabled) {
        throw new Error('Biometric (Face ID / Touch ID) is required to enable app lock. Set it up in your device Settings.');
      }
    }
    setAppLockEnabledState(enabled);
    await secureStorage.setItem(APP_LOCK_ENABLED, enabled ? 'true' : 'false');
    if (!enabled) setIsLocked(false);
  }, []);

  /* GrabDocs PIN implementation commented out - using phone biometric + device passcode only
  const setPin = useCallback(async (pin: string) => {
    const trimmed = pin.replace(/\D/g, '');
    if (trimmed.length < 4 || trimmed.length > 6) {
      throw new Error('PIN must be 4–6 digits.');
    }
    await secureStorage.setItem(APP_LOCK_PIN, trimmed);
    setHasPinSet(true);
  }, []);

  const removePin = useCallback(async () => {
    await secureStorage.removeItem(APP_LOCK_PIN);
    setHasPinSet(false);
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    const stored = await secureStorage.getItem(APP_LOCK_PIN);
    if (!stored) return false;
    const trimmed = pin.replace(/\D/g, '');
    return trimmed === stored;
  }, []);
  */
  const setPin = useCallback(async (_pin: string) => {
    throw new Error('App lock uses your phone’s biometric or passcode only. PIN is not used.');
  }, []);
  const removePin = useCallback(async () => {}, []);
  const verifyPin = useCallback(async (_pin: string): Promise<boolean> => false, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  const unlockWithBiometric = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const result = await deviceSecurityService.authenticateWithBiometrics('Unlock GrabDocs');
    if (result.success) setIsLocked(false);
    return result;
  }, []);

  const unlockWithPin = useCallback(async (_pin: string): Promise<boolean> => false, []);

  const checkHasPinSet = useCallback(async (): Promise<boolean> => {
    setHasPinSet(false);
    return false;
  }, []);

  const checkBiometricAvailable = useCallback(async (): Promise<boolean> => {
    const config = await deviceSecurityService.initializeBiometrics();
    setBiometricAvailable(config.enabled);
    return config.enabled;
  }, []);

  /* GrabDocs PIN reset - commented out; no app PIN stored
  const resetAppLockAndUnlock = useCallback(async () => {
    await secureStorage.removeItem(APP_LOCK_PIN);
    await secureStorage.setItem(APP_LOCK_ENABLED, 'false');
    setHasPinSet(false);
    setAppLockEnabledState(false);
    setIsLocked(false);
  }, []);
  */
  const resetAppLockAndUnlock = useCallback(async () => {
    await secureStorage.setItem(APP_LOCK_ENABLED, 'false');
    setHasPinSet(false);
    setAppLockEnabledState(false);
    setIsLocked(false);
  }, []);

  const value: AppLockContextType = {
    isLocked,
    appLockEnabled,
    lockAfterMinutes,
    hasPinSet,
    biometricAvailable,
    setAppLockEnabled,
    setPin,
    removePin,
    verifyPin,
    unlock,
    unlockWithBiometric,
    unlockWithPin,
    checkHasPinSet,
    checkBiometricAvailable,
    resetAppLockAndUnlock,
  };

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (ctx === undefined) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}
