import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import ActionMenuModal, { type ActionMenuItem } from '../../../components/ActionMenuModal';
import DocumentViewer from '../../../components/DocumentViewer';
import { FeedbackTouchable } from '../../../components/FeedbackTouchable';
import { useThemeColors } from '../../../hooks/useThemeColors';
import {
  addDraftAttachmentFile,
  addDraftAttachmentFileId,
  closeMailboxThread,
  deleteDraftAttachment,
  deleteMailboxDraft,
  dismissMailboxThread,
  downloadMessageAttachment,
  emailApiError,
  generateMailboxDraft,
  getMailboxThread,
  mailboxCapabilities,
  nextPendingMailboxThread,
  patchMailboxDraft,
  reconcileMailboxSend,
  sendMailboxDraft,
  undismissMailboxThread,
  undoMailboxSend,
  type EmailDraft,
  type EmailMessage,
  type EmailThread,
  type ReplyFromInfo,
  type ThreadAttention,
} from '../../../services/emailSyncApi';
import { AttachmentNamesRow, type AttachPreview } from '../_components/AttachmentNamesRow';
import { EmailHtmlBody } from '../_components/EmailHtmlBody';
import { formatEmailWhen } from '../_components/emailFormat';
import { GrabDocsAttachPicker } from '../_components/GrabDocsAttachPicker';

function getFileTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif'];
  const docExts = ['doc', 'docx'];
  const xlsExts = ['xls', 'xlsx', 'csv'];
  const pptExts = ['ppt', 'pptx'];
  const textExts = ['txt', 'md', 'rtf'];
  if (ext === 'pdf') return 'application/pdf';
  if (imageExts.includes(ext)) return 'image';
  if (docExts.includes(ext)) return 'application/msword';
  if (xlsExts.includes(ext)) return 'application/vnd.ms-excel';
  if (pptExts.includes(ext)) return 'application/vnd.ms-powerpoint';
  if (textExts.includes(ext)) return 'text/plain';
  return '';
}

function isImageMimeOrName(mime: string, name: string) {
  if ((mime || '').startsWith('image/')) return true;
  return /\.(jpg|jpeg|png|gif|bmp|webp|heic|heif)$/i.test(name || '');
}

function isPdfMimeOrName(mime: string, name: string) {
  if ((mime || '').includes('pdf')) return true;
  return /\.pdf$/i.test(name || '');
}

