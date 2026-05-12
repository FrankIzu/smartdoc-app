import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { calendarIsCompanyAdmin, useCalendarProfile } from '../../hooks/useCalendarProfile';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  calendarDeleteEvent,
  calendarEventMeeting,
  calendarGetEvent,
  calendarResendInvite,
  calendarRsvp,
  noteCreate,
  noteDelete,
  notesForCalendarEvent,
  noteUpdate,
} from '../../services/calendarApi';
import { calendarDisplayLocation, formatUtcIsoForDevice } from '../../utils/calendarTime';

/** Resolve Reach `meeting_id` for join-meeting from URL, meeting payload, or event.video_call_id. */
function resolveJoinMeetingId(
  meetingUrl: string | undefined,
  meetingPayload: Record<string, any> | null | undefined,
  videoCallId: unknown
): string | null {
  const url = meetingUrl?.trim();
  if (url) {
    const q = url.match(/[?&]meeting_id=([^&]+)/i);
    if (q?.[1]) return decodeURIComponent(q[1]).trim();
    const q2 = url.match(/[?&]meetingId=([^&]+)/i);
    if (q2?.[1]) return decodeURIComponent(q2[1]).trim();
  }
  const m = meetingPayload;
  if (m && typeof m === 'object') {
    const mid = m.meeting_id ?? m.meetingId ?? m.hms_room_id ?? m.room_meeting_id;
    if (mid != null && String(mid).trim() !== '') return String(mid).trim();
  }
  if (videoCallId != null && String(videoCallId).trim() !== '') return String(videoCallId).trim();
  return null;
}

function navigateJoinMeeting(
  meetingUrl: string | undefined,
  meetingPayload: Record<string, any> | null | undefined,
  videoCallId: unknown,
  router: ReturnType<typeof useRouter>
) {
  const mid = resolveJoinMeetingId(meetingUrl, meetingPayload, videoCallId);
  if (mid) {
    router.push({ pathname: '/join-meeting', params: { meeting_id: mid } } as any);
    return;
  }
  if (meetingUrl?.trim()) Linking.openURL(meetingUrl.trim()).catch(() => {});
}

