import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/Config';
import { useTheme } from '../../contexts/ThemeContext';
import { openStoreUpdatePage } from '../../services/updateService';

interface UpdateRequiredScreenProps {
  storeUrl: string;
  message?: string;
}

export default function UpdateRequiredScreen({ storeUrl, message }: UpdateRequiredScreenProps) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const openStore = () => {
    openStoreUpdatePage(storeUrl).catch(() => {});
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? COLORS.backgroundDark : COLORS.background }]}>
      <Text style={[styles.title, { color: isDark ? COLORS.textDark : COLORS.text }]}>
        Update required
      </Text>
      <Text style={[styles.message, { color: isDark ? COLORS.textDark : COLORS.textSecondary }]}>
        {message ?? 'A new version of GrabDocs is available. Please update from the store to continue.'}
      </Text>
      <TouchableOpacity style={styles.button} onPress={openStore} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Update</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
