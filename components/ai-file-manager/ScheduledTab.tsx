import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { UseAiFileManagerReturn } from '../../hooks/useAiFileManager';

interface Props {
  fm: UseAiFileManagerReturn;
}

export default function ScheduledTab({ fm }: Props) {
  const colors = useThemeColors();

  if (fm.scheduled.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: colors.textSecondary }}>No scheduled jobs.</Text>
        <TouchableOpacity onPress={() => void fm.refreshScheduled()} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.primary }}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={fm.scheduled}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      onRefresh={() => void fm.refreshScheduled()}
      refreshing={false}
      renderItem={({ item }) => {
        const paused = item.status === 'paused';
        return (
          <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.query, { color: colors.text }]} numberOfLines={2}>
              {item.query || `Job #${item.id}`}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {item.status} · {item.next_run_at ?? '—'}
            </Text>
            <View style={styles.actions}>
              {paused ? (
                <TouchableOpacity onPress={() => void fm.resumeScheduled(item.id)}>
                  <Text style={{ color: colors.primary }}>Resume</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => void fm.pauseScheduled(item.id)}>
                  <Text style={{ color: colors.primary }}>Pause</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => void fm.cancelScheduled(item.id)}>
                <Text style={{ color: '#b91c1c' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  query: { fontSize: 15, fontWeight: '500', marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
