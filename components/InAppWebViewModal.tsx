import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { secureStorage } from '../utils/storage';
import MinimizableBottomSheet from './MinimizableBottomSheet';

export function isApiBaseUrl(targetUrl: string): boolean {
  try {
    const api = new URL(API_BASE_URL);
    const u = new URL(targetUrl);
    const apiPort = api.port || (api.protocol === 'https:' ? '443' : '80');
    const uPort = u.port || (u.protocol === 'https:' ? '443' : '80');
    return api.protocol === u.protocol && api.hostname === u.hostname && apiPort === uPort;
  } catch {
    return false;
  }
}

export function shouldUseExternalLinking(url: string): boolean {
  const t = (url || '').trim().toLowerCase();
  return (
    t.startsWith('mailto:') ||
    t.startsWith('tel:') ||
    t.startsWith('sms:') ||
    t.startsWith('geo:') ||
    t.startsWith('whatsapp:')
  );
}

export interface InAppWebViewModalProps {
  visible: boolean;
  url: string;
  title?: string;
  onClose: () => void;
  /** Bump on every open so a minimized sheet expands again. */
  expandNonce?: number;
}

export default function InAppWebViewModal({
  visible,
  url,
  title = 'Link',
  onClose,
  expandNonce = 0,
}: InAppWebViewModalProps) {
  const { height } = useWindowDimensions();
  const sheetHeight = Math.round(height * 0.9);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!visible || !url) {
      setReady(false);
      return;
    }
    if (!isApiBaseUrl(url)) {
      setToken(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN).then((t) => {
      if (!cancelled) {
        setToken(t);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, url]);

  const injectAuth = useMemo(() => isApiBaseUrl(url), [url]);

  const source = useMemo(() => {
    if (!url) return { uri: '' };
    if (injectAuth && token) {
      return { uri: url, headers: { Authorization: `Bearer ${token}` } };
    }
    return { uri: url };
  }, [url, injectAuth, token]);

  const webKey = `${url}|${injectAuth ? token || '' : 'public'}`;

  if (!visible || !url) return null;

  return (
    <MinimizableBottomSheet
      visible={visible}
      onClose={onClose}
      expandNonce={expandNonce}
      sheetHeight={sheetHeight}
      renderHeader={({ minimized, onMinimize, onExpand, onClose: closeSheet }) => (
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.headerActions}>
            {minimized ? (
              <Pressable onPress={onExpand} hitSlop={12} accessibilityRole="button">
                <Text style={styles.linkClose}>Expand</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onMinimize} hitSlop={12} accessibilityRole="button">
                <Text style={styles.linkClose}>Minimize</Text>
              </Pressable>
            )}
            <Pressable onPress={closeSheet} hitSlop={12} accessibilityRole="button">
              <Text style={styles.linkClose}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}
    >
      {!ready ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <WebView
          key={webKey}
          source={source}
          style={styles.web}
          originWhitelist={['*']}
          scalesPageToFit
          startInLoadingState
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />
      )}
    </MinimizableBottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 8 },
  linkClose: { color: '#007AFF', fontSize: 16 },
  web: { flex: 1, width: '100%', backgroundColor: '#fff' },
  loading: {
    flex: 1,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
