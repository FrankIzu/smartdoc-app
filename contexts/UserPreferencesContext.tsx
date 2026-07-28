import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_USER_PREFERENCES,
  getUserPreferences,
  saveUserPreferences,
  subscribeUserPreferences,
  type UserPreferences,
} from '../utils/userPreferences';

interface UserPreferencesContextType {
  preferences: UserPreferences;
  loading: boolean;
  setPreferences: (prefs: UserPreferences) => Promise<void>;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  togglePreference: (key: string, value: boolean) => Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(
  undefined,
);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<UserPreferences>(
    DEFAULT_USER_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const prefs = await getUserPreferences();
        if (mounted) setPreferencesState(prefs);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const unsub = subscribeUserPreferences((prefs) => {
      setPreferencesState(prefs);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const setPreferences = useCallback(async (prefs: UserPreferences) => {
    const saved = await saveUserPreferences(prefs);
    setPreferencesState(saved);
  }, []);

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      const next: UserPreferences = {
        ...preferences,
        ...patch,
        notifications: { ...preferences.notifications, ...(patch.notifications || {}) },
        file_management: {
          ...preferences.file_management,
          ...(patch.file_management || {}),
        },
        upload_settings: {
          ...preferences.upload_settings,
          ...(patch.upload_settings || {}),
          allowed_file_types:
            patch.upload_settings?.allowed_file_types ??
            preferences.upload_settings.allowed_file_types,
        },
        privacy: { ...preferences.privacy, ...(patch.privacy || {}) },
        display: { ...preferences.display, ...(patch.display || {}) },
      };
      await setPreferences(next);
    },
    [preferences, setPreferences],
  );

  const togglePreference = useCallback(
    async (key: string, value: boolean) => {
      if (!key.includes('.')) return;
      const [parent, child] = key.split('.');
      const section = (preferences as any)[parent];
      if (!section || typeof section !== 'object') return;
      await updatePreferences({
        [parent]: {
          ...section,
          [child]: value,
        },
      } as Partial<UserPreferences>);
    },
    [preferences, updatePreferences],
  );

  const value = useMemo(
    () => ({
      preferences,
      loading,
      setPreferences,
      updatePreferences,
      togglePreference,
    }),
    [preferences, loading, setPreferences, updatePreferences, togglePreference],
  );

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
}