function splitAddrs(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function EmailThreadScreen() {
  const { id, workspaceId, filter, compose } = useLocalSearchParams<{
    id: string;
    workspaceId?: string;
    filter?: string;
    compose?: string;
  }>();
  const threadId = Number(id);
  const wantCompose = compose === '1' || compose === 'true';
  const attention = (filter === 'dismissed' || filter === 'candidates' || filter === 'pending'
    ? filter
    : 'pending') as ThreadAttention;
  const dismissed = attention === 'dismissed';
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const ws = workspaceId ? Number(workspaceId) : undefined;

  const [thread, setThread] = useState<EmailThread | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [replyFrom, setReplyFrom] = useState<ReplyFromInfo | null>(null);
  const [pendingSend, setPendingSend] = useState<{
    id: number;
    status?: string;
    error_message?: string;
  } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendReady, setSendReady] = useState(true);
  const [composing, setComposing] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undoLeft, setUndoLeft] = useState(0);
  const [body, setBody] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [headersOpen, setHeadersOpen] = useState(false);
  const [replyMenu, setReplyMenu] = useState(false);
  const [attachMenu, setAttachMenu] = useState(false);
  const [gdOpen, setGdOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewerFileId, setViewerFileId] = useState<number | null>(null);
  const [viewerFileName, setViewerFileName] = useState('');
  const [directPreview, setDirectPreview] = useState<{
    uri: string;
    name: string;
    mime: string;
  } | null>(null);
  const [attOpening, setAttOpening] = useState(false);
  const lastTapRef = useRef(0);
  const autoComposeRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const applyDraft = (d: EmailDraft | null, openComposer = true) => {
    setDraft(d);
    if (!d) return;
    setTo((d.to || []).join(', '));
    setCc((d.cc || []).join(', '));
    setSubject(d.subject || '');
    setBody(d.body_text || '');
    if (openComposer) setComposing(true);
  };

  const load = useCallback(
    async (before?: number) => {
      const data = await getMailboxThread(threadId, before ? { before } : undefined);
      setThread(data.thread);
      setHasMore(!!data.has_more);
      setMessages((m) => (before ? [...data.messages, ...m] : data.messages || []));
      setPendingSend(
        data.pending_send?.id
          ? {
              id: data.pending_send.id,
              status: data.pending_send.status,
              error_message: data.pending_send.error_message,
            }
          : null
      );
      if (data.reply_from) setReplyFrom(data.reply_from);
      if (!before && data.draft) applyDraft(data.draft, true);
    },
    [threadId]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await load();
        if (ws) {
          const caps = await mailboxCapabilities(ws);
          const send = (caps.connections || []).some((c) => c.send_enabled);
          if (alive) setSendReady(caps.connections?.length ? send : true);
        }
      } catch (e) {
        Alert.alert('Mail', emailApiError(e, 'Could not load'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load, ws]);

  useEffect(() => {
    if (undoLeft <= 0) return;
    const t = setInterval(() => setUndoLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [undoLeft]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardOpen(true)
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardOpen(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const persistDraft = async () => {
    if (!draft) return;
    await patchMailboxDraft(draft.id, {
      to: splitAddrs(to),
      cc: splitAddrs(cc),
      subject,
      body_text: body,
    });
  };

  const generate = async (mode: 'reply' | 'reply_all') => {
    setBusy(true);
    setReplyMenu(false);
    try {
      if (draft && composing) {
        try {
          await persistDraft();
        } catch {
          /* still generate; server may use last saved body */
        }
      }
      const data = await generateMailboxDraft(threadId, { tone: 'professional', reply_mode: mode });
      if (data.reply_from) setReplyFrom(data.reply_from);
      if (data.thread) setThread(data.thread);
      applyDraft(data.draft);
    } catch (e: any) {
      const status = e?.response?.status;
      const code = e?.response?.data?.code;
      const msg = emailApiError(e, 'Could not generate draft');
      if (status === 429 || code === 'monthly_token_limit_exceeded') {
        Alert.alert('AI credit limit', msg);
      } else {
        Alert.alert('Draft', msg);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!wantCompose || loading || autoComposeRef.current || dismissed) return;
    autoComposeRef.current = true;
    if (draft) {
      setComposing(true);
      return;
    }
    void generate('reply');
  }, [wantCompose, loading, draft, dismissed]);

  const goNextPending = async () => {
    if (!ws) {
      router.back();
      return;
    }
    try {
      const next = await nextPendingMailboxThread(ws, threadId);
      if (next?.id) {
        router.replace({
          pathname: '/email-sync/thread/[id]',
          params: { id: String(next.id), workspaceId: String(ws), filter: 'pending' },
        } as any);
      } else {
        router.back();
      }
    } catch {
      router.back();
    }
  };

  const send = async (advance: boolean) => {
    if (!draft) return;
    setBusy(true);
    try {
      try {
        await persistDraft();
      } catch {
        /* send payload still carries edits */
      }
      const res = await sendMailboxDraft(draft.id, {
        to: splitAddrs(to),
        cc: splitAddrs(cc),
        subject,
        body_text: body,
      });
      if (res.pending_send?.id) setPendingSend({ id: res.pending_send.id });
      const secs = Number(res.undo_seconds ?? 20);
      setUndoLeft(secs);
      setComposing(false);
      setDraft(null);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (advance) {
        advanceTimerRef.current = setTimeout(() => {
          advanceTimerRef.current = null;
          void goNextPending();
        }, Math.max(secs, 1) * 1000 + 200);
      }
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 409) {
        setUndoLeft(0);
        Alert.alert('Sent', 'This reply already went out.');
        if (advance) void goNextPending();
      } else if (status === 403) {
        Alert.alert('Can’t send', 'Reconnect this mailbox in Mailbox settings.');
      } else {
        Alert.alert('Send failed', emailApiError(e, 'Try again'));
      }
    } finally {
      setBusy(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.isDark ? colors.background : '#F3F4F6' },
        header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4, paddingBottom: 4, backgroundColor: colors.background },
        headerBody: { flex: 1, minWidth: 0, marginHorizontal: 4, paddingTop: 8 },
        h1: { fontSize: 17, fontWeight: '700', color: colors.text },
        iconBtn: { padding: 10 },
        bubble: {
          marginHorizontal: 16,
          marginBottom: 12,
          padding: 12,
          borderRadius: 16,
          backgroundColor: colors.isDark ? '#1C1E22' : '#FFFFFF',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.isDark ? '#3F3F46' : '#D1D5DB',
        },
        outbound: {
          backgroundColor: colors.isDark ? '#1e3a5f' : '#EFF6FF',
          borderColor: colors.isDark ? '#2563eb66' : '#BFDBFE',
        },
        bubbleHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
        bubbleHeadText: { flex: 1, minWidth: 0 },
        expandBtn: { padding: 4, marginLeft: 8, marginTop: -2 },
        meta: { fontSize: 12, color: colors.textSecondary },
        from: { fontWeight: '700', color: colors.text, fontSize: 14 },
        banner: {
          marginHorizontal: 16,
          marginBottom: 8,
          padding: 10,
          borderRadius: 10,
          backgroundColor: colors.isDark ? '#3b2f1a' : '#FEF3C7',
        },
        bannerTxt: { color: colors.isDark ? '#FDE68A' : '#92400E', fontSize: 13, lineHeight: 18 },
        composer: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          paddingHorizontal: 12,
          paddingTop: 8,
        },
        headerField: {
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          paddingVertical: 6,
        },
        label: { width: 36, fontSize: 13, color: colors.textSecondary },
        fieldInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 4 },
        input: {
          minHeight: 140,
          maxHeight: 200,
          borderRadius: 18,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.text,
          fontSize: 16,
          marginTop: 8,
          textAlignVertical: 'top',
        },
        tools: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 2, flexWrap: 'wrap' },
        chip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 14,
          backgroundColor: colors.surface,
          marginRight: 6,
          marginTop: 4,
        },
        send: {
          marginLeft: 'auto',
          backgroundColor: '#007AFF',
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingVertical: 8,
        },
        replyBar: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          padding: 12,
          flexDirection: 'row',
          gap: 8,
          backgroundColor: colors.background,
        },
        replyBtn: {
          flex: 1,
          backgroundColor: '#007AFF',
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: 'center',
        },
        replySecondary: {
          backgroundColor: colors.surface,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        undo: {
          position: 'absolute',
          left: 16,
          right: 16,
          backgroundColor: '#1c1c1e',
          borderRadius: 12,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
        },
      }),
    [colors]
  );

  const replyMenuItems: ActionMenuItem[] = [
    { id: 'reply', label: 'Reply', icon: 'arrow-undo', onPress: () => generate('reply') },
    { id: 'all', label: 'Reply all', icon: 'people-outline', onPress: () => generate('reply_all') },
  ];

  const attachItems: ActionMenuItem[] = [
    {
      id: 'device',
      label: 'From this device',
      icon: 'phone-portrait-outline',
      onPress: async () => {
        setAttachMenu(false);
        if (!draft) return;
        const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (pick.canceled || !pick.assets?.[0]) return;
        const f = pick.assets[0];
        await addDraftAttachmentFile(draft.id, { uri: f.uri, name: f.name, type: f.mimeType });
        await load();
        setComposing(true);
      },
    },
    {
      id: 'gd',
      label: 'From GrabDocs',
      icon: 'folder-outline',
      onPress: () => {
        setAttachMenu(false);
        setGdOpen(true);
      },
    },
  ];

  const toggleExpanded = (messageId: number) => {
    setExpandedId((cur) => (cur === messageId ? null : messageId));
  };

  const onMessagePress = (messageId: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      toggleExpanded(messageId);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
  };

  const inboundBg = colors.isDark ? '#1C1E22' : '#FFFFFF';
  const outboundBg = colors.isDark ? '#1e3a5f' : '#EFF6FF';
  const bodyTextColor = colors.isDark ? '#E5E7EB' : '#111827';

  const openAttachment = async (att: AttachPreview) => {
    const name = (att.filename || '').trim() || 'Attachment';
    if (att.file_id) {
      setDirectPreview(null);
      setViewerFileId(att.file_id);
      setViewerFileName(name);
      return;
    }
    if (att.id != null && att.id > 0) {
      setAttOpening(true);
      try {
        const downloaded = await downloadMessageAttachment(att.id, name);
        setViewerFileId(null);
        setDirectPreview({
          uri: downloaded.uri,
          name: downloaded.filename || name,
          mime: downloaded.mime,
        });
      } catch {
        Alert.alert('Attachment', 'Could not open attachment');
      } finally {
        setAttOpening(false);
      }
      return;
    }
    Alert.alert('Attachment', 'Still importing…');
  };

  const threadAttachments: AttachPreview[] = (() => {
    const fromMessages = messages.flatMap((m) => m.attachments || []);
    if (fromMessages.length) return fromMessages;
    if (thread?.attachments?.length) return thread.attachments;
    return (thread?.attachment_names || []).map((filename, i) => ({ id: -(i + 1), filename }));
  })();

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator style={{ marginTop: 40 }} color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={styles.header}>
          <FeedbackTouchable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </FeedbackTouchable>
          <View style={styles.headerBody}>
            <Text style={styles.h1} numberOfLines={1}>
              {thread?.subject || 'Conversation'}
            </Text>
            <AttachmentNamesRow attachments={threadAttachments} onOpen={openAttachment} />
          </View>
          <FeedbackTouchable
            style={styles.iconBtn}
            onPress={async () => {
              if (dismissed) await undismissMailboxThread(threadId);
              else await dismissMailboxThread(threadId);
              router.back();
            }}
            accessibilityLabel={dismissed ? 'Restore' : 'Dismiss'}
          >
            <Ionicons name={dismissed ? 'arrow-undo' : 'close-circle-outline'} size={22} color={colors.text} />
          </FeedbackTouchable>
          {!dismissed && (
            <FeedbackTouchable
              style={styles.iconBtn}
              onPress={async () => {
                await closeMailboxThread(threadId);
                await goNextPending();
              }}
              accessibilityLabel="Skip"
            >
              <Ionicons name="play-skip-forward-outline" size={22} color={colors.text} />
            </FeedbackTouchable>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 8, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {!sendReady && (
            <TouchableOpacity
              onPress={() => router.push('/email-sync/mailbox' as any)}
              style={styles.banner}
            >
              <Text style={styles.bannerTxt}>This mailbox can read but not send. Tap to reconnect.</Text>
            </TouchableOpacity>
          )}

          {pendingSend && (pendingSend.status === 'reconcile_needed' || pendingSend.status === 'failed') && (
            <View style={styles.banner}>
              <Text style={styles.bannerTxt}>
                {pendingSend.status === 'failed' ? 'Send failed.' : 'Send could not be confirmed.'}
                {pendingSend.error_message ? ` ${pendingSend.error_message}` : ''}
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await reconcileMailboxSend(pendingSend.id);
                    await load();
                  } catch (e) {
                    Alert.alert('Reconcile', emailApiError(e, 'Failed'));
                  }
                }}
                style={{ marginTop: 8 }}
              >
                <Text style={{ color: '#007AFF', fontWeight: '700' }}>Check send status</Text>
              </TouchableOpacity>
            </View>
          )}

          {hasMore && messages[0] ? (
            <TouchableOpacity onPress={() => load(messages[0].id)} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={{ color: '#007AFF', fontWeight: '600' }}>Earlier messages</Text>
            </TouchableOpacity>
          ) : null}

          {messages.map((m) => {
            const out = m.direction === 'outbound';
            const expanded = expandedId === m.id;
            const bg = out ? outboundBg : inboundBg;
            return (
              <Pressable
                key={m.id}
                onPress={() => onMessagePress(m.id)}
                style={[styles.bubble, out && styles.outbound, expanded && { paddingBottom: 16 }]}
              >
                <View style={styles.bubbleHead}>
                  <View style={styles.bubbleHeadText}>
                    <Text style={styles.from}>{out ? 'You' : m.from_address || 'Them'}</Text>
                    <Text style={styles.meta}>{formatEmailWhen(m.provider_received_at)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleExpanded(m.id)}
                    style={styles.expandBtn}
                    hitSlop={8}
                    accessibilityLabel={expanded ? 'Collapse message' : 'Expand message'}
                  >
                    <Ionicons
                      name={expanded ? 'contract-outline' : 'expand-outline'}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
                <EmailHtmlBody
                  html={m.body_html}
                  text={m.body_text}
                  textColor={bodyTextColor}
                  background={bg}
                  isDark={colors.isDark}
                  expanded={expanded}
                />
                <AttachmentNamesRow
                  attachments={m.attachments}
                  onOpen={openAttachment}
                  style={{ marginTop: 8 }}
                />
              </Pressable>
            );
          })}
        </ScrollView>

        {composing && draft ? (
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, keyboardOpen ? 12 : 8) }]}>
            <TouchableOpacity onPress={() => setHeadersOpen((v) => !v)} style={{ paddingVertical: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                From {replyFrom?.from_address || 'mailbox'}
                {headersOpen ? '' : ` · To ${to || '…'}`}
                {'  '}
                <Ionicons name={headersOpen ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} />
              </Text>
            </TouchableOpacity>
            {replyFrom?.using_send_as_alias && replyFrom.mailbox_address ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                Via {replyFrom.mailbox_address}
              </Text>
            ) : null}
            {replyFrom?.forward_without_send_as && replyFrom.customer_addressed ? (
              <Text style={[styles.bannerTxt, { marginBottom: 6 }]}>
                Customer wrote to {replyFrom.customer_addressed}. Send-as isn’t set for that address, so this sends from{' '}
                {replyFrom.from_address}.
              </Text>
            ) : null}
            {headersOpen ? (
              <>
                <View style={styles.headerField}>
                  <Text style={styles.label}>To</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={to}
                    onChangeText={setTo}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onEndEditing={() => void persistDraft().catch(() => {})}
                  />
                </View>
                <View style={styles.headerField}>
                  <Text style={styles.label}>Cc</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={cc}
                    onChangeText={setCc}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onEndEditing={() => void persistDraft().catch(() => {})}
                  />
                </View>
                <View style={styles.headerField}>
                  <Text style={styles.label}>Subj</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={subject}
                    onChangeText={setSubject}
                    onEndEditing={() => void persistDraft().catch(() => {})}
                  />
                </View>
              </>
            ) : null}
            <TextInput
              style={styles.input}
              value={body}
              onChangeText={setBody}
              placeholder="Reply"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
            />
            {(draft.attachments || []).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                {(draft.attachments || []).map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.chip}
                    onPress={() => {
                      const name = a.filename || 'Attachment';
                      const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
                        { text: 'Cancel', style: 'cancel' },
                      ];
                      if (a.file_id) {
                        buttons.push({
                          text: 'Open',
                          onPress: () => {
                            setDirectPreview(null);
                            setViewerFileId(a.file_id!);
                            setViewerFileName(name);
                          },
                        });
                      }
                      buttons.push({
                        text: 'Remove',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteDraftAttachment(draft.id, a.id);
                          await load();
                          setComposing(true);
                        },
                      });
                      Alert.alert(name, undefined, buttons);
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>
                      {a.filename || `File ${a.id}`} ×
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.tools}>
              <TouchableOpacity onPress={() => setAttachMenu(true)} style={{ padding: 8 }}>
                <Ionicons name="attach" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => generate((draft.reply_mode as 'reply' | 'reply_all') || 'reply')}
                style={{ padding: 8 }}
                disabled={busy}
              >
                <Text style={{ color: '#007AFF', fontWeight: '600', fontSize: 13 }}>
                  {busy ? '…' : 'Regenerate'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await deleteMailboxDraft(draft.id);
                    setDraft(null);
                    setComposing(false);
                  } catch (e: any) {
                    if (e?.response?.status === 409) Alert.alert('Discard', 'Undo the pending send first.');
                    else Alert.alert('Discard', emailApiError(e, 'Failed'));
                  }
                }}
                style={{ padding: 8 }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.send} onPress={() => send(true)} disabled={busy || !sendReady}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '…' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => send(false)} disabled={busy || !sendReady} style={{ alignSelf: 'flex-end', paddingTop: 2, paddingBottom: 2 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Send without opening next</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.replyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={styles.replyBtn}
              onPress={() => (draft ? setComposing(true) : setReplyMenu(true))}
              disabled={busy || !sendReady}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {busy ? 'Writing…' : draft ? 'Continue draft' : 'Reply'}
              </Text>
            </TouchableOpacity>
            {!draft && (
              <TouchableOpacity style={styles.replySecondary} onPress={() => setReplyMenu(true)} disabled={busy || !sendReady}>
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {undoLeft > 0 && pendingSend ? (
          <View style={[styles.undo, { bottom: Math.max(insets.bottom, 12) + 72 }]}>
            <Text style={{ color: '#fff', flex: 1 }}>Sending in {undoLeft}s</Text>
            <TouchableOpacity
              onPress={async () => {
                try {
                  if (advanceTimerRef.current) {
                    clearTimeout(advanceTimerRef.current);
                    advanceTimerRef.current = null;
                  }
                  await undoMailboxSend(pendingSend.id);
                  setUndoLeft(0);
                  await load();
                  setComposing(true);
                } catch {
                  setUndoLeft(0);
                  Alert.alert('Undo', 'Too late — already sending or sent.');
                }
              }}
            >
              <Text style={{ color: '#7dd3fc', fontWeight: '700' }}>Undo</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <ActionMenuModal visible={replyMenu} title="Reply" items={replyMenuItems} onClose={() => setReplyMenu(false)} />
      <ActionMenuModal visible={attachMenu} title="Attach" items={attachItems} onClose={() => setAttachMenu(false)} />

      <GrabDocsAttachPicker
        visible={gdOpen}
        workspaceId={ws}
        onClose={() => setGdOpen(false)}
        onPickFile={async (file) => {
          if (!draft) return;
          try {
            await addDraftAttachmentFileId(draft.id, file.id);
            setGdOpen(false);
            await load();
            setComposing(true);
          } catch (e) {
            Alert.alert('Attach', emailApiError(e, 'Could not attach'));
          }
        }}
      />

      {viewerFileId != null ? (
        <DocumentViewer
          fileId={String(viewerFileId)}
          fileName={viewerFileName}
          fileType={getFileTypeFromFilename(viewerFileName)}
          workspaceId={ws}
          onClose={() => {
            setViewerFileId(null);
            setViewerFileName('');
          }}
        />
      ) : null}

      <Modal
        visible={!!directPreview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDirectPreview(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 }}>
            <FeedbackTouchable onPress={() => setDirectPreview(null)} style={{ padding: 10 }}>
              <Ionicons name="close" size={28} color={colors.text} />
            </FeedbackTouchable>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: colors.text }} numberOfLines={1}>
              {directPreview?.name || 'Attachment'}
            </Text>
          </View>
          {directPreview && isImageMimeOrName(directPreview.mime, directPreview.name) ? (
            <ExpoImage
              source={{ uri: directPreview.uri }}
              style={{ flex: 1, margin: 12, borderRadius: 8 }}
              contentFit="contain"
            />
          ) : directPreview && isPdfMimeOrName(directPreview.mime, directPreview.name) ? (
            <WebView
              source={{ uri: directPreview.uri }}
              style={{ flex: 1 }}
              originWhitelist={['*']}
              allowFileAccess
              allowUniversalAccessFromFileURLs
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <Ionicons name="document-outline" size={48} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, marginTop: 12, textAlign: 'center' }}>
                Preview isn’t available for this file type.
              </Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {attOpening ? (
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.25)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
