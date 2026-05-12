import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { API_BASE_URL, STORAGE_KEYS } from '../../../constants/Config';
import { secureStorage } from '../../../utils/storage';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function CalendarOAuthWebView({ visible, onClose, onSuccess, onError }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const path = '/api/v1/calendar/google/connect';

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (!cancelled) setToken(t && t !== 'session_token' ? t : null);
      } catch {
        if (!cancelled) setToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const uri = `${API_BASE_URL.replace(/\/$/, '')}${path}`;

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Connect Google Calendar</Text>
          <View style={{ width: 48 }} />
        </View>
        {!token ? (
          <View style={styles.center}>
            <Text style={styles.err}>Sign in again to connect your calendar.</Text>
          </View>
        ) : (
          <WebView
            source={{ uri, headers: { Authorization: `Bearer ${token}` } }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.center}>
                <ActivityIndicator size="large" />
              </View>
            )}
            onNavigationStateChange={(nav) => {
              const u = nav.url || '';
              if (u.includes('calendar?connected=google')) {
                onSuccess();
                onClose();
              }
              if (u.includes('/calendar?error=') || u.includes('calendar?error=')) {
                onError('Calendar connection failed');
                onClose();
              }
            }}
            onError={() => {
              onError('Could not load connection page');
              onClose();
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  title: { fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  close: { color: '#007AFF', fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  err: { textAlign: 'center', color: '#666' },
});
