import { useTheme } from '../../contexts/ThemeContext';
import { COLORS } from '../../constants/Config';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reloadToApplyUpdate } from '../../services/updateService';

export default function OtaUpdateBanner() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.banner, { paddingTop: Math.max(insets.top, 8), backgroundColor: isDark ? COLORS.primaryDark : COLORS.primary }]}>
      <Text style={styles.text}>An update is ready. Restart to apply.</Text>
      <TouchableOpacity style={styles.button} onPress={() => reloadToApplyUpdate()} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Restart</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
  },
  text: {
    color: COLORS.white,
    fontSize: 14,
    flex: 1,
  },
  button: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
