import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { UseAiFileManagerReturn } from '../../hooks/useAiFileManager';
import type { HistoryRow } from '../../types/aiFileManager';

interface Props {
  fm: UseAiFileManagerReturn;
  onResume?: () => void;
}

function HistoryRowItem({
  row,
  fm,
  onResume,
}: {
  row: HistoryRow;
  fm: UseAiFileManagerReturn;
  onResume?: () => void;
}) {
  const colors = useThemeColors();
  const pending = fm.isPendingHistoryStatus(row.status);
  const completed = fm.isCompletedHistoryStatus(row.status);

  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.query, { color: colors.text }]} numberOfLines={2}>
        {row.query || `Run #${row.id}`}
      </Text>
      <Text style={[styles.status, { color: colors.textSecondary }]}>{row.status ?? 'unknown'}</Text>
      <View style={styles.actions}>
        {pending && row.execution_token ? (
          <TouchableOpacity
            onPress={() => {
              fm.resumeFromHistory(row);
              onResume?.();
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Resume</Text>
          </TouchableOpacity>
        ) : null}
        {completed ? (
          <TouchableOpacity onPress={() => void fm.undoHistory(row.id)}>
            <Text style={{ color: colors.primary }}>Undo</Text>
          </TouchableOpacity>
        ) : null}
        {pending ? (
          <TouchableOpacity onPress={() => void fm.abandonHistory(row.id)}>
            <Text style={{ color: colors.textSecondary }}>Abandon</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => void fm.deleteHistoryRow(row.id)}>
          <Text style={{ color: colors.textSecondary }}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HistoryTab({ fm, onResume }: Props) {
  const colors = useThemeColors();

  if (fm.history.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: colors.textSecondary }}>No history yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={fm.history}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshing={false}
      onRefresh={() => void fm.refreshHistory()}
      renderItem={({ item }) => <HistoryRowItem row={item} fm={fm} onResume={onResume} />}
      ListHeaderComponent={
        <TouchableOpacity onPress={() => void fm.refreshHistory()} style={styles.refresh}>
          <Text style={{ color: colors.primary }}>Refresh</Text>
        </TouchableOpacity>
      }
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
  status: { fontSize: 12, marginBottom: 8, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  refresh: { alignSelf: 'flex-end', marginBottom: 8 },
});