export default function CalendarEventDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id?: string }>();
  const eventId = Number(idParam);
  const router = useRouter();
  const colors = useThemeColors();
  const { profile, refresh: refreshProfile } = useCalendarProfile();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any | null>(null);
  const [meetingInfo, setMeetingInfo] = useState<any | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [editingNote, setEditingNote] = useState<any | null>(null);
  const [rsvpComment, setRsvpComment] = useState('');

  const loadEvent = useCallback(async () => {
    if (!Number.isFinite(eventId)) return;
    const ev = await calendarGetEvent(eventId);
    setEvent(ev);
    try {
      const m = await calendarEventMeeting(eventId);
      if (m?.has_meeting && m.meeting) setMeetingInfo(m.meeting);
      else setMeetingInfo(null);
    } catch {
      setMeetingInfo(null);
    }
  }, [eventId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Number.isFinite(eventId)) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        await loadEvent();
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.error || e?.message || 'Failed to load event');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, loadEvent]);

  const loadNotes = useCallback(async () => {
    if (!Number.isFinite(eventId)) return;
    setNotesLoading(true);
    try {
      const list = await notesForCalendarEvent(eventId);
      setNotes(list);
    } catch {
      Alert.alert('Error', 'Failed to load notes');
    } finally {
      setNotesLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!event || !Number.isFinite(eventId)) return;
    notesForCalendarEvent(eventId).then(setNotes).catch(() => setNotes([]));
  }, [event, eventId]);

  useEffect(() => {
    if (notesOpen && Number.isFinite(eventId)) loadNotes();
  }, [notesOpen, eventId, loadNotes]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', padding: 12 },
        h1: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 },
        body: { padding: 16, paddingBottom: 48 },
        meta: { color: colors.textSecondary, fontSize: 14, marginBottom: 8 },
        pill: {
          alignSelf: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 8,
          backgroundColor: colors.surface,
          marginBottom: 12,
        },
        btn: {
          backgroundColor: '#007AFF',
          padding: 14,
          borderRadius: 10,
          marginBottom: 10,
          alignItems: 'center',
        },
        btnRowHalf: { flex: 1, marginBottom: 0 },
        btnRowFull: { flex: 1, marginBottom: 0 },
        btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        btnDanger: { backgroundColor: '#ef4444' },
        btnText: { color: '#fff', fontWeight: '600' },
        btnTextDark: { color: colors.text, fontWeight: '600' },
        rowBtn: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
        smallBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center' },
        label: { fontWeight: '600', color: colors.text, marginTop: 12 },
        input: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 10,
          marginTop: 6,
          color: colors.text,
          backgroundColor: colors.surface,
        },
      }),
    [colors]
  );

  const userNumericId = profile?.id ?? null;
  const isPersonalAccount = useMemo(() => (profile?.company_id ?? 0) === 0, [profile?.company_id]);
  const isOrganizer = !!(event && userNumericId != null && Number(event.organizer?.id) === userNumericId);
  const isAdmin = calendarIsCompanyAdmin(profile);
  const canEditDelete =
    event &&
    (event.event_type === 'company' ? isAdmin : isOrganizer);

  const handleDelete = () => {
    Alert.alert('Delete event', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await calendarDeleteEvent(eventId);
            router.replace('/calendar' as any);
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.error || 'Delete failed');
          }
        },
      },
    ]);
  };

  const saveNote = async () => {
    if (!newNoteTitle.trim() || !newNoteBody.trim()) {
      Alert.alert('Note', 'Enter title and content');
      return;
    }
    try {
      if (editingNote) {
        await noteUpdate(editingNote.id, { title: newNoteTitle.trim(), content: newNoteBody.trim() });
      } else {
        await noteCreate({
          source_type: 'calendar_event',
          source_id: eventId,
          title: newNoteTitle.trim(),
          content: newNoteBody.trim(),
        });
      }
      setNewNoteTitle('');
      setNewNoteBody('');
      setEditingNote(null);
      await loadNotes();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not save note');
    }
  };

  if (!Number.isFinite(eventId)) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ padding: 16, color: colors.text }}>Invalid event</Text>
      </SafeAreaView>
    );
  }

  if (loading || !event) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const locationLabel = calendarDisplayLocation(event.location);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.h1} numberOfLines={1}>
          {event.title || 'Event'}
        </Text>
        {canEditDelete ? (
          <TouchableOpacity onPress={() => router.push(`/calendar/edit/${eventId}` as any)} accessibilityLabel="Edit">
            <Text style={{ color: '#007AFF', fontSize: 17, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ minWidth: 36 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {(!isPersonalAccount || event.event_type === 'company') ? (
            <View style={styles.pill}>
              <Text style={{ color: colors.text, fontSize: 13 }}>
                {event.event_type === 'company' ? 'Company' : 'Personal'}
              </Text>
            </View>
          ) : null}
          {String(event.status ?? '').toLowerCase() === 'cancelled' ? (
            <View style={[styles.pill, { backgroundColor: '#FEE2E2' }]}>
              <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: '600' }}>Cancelled</Text>
            </View>
          ) : null}
        </View>
        {event.start_time ? (
          <Text style={[styles.meta, { color: colors.text }]}>
            {formatUtcIsoForDevice(event.start_time, { dateStyle: 'full', timeStyle: 'short' })}
            {event.end_time
              ? ` → ${formatUtcIsoForDevice(event.end_time, { timeStyle: 'short' })}`
              : ''}
          </Text>
        ) : null}
        {locationLabel ? <Text style={styles.meta}>📍 {locationLabel}</Text> : null}
        {event.organizer ? (
          <Text style={styles.meta}>
            Organized by {event.organizer.name || event.organizer.email || '—'}
          </Text>
        ) : null}
        {event.description ? <Text style={[styles.meta, { color: colors.text }]}>{event.description}</Text> : null}
        {event.notes ? (
          <Text style={[styles.meta, { color: colors.text }]}>
            Event notes: {event.notes}
          </Text>
        ) : null}

        {(() => {
          const joinEligible =
            String(event.status ?? '').toLowerCase() !== 'cancelled' &&
            !!(event.meeting_url || event.video_call_id || meetingInfo);
          return (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'stretch' }}>
              {joinEligible ? (
                <TouchableOpacity
                  style={[styles.btn, styles.btnRowHalf]}
                  onPress={() => navigateJoinMeeting(event.meeting_url, meetingInfo, event.video_call_id, router)}
                >
                  <Text style={styles.btnText}>Join meeting</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, joinEligible ? styles.btnRowHalf : styles.btnRowFull]}
                onPress={() => setNotesOpen(true)}
              >
                <Text style={styles.btnTextDark}>Notebook ({notes.length})</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {meetingInfo &&
        (meetingInfo.has_recording ||
          meetingInfo.has_transcript ||
          meetingInfo.has_summary ||
          meetingInfo.has_chat) ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => router.push(`/calendar/assets/${eventId}` as any)}
          >
            <Text style={styles.btnTextDark}>Meeting assets</Text>
          </TouchableOpacity>
        ) : null}

        {String(event.status ?? '').toLowerCase() !== 'cancelled' &&
        !isOrganizer &&
        Array.isArray(event.participants) &&
        event.participants.some((p: any) => (p.email || '').toLowerCase() === (profile?.email || '').toLowerCase()) ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.label}>RSVP note (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Message to the organizer…"
              placeholderTextColor={colors.textSecondary}
              value={rsvpComment}
              onChangeText={setRsvpComment}
              multiline
            />
            <View style={[styles.rowBtn, { marginTop: 8 }]}>
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={async () => {
                  try {
                    await calendarRsvp(eventId, 'accepted', rsvpComment.trim() || undefined);
                    setRsvpComment('');
                    await loadEvent();
                  } catch (e: any) {
                    Alert.alert('RSVP', e?.response?.data?.error || 'Failed');
                  }
                }}
              >
                <Text style={{ color: colors.text }}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={async () => {
                  try {
                    await calendarRsvp(eventId, 'tentative', rsvpComment.trim() || undefined);
                    setRsvpComment('');
                    await loadEvent();
                  } catch (e: any) {
                    Alert.alert('RSVP', e?.response?.data?.error || 'Failed');
                  }
                }}
              >
                <Text style={{ color: colors.text }}>Tentative</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={async () => {
                  try {
                    await calendarRsvp(eventId, 'declined', rsvpComment.trim() || undefined);
                    setRsvpComment('');
                    await loadEvent();
                  } catch (e: any) {
                    Alert.alert('RSVP', e?.response?.data?.error || 'Failed');
                  }
                }}
              >
                <Text style={{ color: colors.text }}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {Array.isArray(event.participants) && event.participants.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Participants</Text>
            {event.participants.map((p: any) => (
              <View
                key={String(p.id ?? p.email)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text }}>{p.name || p.email}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{p.status || '—'}</Text>
                </View>
                {p.status === 'needs-action' && !p.is_organizer && (isOrganizer || canEditDelete) && p.id ? (
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await calendarResendInvite(eventId, p.id);
                        Alert.alert('Sent', 'Invitation resent');
                      } catch (e: any) {
                        Alert.alert('Error', e?.response?.data?.error || 'Resend failed');
                      }
                    }}
                  >
                    <Text style={{ color: '#007AFF' }}>Resend</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {canEditDelete ? (
          <TouchableOpacity style={[styles.btn, styles.btnDanger, { marginTop: 24 }]} onPress={handleDelete}>
            <Text style={styles.btnText}>Delete event</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <Modal visible={notesOpen} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, maxHeight: '92%', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Notebook</Text>
              <TouchableOpacity onPress={() => setNotesOpen(false)}>
                <Text style={{ color: '#007AFF', fontSize: 16 }}>Done</Text>
              </TouchableOpacity>
            </View>
            {notesLoading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
            <ScrollView style={{ maxHeight: 220, marginTop: 12 }}>
              {notes.map((n) => (
                <View key={String(n.id)} style={{ marginBottom: 12, padding: 10, backgroundColor: colors.surface, borderRadius: 8 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{n.title}</Text>
                  <Text style={{ color: colors.textSecondary, marginTop: 4 }}>{n.content}</Text>
                  {userNumericId != null && n.user_id === userNumericId ? (
                    <View style={{ flexDirection: 'row', marginTop: 8, gap: 12 }}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingNote(n);
                          setNewNoteTitle(n.title || '');
                          setNewNoteBody(n.content || '');
                        }}
                      >
                        <Text style={{ color: '#007AFF' }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert('Delete note', 'Remove this note?', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await noteDelete(n.id);
                                  await loadNotes();
                                } catch (e: any) {
                                  Alert.alert('Error', e?.response?.data?.error || 'Failed');
                                }
                              },
                            },
                          ]);
                        }}
                      >
                        <Text style={{ color: '#ef4444' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            <Text style={styles.label}>{editingNote ? 'Edit note' : 'New note'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor={colors.textSecondary}
              value={newNoteTitle}
              onChangeText={setNewNoteTitle}
            />
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              placeholder="Content"
              placeholderTextColor={colors.textSecondary}
              multiline
              value={newNoteBody}
              onChangeText={setNewNoteBody}
            />
            <TouchableOpacity style={styles.btn} onPress={saveNote}>
        <Text style={styles.btnText}>{editingNote ? 'Update note' : 'Add note'}</Text>
            </TouchableOpacity>
            {editingNote ? (
              <TouchableOpacity
                onPress={() => {
                  setEditingNote(null);
                  setNewNoteTitle('');
                  setNewNoteBody('');
                }}
              >
                <Text style={{ color: '#007AFF', textAlign: 'center', marginTop: 8 }}>Cancel edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
