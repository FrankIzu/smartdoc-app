import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GoogleLogo } from '../../../components/GoogleLogo';
import { MicrosoftLogo } from '../../../components/MicrosoftLogo';
import type { CalendarConnection } from '../../../services/calendarApi';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { calendarConnectionProvider, connectionDisplayLabel, isActiveCalendarConnection } from '../../../utils/calendarConnections';

type Props = {
  connections: CalendarConnection[];
  canConnectMore: boolean;
  onSetDefault: (connectionId: number) => void;
  onDisconnect: (connection: CalendarConnection) => void;
  onAddAnother: () => void;
};

export function ConnectionChips({
  connections,
  canConnectMore,
  onSetDefault,
  onDisconnect,
  onAddAnother,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { marginBottom: 10, paddingHorizontal: 14 },
        scroll: { gap: 8, paddingRight: 8, alignItems: 'center' },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 999,
          borderWidth: 1,
          paddingLeft: 10,
          paddingVertical: 6,
          maxWidth: 220,
        },
        chipDefault: {
          backgroundColor: '#007AFF18',
          borderColor: '#007AFF',
        },
        chipNormal: {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        chipLabel: { fontSize: 12, fontWeight: '600', color: colors.text, marginLeft: 6, flexShrink: 1 },
        chipLabelDefault: { color: '#007AFF' },
        paused: { fontSize: 11, color: '#d97706', marginLeft: 4 },
        disconnect: { paddingHorizontal: 8, paddingVertical: 4 },
        add: { paddingVertical: 6, paddingHorizontal: 4 },
        addTxt: { fontSize: 12, fontWeight: '600', color: '#007AFF' },
      }),
    [colors]
  );

  if (connections.length === 0) return null;

  return (
    <View style={styles.row}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {connections.map((connection) => {
          const provider = calendarConnectionProvider(connection);
          const label = connectionDisplayLabel(connection);
          const isDefault = !!connection.is_default;
          const isActive = isActiveCalendarConnection(connection);
          return (
            <View
              key={String(connection.id)}
              style={[styles.chip, isDefault ? styles.chipDefault : styles.chipNormal]}
            >
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}
                onPress={() => {
                  if (!isDefault && isActive) onSetDefault(connection.id);
                }}
                disabled={isDefault || !isActive}
                accessibilityRole="button"
                accessibilityLabel={
                  isDefault ? `${label}, default calendar` : `Set ${label} as default`
                }
              >
                {provider === 'google' ? (
                  <GoogleLogo size={14} />
                ) : provider === 'microsoft' ? (
                  <MicrosoftLogo size={14} />
                ) : (
                  <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                )}
                <Text
                  style={[styles.chipLabel, isDefault && styles.chipLabelDefault]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                {isDefault ? (
                  <Ionicons name="checkmark-circle" size={14} color="#007AFF" style={{ marginLeft: 4 }} />
                ) : null}
                {!isActive ? <Text style={styles.paused}>· paused</Text> : null}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.disconnect}
                onPress={() => onDisconnect(connection)}
                accessibilityRole="button"
                accessibilityLabel={`Disconnect ${label}`}
              >
                <Ionicons name="close" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          );
        })}
        {canConnectMore ? (
          <TouchableOpacity style={styles.add} onPress={onAddAnother} accessibilityRole="button">
            <Text style={styles.addTxt}>+ Add another</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}
