/**
 * LimitErrorContext for mobile app.
 * Shows native Alert when API returns limit errors (storage, tokens, meetings, etc.)
 */

import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext } from 'react';
import { Alert, Linking } from 'react-native';
import type { LimitErrorData } from '../utils/limitErrorUtils';

interface LimitErrorContextType {
  showLimitError: (data: LimitErrorData) => void;
}

const LimitErrorContext = createContext<LimitErrorContextType | undefined>(undefined);

const noopShowLimitError = () => {};

export function useLimitError(): LimitErrorContextType {
  const ctx = useContext(LimitErrorContext);
  return ctx ?? { showLimitError: noopShowLimitError };
}

export function LimitErrorProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const showLimitError = useCallback(
    (data: LimitErrorData) => {
      const title = getTitle(data.limitType, data.errorCode);
      const message = data.message;
      const actionUrl = data.actionUrl;

      const buttons: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'View plans',
          onPress: () => {
            Linking.openURL('https://grabdocs.com/pricing').catch(() => {});
          },
        },
      ];

      buttons.unshift({
        text: 'Upgrade Plan',
        onPress: () => {
          if (actionUrl?.startsWith('http')) {
            Linking.openURL(actionUrl).catch(() => {});
            return;
          }
          router.push('/billing' as any);
        },
      });

      Alert.alert(title, message, buttons);
    },
    [router]
  );
  return (
    <LimitErrorContext.Provider value={{ showLimitError }}>
      {children}
    </LimitErrorContext.Provider>
  );
}

function getTitle(limitType?: string, errorCode?: string): string {
  if (errorCode === 'storage_limit_exceeded' || limitType === 'storage') {
    return 'Storage Limit Reached';
  }
  if (
    errorCode === 'insufficient_tokens' ||
    errorCode === 'monthly_token_limit_exceeded' ||
    limitType === 'tokens'
  ) {
    return 'Credit Limit Exceeded';
  }
  if (errorCode === 'meeting_limit_exceeded' || limitType === 'meetings') {
    return 'Meeting Limit Reached';
  }
  if (
    errorCode === 'workspace_limit_exceeded' ||
    errorCode === 'workspace_member_limit_exceeded'
  ) {
    return 'Workspace Limit Reached';
  }
  return 'Limit Reached';
}
