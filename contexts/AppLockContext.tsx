import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { deviceSecurityService } from '../services/deviceSecurity';
import { secureStorage } from '../utils/storage';

const APP_LOCK_ENABLED = 'app_lock_enabled';
const APP_LOCK_PIN = 'app_lock_pin';
const LOCK_AFTER_MINUTES = 5;

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
      setAppLockEnabledState(enabled === 'true');
      const pin = await secureStorage.getItem(APP_LOCK_PIN);
      setHasPinSet(!!pin && pin.length > 0);
      const config = await deviceSecurityService.initializeBiometrics();
      setBiometricAvailable(config.enabled);
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
        backgroundedAtRef.current = Date.now();
        appStateRef.current = nextAppState;
      } else if (nextAppState === 'active') {
        const now = Date.now();
        const elapsed = backgroundedAtRef.current != null ? now - backgroundedAtRef.current : 0;
        const lockAfterMs = lockAfterMinutes * 60 * 1000;
        if (elapsed >= lockAfterMs) {
          setIsLocked(true);
        }
        backgroundedAtRef.current = null;
        appStateRef.current = nextAppState;
      }
    });

    return () => subscription.remove();
  }, [appLockEnabled, lockAfterMinutes]);

  const setAppLockEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const pin = await secureStorage.getItem(APP_LOCK_PIN);
      if (!pin || pin.length < 4) {
        throw new Error('Set a PIN first (4–6 digits) in Settings before enabling app lock.');
      }
    }
    setAppLockEnabledState(enabled);
    await secureStorage.setItem(APP_LOCK_ENABLED, enabled ? 'true' : 'false');
    if (!enabled) setIsLocked(false);
  }, []);

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

  const unlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  const unlockWithBiometric = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const result = await deviceSecurityService.authenticateWithBiometrics('Unlock GrabDocs');
    if (result.success) setIsLocked(false);
    return result;
  }, []);

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const ok = await verifyPin(pin);
    if (ok) setIsLocked(false);
    return ok;
  }, [verifyPin]);

  const checkHasPinSet = useCallback(async (): Promise<boolean> => {
    const pin = await secureStorage.getItem(APP_LOCK_PIN);
    const set = !!(pin && pin.length >= 4);
    setHasPinSet(set);
    return set;
  }, []);

  const checkBiometricAvailable = useCallback(async (): Promise<boolean> => {
    const config = await deviceSecurityService.initializeBiometrics();
    setBiometricAvailable(config.enabled);
    return config.enabled;
  }, []);

  const resetAppLockAndUnlock = useCallback(async () => {
    await secureStorage.removeItem(APP_LOCK_PIN);
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
