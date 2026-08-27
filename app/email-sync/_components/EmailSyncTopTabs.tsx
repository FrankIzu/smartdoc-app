import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../../hooks/useThemeColors';

export type EmailSyncTab = 'setup' | 'replies' | 'imports';

export function EmailSyncTopTabs({
  active,
  pendingCount = 0,
  onChange,
}: {
  active: EmailSyncTab;
  pendingCount?: number;
  onChange: (tab: EmailSyncTab) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          marginHorizontal: 8,
          marginBottom: 4,
        },
        tab: {
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        tabOn: { borderBottomColor: colors.text },
        label: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
        labelOn: { color: colors.text },
        badge: {
          minWidth: 20,
          height: 20,
          paddingHorizontal: 6,
          borderRadius: 10,
          backgroundColor: colors.text,
          alignItems: 'center',
          justifyContent: 'center',
        },
        badgeTxt: { color: colors.background, fontSize: 11, fontWeight: '700' },
      }),
    [colors]
  );

  return (
    <View style={styles.row}>
      <TouchableOpacity style={[styles.tab, active === 'setup' && styles.tabOn]} onPress={() => onChange('setup')}>
        <Text style={[styles.label, active === 'setup' && styles.labelOn]}>Setup</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, active === 'replies' && styles.tabOn]} onPress={() => onChange('replies')}>
        <Text style={[styles.label, active === 'replies' && styles.labelOn]}>Email Replies</Text>
        {pendingCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{pendingCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, active === 'imports' && styles.tabOn]} onPress={() => onChange('imports')}>
        <Text style={[styles.label, active === 'imports' && styles.labelOn]}>Recent imports</Text>
      </TouchableOpacity>
    </View>
  );
}
