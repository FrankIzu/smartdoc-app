import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { secureStorage } from '../utils/storage';

/** Same host + port as API → send Bearer on first request (masked view, other API pages in WebView). */
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
}

/**
 * Opens arbitrary http(s) links inside the app so users are not kicked to Safari/Chrome
 * (where API links would lack auth cookies). API host requests reuse the mobile Bearer token.
 */
export default function InAppWebViewModal({
  visible,
  url,
  title = 'Link',
  onClose,
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { height: sheetHeight }]} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  title: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 8 },
  close: { color: '#007AFF', fontSize: 16 },
  web: { flex: 1, width: '100%', backgroundColor: '#fff' },
  loading: {
    flex: 1,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
