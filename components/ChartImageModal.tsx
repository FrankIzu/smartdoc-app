import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { secureStorage } from '../utils/storage';

export interface ChartImageModalProps {
  visible: boolean;
  chartFileId: number;
  title?: string;
  onClose: () => void;
}

/**
 * Same as web upload.tsx chart modal: GET /api/v1/web/files/{id}/view returns chart image (Bearer auth on mobile).
 */
export default function ChartImageModal({
  visible,
  chartFileId,
  title = 'Chart',
  onClose,
}: ChartImageModalProps) {
  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (visible) {
      secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN).then(setToken);
    }
  }, [visible]);

  const uri = `${API_BASE_URL}/api/v1/web/files/${chartFileId}/view`;

  if (!visible || !chartFileId) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <WebView
            source={{
              uri,
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }}
            style={styles.web}
            scalesPageToFit
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  close: { color: '#007AFF', fontSize: 16 },
  web: { height: 360, width: '100%' },
});
