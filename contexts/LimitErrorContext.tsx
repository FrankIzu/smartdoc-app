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
      const actionUrl = data.actionUrl || '/settings?tab=billing';

      const buttons: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
        { text: 'Dismiss', style: 'cancel' },
      ];

      // Add Upgrade button - open billing/settings
      const openBilling = () => {
        if (actionUrl.startsWith('http')) {
          Linking.openURL(actionUrl).catch(() => {});
        } else {
          // In-app route: /settings?tab=billing -> (tabs)/settings with tab
          router.push('/(tabs)/settings');
        }
      };

      buttons.unshift({
        text: 'Upgrade Plan',
        onPress: openBilling,
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
