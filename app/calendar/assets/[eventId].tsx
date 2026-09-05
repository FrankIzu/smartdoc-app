import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedbackTouchable } from '../../../components/FeedbackTouchable';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { calendarAssetContent, calendarMeetingAssets } from '../../../services/calendarApi';

import AppBackButton, { APP_BACK_BUTTON_SLOT } from '../../../components/AppBackButton';
import AppHeaderTitle from '../../../components/AppHeaderTitle';

type LazyAssetType = 'transcript' | 'summary' | 'chat';
type AssetItem = {
  key: string;
  type: LazyAssetType | 'recording' | 'note' | 'report';
  title: string;
  url?: string | null;
  description?: string;
  lazy: boolean;
};

export default function CalendarEventAssetsScreen() {
  const { eventId: idParam } = useLocalSearchParams<{ eventId?: string }>();
  const eventId = Number(idParam);
  const router = useRouter();
  const colors = useThemeColors();

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<any | null>(null);
  const [open, setOpen] = useState<{ type: LazyAssetType; url: string; title: string } | null>(null);
  const [content, setContent] = useState<string>('');
  const [contentLoading, setContentLoading] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(eventId)) return;
    const data = await calendarMeetingAssets(eventId);
    setPayload(data);
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Number.isFinite(eventId)) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        await load();
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.error || e?.message || 'Failed to load assets');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, load]);

  const openAsset = async (asset: AssetItem) => {
    if (!asset.url) {
      Alert.alert('Asset unavailable', 'This asset does not have a downloadable URL yet.');
      return;
    }
    if (!asset.lazy) {
      Linking.openURL(asset.url).catch(() => Alert.alert('Error', 'Could not open asset'));
      return;
    }
    const type = asset.type as LazyAssetType;
    const url = asset.url;
    const title = asset.title;
    setOpen({ type, url, title });
    setContentLoading(true);
    setContent('');
    try {
      const data = await calendarAssetContent(eventId, type, url);
      const text =
        typeof data === 'string'
          ? data
          : data?.content ?? data?.text ?? data?.body ?? JSON.stringify(data, null, 2);
      setContent(text);
    } catch (e: any) {
      setContent(e?.response?.data?.error || e?.message || 'Could not load');
    } finally {
      setContentLoading(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', padding: 12 , backgroundColor: colors.headerBackground },
        h1: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
        card: {
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        label: { color: colors.text, fontWeight: '600' },
      }),
    [colors]
  );

  const assets = useMemo<AssetItem[]>(() => {
    const meeting = payload?.meeting ?? payload;
    if (!meeting) return [];

    const rows: AssetItem[] = [];
    const pushUrl = (
      type: AssetItem['type'],
      title: string,
      url: string | null | undefined,
      lazy: boolean,
      description?: string
    ) => {
      if (!url) return;
      rows.push({
        key: `${type}-${rows.length}-${url}`,
        type,
        title,
        url,
        lazy,
        description,
      });
    };

    pushUrl('transcript', 'Transcript', meeting.transcript_url, true, 'Meeting transcript');
    pushUrl('summary', 'Summary', meeting.summary_url, true, 'AI meeting summary');

    (meeting.chats || []).forEach((chat: any, idx: number) => {
      pushUrl('chat', chat.filename || `Chat ${idx + 1}`, chat.url, true, chat.file_size ? `${chat.file_size} bytes` : 'Meeting chat');
    });

    (meeting.recordings || []).forEach((recording: any, idx: number) => {
      pushUrl(
        'recording',
        recording.title || `Recording ${idx + 1}`,
        recording.url,
        false,
        recording.file_size ? `${recording.file_size} bytes` : 'Recording'
      );
    });

    (meeting.notes || []).forEach((note: any, idx: number) => {
      pushUrl('note', note.filename || `Meeting note ${idx + 1}`, note.url, false, note.file_size ? `${note.file_size} bytes` : 'Meeting note');
    });

    (meeting.reports || []).forEach((report: any, idx: number) => {
      rows.push({
        key: `report-${report.id ?? idx}`,
        type: 'report',
        title: report.participant_name || report.participant_email || `Participant report ${idx + 1}`,
        description: report.duration ? `Duration: ${report.duration}` : 'Participant analytics',
        lazy: false,
      });
    });

    return rows;
  }, [payload]);

  if (!Number.isFinite(eventId)) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ padding: 16 }}>Invalid</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton />
        <AppHeaderTitle>Meeting assets</AppHeaderTitle>
        <View style={{ width: APP_BACK_BUTTON_SLOT }} />
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 32 }} /> : null}

      {!loading && !open ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          {assets.length > 0 ? (
            assets.map((asset) => (
              <FeedbackTouchable
                key={asset.key}
                style={styles.row}
                onPress={() => openAsset(asset)}
                spinnerColor="#007AFF"
                replaceWithSpinner={false}
              >
                <Text style={styles.label}>{asset.title}</Text>
                {asset.description ? <Text style={{ color: colors.textSecondary, marginTop: 4 }}>{asset.description}</Text> : null}
              </FeedbackTouchable>
            ))
          ) : (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 }}>
              No downloadable assets for this event.
            </Text>
          )}
        </ScrollView>
      ) : null}

      {open ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <TouchableOpacity onPress={() => setOpen(null)} style={{ marginBottom: 12 }}>
            <Text style={{ color: '#007AFF' }}>← Back to list</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 8 }}>{open.title}</Text>
          {contentLoading ? <ActivityIndicator /> : <Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>{content}</Text>}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
