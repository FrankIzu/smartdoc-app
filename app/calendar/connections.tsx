import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  calendarConnections,
  calendarDeleteConnection,
  calendarResetConnection,
  calendarSyncGoogle,
} from '../../services/calendarApi';
import { CalendarOAuthWebView } from './components/CalendarOAuthWebView';

export default function CalendarConnectionsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<any[]>([]);
  const [oauthOpen, setOauthOpen] = useState(false);

  const load = useCallback(async () => {
    const c = await calendarConnections();
    setList(c);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', padding: 12 },
        h1: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 },
        card: {
          margin: 16,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        row: { marginBottom: 14 },
        name: { fontWeight: '600', color: colors.text },
        meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
        btn: {
          backgroundColor: '#007AFF',
          padding: 14,
          borderRadius: 10,
          marginHorizontal: 16,
          marginBottom: 10,
          alignItems: 'center',
        },
        btnText: { color: '#fff', fontWeight: '600' },
        secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        danger: { backgroundColor: '#ef4444' },
      }),
    [colors]
  );

  const syncAll = async () => {
    try {
      await calendarSyncGoogle();
      Alert.alert('Sync', 'Calendar sync started');
      await load();
    } catch (e: any) {
      Alert.alert('Sync failed', e?.response?.data?.error || e?.message || '');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.h1}>Calendar connections</Text>
        <View style={{ width: 24 }} />
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => setOauthOpen(true)}>
        <Text style={styles.btnText}>Connect Google</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, styles.secondary]} onPress={syncAll}>
        <Text style={[styles.btnText, { color: colors.text }]}>Sync all calendars</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}

      {!loading && list.length === 0 ? (
        <View style={{ paddingHorizontal: 24, paddingTop: 24 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>No connections yet</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 8, lineHeight: 22 }}>
            Connect Google Calendar to sync events into GrabDocs. After connecting, use Sync all calendars to pull the latest.
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {list.map((c) => (
          <View key={String(c.id)} style={styles.card}>
            <Text style={styles.name}>{c.provider || c.type || 'Connection'}</Text>
            <Text style={styles.meta}>Status: {c.status || c.sync_status || '—'}</Text>
            <View style={{ flexDirection: 'row', marginTop: 12, gap: 12 }}>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await calendarResetConnection(Number(c.id));
                    await load();
                  } catch (e: any) {
                    Alert.alert('Error', e?.response?.data?.error || '');
                  }
                }}
              >
                <Text style={{ color: '#007AFF' }}>Resume / reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert('Disconnect', 'Remove this connection?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await calendarDeleteConnection(Number(c.id));
                          await load();
                        } catch (e: any) {
                          Alert.alert('Error', e?.response?.data?.error || '');
                        }
                      },
                    },
                  ]);
                }}
              >
                <Text style={{ color: '#ef4444' }}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <CalendarOAuthWebView
        visible={oauthOpen}
        onClose={() => setOauthOpen(false)}
        onSuccess={async () => {
          await load();
          await calendarSyncGoogle().catch(() => {});
        }}
        onError={(msg) => Alert.alert('Connection', msg)}
      />
    </SafeAreaView>
  );
}
