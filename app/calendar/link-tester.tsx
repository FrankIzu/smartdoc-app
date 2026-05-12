import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { FRONTEND_URL } from '../../constants/Config';
import { useThemeColors } from '../../hooks/useThemeColors';

const SCHEME = 'grabdocs';

function openOrAlert(url: string) {
  Linking.openURL(url).catch((e) => Alert.alert('Link error', String(e?.message || e)));
}

export default function CalendarLinkTesterScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [eventId, setEventId] = useState('1');
  const [token, setToken] = useState('paste-token-from-email');

  const base = useMemo(() => FRONTEND_URL.replace(/\/$/, ''), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', padding: 12 },
        h1: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
        body: { padding: 16, paddingBottom: 48 },
        p: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: 14 },
        label: { fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 12 },
        input: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 10,
          color: colors.text,
          backgroundColor: colors.surface,
        },
        btn: {
          backgroundColor: '#007AFF',
          padding: 14,
          borderRadius: 10,
          marginTop: 10,
          alignItems: 'center',
        },
        btnText: { color: '#fff', fontWeight: '600' },
        btnGhost: {
          marginTop: 8,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          backgroundColor: colors.surface,
        },
        mono: { fontSize: 11, color: colors.textSecondary },
      }),
    [colors]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.h1}>Calendar links (QA)</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.p}>
          Use these to verify routing on a device build. Custom scheme links work as soon as the app is installed. HTTPS
          links need Apple App Site Association / Digital Asset Links on the host that matches your intent filters and
          associated domains.
        </Text>

        <Text style={styles.label}>Event ID (for RSVP)</Text>
        <TextInput style={styles.input} value={eventId} onChangeText={setEventId} keyboardType="number-pad" placeholderTextColor={colors.textSecondary} />

        <Text style={styles.label}>Token (RSVP email or ICS)</Text>
        <TextInput style={styles.input} value={token} onChangeText={setToken} autoCapitalize="none" placeholderTextColor={colors.textSecondary} />

        <Text style={[styles.label, { marginTop: 20 }]}>Custom scheme ({SCHEME}:)</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => openOrAlert(`${SCHEME}://calendar/rsvp?eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}`)}
        >
          <Text style={styles.btnText}>Open RSVP (scheme)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={() => openOrAlert(`${SCHEME}://calendar/ics?token=${encodeURIComponent(token)}`)}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Open ICS (scheme)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={() => openOrAlert(`${SCHEME}://calendar`)}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Open calendar home (scheme)</Text>
        </TouchableOpacity>

        <Text style={[styles.label, { marginTop: 24 }]}>Universal / app links (HTTPS)</Text>
        <Text style={[styles.mono, { marginBottom: 8 }]}>
          {`${base}/calendar/rsvp?eventId=…&token=…`}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() =>
            openOrAlert(`${base}/calendar/rsvp?eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}`)
          }
        >
          <Text style={styles.btnText}>Open RSVP (HTTPS)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnGhost}
          onPress={() => openOrAlert(`${base}/calendar/ics?token=${encodeURIComponent(token)}`)}
        >
          <Text style={{ color: colors.text, fontWeight: '600' }}>Open ICS (HTTPS)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnGhost, { marginTop: 16 }]}
          onPress={() => {
            const sample = `${base}/calendar/rsvp?eventId=${eventId}&token=${token}`;
            Clipboard.setStringAsync(sample).then(() => Alert.alert('Copied', 'Sample HTTPS RSVP URL copied to clipboard.'));
          }}
        >
          <Text style={{ color: '#007AFF', fontWeight: '600' }}>Copy sample HTTPS RSVP URL</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
