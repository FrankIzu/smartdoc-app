import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../app/context/auth';
import { wizardSourcesStorageKey } from '../services/userScopedCache';
import type { WizardSourceDraft, WizardStep } from '../types/signature';

export function useEnvelopeDraft() {
  const { user } = useAuth();
  const userId = user?.id;

  const saveWizardSources = async (sources: WizardSourceDraft[]) => {
    const key = wizardSourcesStorageKey(userId);
    if (!key) return;
    await AsyncStorage.setItem(key, JSON.stringify(sources));
  };

  const loadWizardSources = async (): Promise<WizardSourceDraft[]> => {
    try {
      const key = wizardSourcesStorageKey(userId);
      if (!key) return [];
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as WizardSourceDraft[]) : [];
    } catch {
      return [];
    }
  };

  const clearWizardSources = async () => {
    const key = wizardSourcesStorageKey(userId);
    if (!key) return;
    await AsyncStorage.removeItem(key);
  };

  return { saveWizardSources, loadWizardSources, clearWizardSources };
}

export type { WizardStep, WizardSourceDraft };
