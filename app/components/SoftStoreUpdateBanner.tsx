import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/Config';
import { useTheme } from '../../contexts/ThemeContext';
import { openStoreUpdatePage, reportUpdateTelemetry, setDismissedStoreUpdateVersion } from '../../services/updateService';

interface SoftStoreUpdateBannerProps {
  message: string;
  storeUrl: string;
  latestVersion?: string;
  onDismiss: () => void;
  /** If set, "Later" will persist dismiss for this version so we don't show again until a newer version exists. */
  persistDismissForVersion?: string;
}

export default function SoftStoreUpdateBanner({
  message,
  storeUrl,
  latestVersion,
  onDismiss,
  persistDismissForVersion,
}: SoftStoreUpdateBannerProps) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const handleUpdate = () => {
    reportUpdateTelemetry('soft_update_tapped', { latestVersion }).catch(() => {});
    openStoreUpdatePage(storeUrl).catch(() => {});
    onDismiss();
  };

  const handleLater = () => {
    if (persistDismissForVersion) {
      setDismissedStoreUpdateVersion(persistDismissForVersion).catch(() => {});
    }
    onDismiss();
  };

  return (
    <View
      style={[
        styles.banner,
        {
          paddingTop: Math.max(insets.top, 8),
          backgroundColor: isDark ? COLORS.primaryDark : COLORS.primary,
        },
      ]}
    >
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.buttonSecondary} onPress={handleLater} activeOpacity={0.8}>
          <Text style={styles.buttonSecondaryText}>Later</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonPrimary} onPress={handleUpdate} activeOpacity={0.8}>
          <Text style={styles.buttonPrimaryText}>Update</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  text: {
    color: COLORS.white,
    fontSize: 14,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-end',
  },
  buttonSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  buttonSecondaryText: {
    color: COLORS.white,
    fontSize: 14,
  },
  buttonPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  buttonPrimaryText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
