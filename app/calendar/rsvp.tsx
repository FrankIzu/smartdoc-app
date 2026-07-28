import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedbackTouchable } from '../../components/FeedbackTouchable';
import { useThemeColors } from '../../hooks/useThemeColors';
import { calendarRsvpFromEmail } from '../../services/calendarApi';

type EmailRsvpStatus = 'accepted' | 'declined';

export default function CalendarEmailRsvpScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ eventId?: string; id?: string; token?: string; status?: string }>();
  const eventId = Number(params.eventId ?? params.id);
  const token = typeof params.token === 'string' ? params.token : '';
  const initialStatus =
    params.status === 'accepted' || params.status === 'declined' ? (params.status as EmailRsvpStatus) : null;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', padding: 12 },
        h1: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 },
        body: { flex: 1, padding: 20, justifyContent: 'center' },
        text: { color: colors.text, textAlign: 'center', marginBottom: 16 },
        btn: { backgroundColor: '#007AFF', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
        decline: { backgroundColor: '#ef4444' },
        btnText: { color: '#fff', fontWeight: '600' },
      }),
    [colors]
  );

  const submit = async (status: EmailRsvpStatus) => {
    if (!Number.isFinite(eventId) || !token) {
      Alert.alert('Invalid RSVP link', 'This RSVP link is missing required information.');
      return;
    }
    setLoading(true);
    try {
      const data = await calendarRsvpFromEmail(eventId, token, status);
      setResult(`${data?.event_title || 'Event'} marked as ${status}.`);
    } catch (e: any) {
      Alert.alert('RSVP failed', e?.response?.data?.error || e?.message || 'Could not update RSVP');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (initialStatus) submit(initialStatus);
    // Only auto-submit initial deep-link status once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.h1}>Calendar RSVP</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.body}>
        {loading ? <ActivityIndicator style={{ marginBottom: 16 }} /> : null}
        <Text style={styles.text}>{result || 'Respond to this calendar invitation.'}</Text>
        {!result ? (
          <>
            <FeedbackTouchable
              style={styles.btn}
              disabled={loading}
              spinnerColor="#fff"
              onPress={() => submit('accepted')}
            >
              <Text style={styles.btnText}>Accept</Text>
            </FeedbackTouchable>
            <FeedbackTouchable
              style={[styles.btn, styles.decline]}
              disabled={loading}
              spinnerColor="#fff"
              onPress={() => submit('declined')}
            >
              <Text style={styles.btnText}>Decline</Text>
            </FeedbackTouchable>
          </>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/calendar' as any)}>
            <Text style={styles.btnText}>Open calendar</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
