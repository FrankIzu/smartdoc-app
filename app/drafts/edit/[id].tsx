import 'react-native-url-polyfill/auto';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, STORAGE_KEYS } from '../../../constants/Config';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { apiClient } from '../../../services/api';
import { useAuth } from '../../context/auth';
import { secureStorage } from '../../../utils/storage';

function stripHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function textToSimpleHtml(text: string): string {
  if (!text) return '<p></p>';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const paras = escaped.split(/\n/).filter(Boolean);
  if (paras.length === 0) return '<p></p>';
  return paras.map(p => `<p>${p}</p>`).join('');
}

export default function DraftEditScreen() {
  const { id, share } = useLocalSearchParams<{ id: string; share?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const draftId = id ? parseInt(id, 10) : NaN;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [filename, setFilename] = useState('Untitled Draft');
  const [contentText, setContentText] = useState('');
  const [presenceEditors, setPresenceEditors] = useState<Map<number, string>>(new Map());
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkExpiresInDays, setShareLinkExpiresInDays] = useState<number | undefined>(undefined);
  const [linkLoading, setLinkLoading] = useState(false);
  const [shareRole, setShareRole] = useState<'viewer' | 'member' | 'admin'>('viewer');
  const [shareExpirationDays, setShareExpirationDays] = useState('');
  const [shareEmails, setShareEmails] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const initialFilenameRef = useRef<string | null>(null);

  useEffect(() => {
    if (share === '1') setShowShareModal(true);
  }, [share]);

  const socketRef = useRef<Socket | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedRef = useRef(false);
  const contentTextRef = useRef('');
  const editorRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const formatSelectionRef = useRef({ start: 0, end: 0 });
  hasUnsavedRef.current = hasUnsavedChanges;
  contentTextRef.current = contentText;
  if (selection.start !== 0 || selection.end !== 0) selectionRef.current = selection;

  // Load draft content
  useEffect(() => {
    if (!draftId || isNaN(draftId)) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await apiClient.getDraftContent(draftId);
        if (cancelled) return;
        if ((res as any)?.success) {
          const html = (res as any).content_html || '';
          const name = (res as any).filename || 'Untitled Draft';
          setFilename(name);
          initialFilenameRef.current = name;
          setContentText(stripHtmlToText(html));
        } else {
          Alert.alert('Error', 'Failed to load draft', [{ text: 'OK', onPress: () => router.back() }]);
        }
      } catch (e: any) {
        if (!cancelled) {
          Alert.alert('Error', e?.message || 'Failed to load draft', [{ text: 'OK', onPress: () => router.back() }]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draftId, router]);

  // Socket.IO: connect, join document room, presence
  useEffect(() => {
    if (!draftId || isNaN(draftId) || !user?.id) return;
    let socket: Socket | null = null;
    const currentUserId = parseInt(String(user.id), 10);
    if (isNaN(currentUserId)) return;

    const displayName = user.name || user.email || 'Someone';

    (async () => {
      try {
        const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (!token) return;

        socket = io(API_BASE_URL, {
          auth: { token },
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
          timeout: 20000,
        });

        socket.on('connect', () => {
          socket?.emit('join_document_room', {
            doc_type: 'file',
            doc_id: draftId,
            user_id: currentUserId,
            display_name: displayName,
          });
        });

        socket.on('doc_presence_list', (data: { members?: Array<{ user_id: number; display_name: string }> }) => {
          const members = data.members || [];
          setPresenceEditors(prev => {
            const next = new Map(prev);
            members.forEach(m => {
              if (m.user_id !== currentUserId) next.set(m.user_id, m.display_name || 'Someone');
            });
            return next;
          });
        });

        socket.on('doc_presence', (data: { user_id: number; display_name: string; joined: boolean }) => {
          if (data.user_id === currentUserId) return;
          setPresenceEditors(prev => {
            const next = new Map(prev);
            if (data.joined) next.set(data.user_id, data.display_name || 'Someone');
            else next.delete(data.user_id);
            return next;
          });
        });

        socketRef.current = socket;
      } catch (e) {
        console.warn('Draft socket init failed:', e);
      }
    })();

    return () => {
      if (socket?.connected) {
        socket.emit('leave_document_room', {
          doc_type: 'file',
          doc_id: draftId,
          user_id: currentUserId,
          display_name: displayName,
        });
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [draftId, user?.id, user?.name, user?.email]);

  const handleSave = useCallback(async (text?: string) => {
    const t = text ?? contentTextRef.current;
    if (!draftId || isNaN(draftId)) return;
    setSaving(true);
    try {
      const html = textToSimpleHtml(t);
      await apiClient.saveDraft(draftId, html, t);
      setHasUnsavedChanges(false);
    } catch (e: any) {
      if (e?.message?.includes('409') || (e?.response?.status === 409)) {
        Alert.alert('Someone else is editing', 'Your changes were not saved. Someone else is editing this draft.');
      } else {
        Alert.alert('Error', e?.message || 'Failed to save draft');
      }
    } finally {
      setSaving(false);
    }
  }, [draftId]);

  const handleContentChange = useCallback((text: string) => {
    setContentText(text);
    setHasUnsavedChanges(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      handleSave(text);
    }, 2000);
  }, [handleSave]);

  const handleSelectionChange = useCallback((e: any) => {
    const { start, end } = e.nativeEvent.selection;
    setSelection({ start, end });
    formatSelectionRef.current = { start, end };
    if (start !== 0 || end !== 0) selectionRef.current = { start, end };
  }, []);

  const captureSelectionForFormat = useCallback(() => {
    formatSelectionRef.current = { ...selectionRef.current };
  }, []);

  const applyFormat = useCallback((prefix: string, suffix: string) => {
    const { start, end } = formatSelectionRef.current;
    const text = contentTextRef.current;
    const len = text.length;
    const safeStart = Math.min(Math.max(0, start), len);
    const safeEnd = Math.min(Math.max(safeStart, end), len);
    const before = text.slice(0, safeStart);
    const selected = text.slice(safeStart, safeEnd);
    const after = text.slice(safeEnd);
    const newText = before + prefix + selected + suffix + after;
    const newCursor = Math.min(safeStart + prefix.length + selected.length + suffix.length, newText.length);
    setContentText(newText);
    contentTextRef.current = newText;
    setSelection({ start: newCursor, end: newCursor });
    formatSelectionRef.current = { start: newCursor, end: newCursor };
    setHasUnsavedChanges(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      handleSave(newText);
    }, 2000);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      setSelection({ start: newCursor, end: newCursor });
    });
  }, [handleSave]);

  const insertAtCursor = useCallback((insert: string) => {
    const { start, end } = formatSelectionRef.current;
    const text = contentTextRef.current;
    const len = text.length;
    const safeStart = Math.min(Math.max(0, start), len);
    const safeEnd = Math.min(Math.max(safeStart, end), len);
    const before = text.slice(0, safeStart);
    const after = text.slice(safeEnd);
    const newText = before + insert + after;
    const newCursor = Math.min(safeStart + insert.length, newText.length);
    setContentText(newText);
    contentTextRef.current = newText;
    setSelection({ start: newCursor, end: newCursor });
    formatSelectionRef.current = { start: newCursor, end: newCursor };
    setHasUnsavedChanges(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      handleSave(newText);
    }, 2000);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      setSelection({ start: newCursor, end: newCursor });
    });
  }, [handleSave]);

  const handleRenameBlur = useCallback(async () => {
    const name = (filename || '').trim() || 'Untitled Draft';
    if (name === (initialFilenameRef.current ?? '')) return;
    if (!draftId || isNaN(draftId)) return;
    try {
      await apiClient.renameFile(draftId, name);
      setFilename(name);
      initialFilenameRef.current = name;
    } catch (e: any) {
      Alert.alert('Rename failed', e?.message || 'Could not rename draft');
    }
  }, [draftId, filename]);

  const handleBack = useCallback(() => {
    if (hasUnsavedRef.current) {
      Alert.alert('Unsaved changes', 'Leave without saving?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  }, [router]);

  const others = Array.from(presenceEditors.entries()).map(([uid, name]) => ({ id: uid, name }));
  const othersLabel = others.length === 0 ? '' : others.length === 1 ? `${others[0].name} is editing` : `${others.map(o => o.name).join(', ')} are editing`;

  const handleCreateShareLink = useCallback(async () => {
    if (!draftId || isNaN(draftId)) return;
    setLinkLoading(true);
    try {
      const expiresInDays = shareExpirationDays.trim() ? parseInt(shareExpirationDays.trim(), 10) : undefined;
      const effectiveExpiry = expiresInDays && !isNaN(expiresInDays) ? expiresInDays : undefined;
      const res = await apiClient.createFileShareLink(draftId, {
        role: shareRole,
        expires_in_days: effectiveExpiry,
      });
      const link = (res as any)?.link ?? null;
      setShareLink(link);
      setShareLinkExpiresInDays(effectiveExpiry);
      if (!link) Alert.alert('Error', (res as any)?.message || 'Failed to create link');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create link');
    } finally {
      setLinkLoading(false);
    }
  }, [draftId, shareRole, shareExpirationDays]);

  const handleCopyLink = useCallback(async () => {
    if (shareLink) {
      await Clipboard.setStringAsync(shareLink);
      Alert.alert('Copied', 'Link copied to clipboard');
    }
  }, [shareLink]);

  const handleSendInviteEmail = useCallback(async () => {
    if (!shareLink || !draftId) {
      Alert.alert('Create link first', 'Create a share link before sending by email.');
      return;
    }
    const emails = shareEmails.split(/[,\n]/).map(e => e.trim()).filter(e => e && e.includes('@'));
    if (emails.length === 0) {
      Alert.alert('Error', 'Enter at least one valid email address.');
      return;
    }
    setSendingEmail(true);
    try {
      await apiClient.sendFileShareLinkEmail(draftId, {
        share_link: shareLink,
        emails,
        message: shareMessage || undefined,
      });
      Alert.alert('Sent', `Invitation sent to ${emails.length} recipient(s).`);
      setShareEmails('');
      setShareMessage('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send email');
    } finally {
      setSendingEmail(false);
    }
  }, [draftId, shareLink, shareEmails, shareMessage]);

  const displayFilename = filename && filename !== 'Untitled Draft' ? `${filename}.txt` : 'Untitled Draft.txt';
  const roleOptions: { value: 'viewer' | 'member' | 'admin'; label: string }[] = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'member', label: 'Member' },
    { value: 'admin', label: 'Admin' },
  ];

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backBtn: { padding: 8, marginRight: 4 },
    titleWrap: { flex: 1, minWidth: 0 },
    title: { fontSize: 17, fontWeight: '600', color: colors.text },
    titleInput: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
      padding: 0,
      margin: 0,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    headerBtn: { padding: 8 },
    presenceBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.border + '40',
    },
    presenceText: { fontSize: 12, color: colors.textSecondary, marginLeft: 6 },
    toolbar: {
      minHeight: 48,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    toolbarScroll: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 36 },
    toolBtn: { padding: 8, marginRight: 4, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
    editorWrap: { flex: 1, padding: 12 },
    editor: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      textAlignVertical: 'top',
      minHeight: 200,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalBox: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 0,
      minWidth: 280,
      maxWidth: 400,
      maxHeight: '90%',
      alignSelf: 'center',
    },
    modalBodyScroll: {
      padding: 20,
      paddingBottom: 16,
      flexGrow: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    modalTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginLeft: 8 },
    modalCloseBtn: { padding: 8, margin: -8 },
    modalFileName: { fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
    modalLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
    modalLabelHint: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
    modalRoleRow: { flexDirection: 'row', marginBottom: 16 },
    modalRoleOption: {
      flex: 1,
      marginRight: 8,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
    },
    modalRoleOptionActive: { borderColor: '#007AFF', backgroundColor: '#007AFF20' },
    modalRoleOptionInactive: { borderColor: colors.border, backgroundColor: colors.background },
    modalBtn: {
      backgroundColor: '#007AFF',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 12,
    },
    modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    modalBtnSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 12,
    },
    modalBtnSecondaryText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    modalBtnGreen: { backgroundColor: '#34C759' },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.background,
      minHeight: 44,
      marginBottom: 12,
    },
    modalLinkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    modalLinkInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
      color: colors.text,
      backgroundColor: colors.background,
    },
    modalCopyBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#007AFF' },
    modalCopyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    modalSection: { marginBottom: 20 },
    modalSectionTitle: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    modalSectionTitleText: { fontSize: 15, fontWeight: '600', color: colors.text, marginLeft: 6 },
  }), [colors]);

  if (loading) {
    return (
      <SafeAreaView style={[dynamicStyles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary || '#007AFF'} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity style={dynamicStyles.backBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={dynamicStyles.titleWrap}>
            <TextInput
              style={dynamicStyles.titleInput}
              value={filename}
              onChangeText={setFilename}
              onBlur={handleRenameBlur}
              placeholder="Untitled Draft"
              placeholderTextColor={colors.textSecondary}
              selectTextOnFocus
              returnKeyType="done"
              blurOnSubmit
              underlineColorAndroid="transparent"
            />
          </View>
          <View style={dynamicStyles.headerActions}>
            <TouchableOpacity style={dynamicStyles.headerBtn} onPress={() => setShowShareModal(true)}>
              <Ionicons name="share-outline" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.headerBtn} onPress={() => setShowShareModal(true)}>
              <Ionicons name="person-add-outline" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.headerBtn} onPress={() => handleSave()} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="save-outline" size={22} color={colors.text} />}
            </TouchableOpacity>
          </View>
        </View>

        {othersLabel ? (
          <View style={dynamicStyles.presenceBar}>
            <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
            <Text style={dynamicStyles.presenceText}>{othersLabel}</Text>
          </View>
        ) : null}

        <View style={dynamicStyles.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.toolbarScroll} keyboardShouldPersistTaps="always">
          <TouchableOpacity style={dynamicStyles.toolBtn} onPressIn={captureSelectionForFormat} onPress={() => applyFormat('**', '**')} accessibilityLabel="Bold">
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.toolBtn} onPressIn={captureSelectionForFormat} onPress={() => applyFormat('_', '_')} accessibilityLabel="Italic">
            <Text style={{ fontSize: 16, fontStyle: 'italic', fontWeight: '600', color: colors.text }}>I</Text>
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.toolBtn} onPressIn={captureSelectionForFormat} onPress={() => applyFormat('__', '__')} accessibilityLabel="Underline">
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' }}>U</Text>
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.toolBtn} onPressIn={captureSelectionForFormat} onPress={() => insertAtCursor('\n• ')} accessibilityLabel="Bullet list">
            <Ionicons name="ellipse-outline" size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.toolBtn} onPressIn={captureSelectionForFormat} onPress={() => insertAtCursor('\n1. ')} accessibilityLabel="Numbered list">
            <Ionicons name="reorder-three-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.toolBtn} onPressIn={captureSelectionForFormat} onPress={() => insertAtCursor('\n# ')} accessibilityLabel="Heading">
            <Ionicons name="document-text-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.toolBtn} onPressIn={captureSelectionForFormat} onPress={() => applyFormat('[', '](url)')} accessibilityLabel="Link">
            <Ionicons name="link-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={dynamicStyles.editorWrap}>
          <TextInput
            ref={editorRef}
            style={[dynamicStyles.editor, { backgroundColor: colors.background }]}
            value={contentText}
            onChangeText={handleContentChange}
            onSelectionChange={handleSelectionChange}
            selection={selection}
            placeholder="Start typing..."
            placeholderTextColor={colors.textSecondary}
            multiline
          />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showShareModal} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          style={dynamicStyles.modalOverlay}
          onPress={() => {
            setShowShareModal(false);
            setShareLink(null);
            setShareLinkExpiresInDays(undefined);
          }}
        >
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={dynamicStyles.modalBox}>
            <View style={dynamicStyles.modalHeader}>
              <View style={dynamicStyles.modalTitleRow}>
                <Ionicons name="paper-plane" size={22} color="#007AFF" />
                <Text style={dynamicStyles.modalTitle}>Share file</Text>
              </View>
              <TouchableOpacity
                style={dynamicStyles.modalCloseBtn}
                onPress={() => { setShowShareModal(false); setShareLink(null); setShareLinkExpiresInDays(undefined); }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={dynamicStyles.modalBodyScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              <Text style={dynamicStyles.modalFileName} numberOfLines={1}>{displayFilename}</Text>

              {!shareLink ? (
                <>
                  <Text style={dynamicStyles.modalLabel}>Access Role</Text>
                  <View style={dynamicStyles.modalRoleRow}>
                    {roleOptions.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          dynamicStyles.modalRoleOption,
                          shareRole === opt.value ? dynamicStyles.modalRoleOptionActive : dynamicStyles.modalRoleOptionInactive,
                        ]}
                        onPress={() => setShareRole(opt.value)}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: shareRole === opt.value ? '#007AFF' : colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={dynamicStyles.modalLabel}>Expiration (days)</Text>
                  <Text style={dynamicStyles.modalLabelHint}>Leave empty for no expiration</Text>
                  <TextInput
                    style={dynamicStyles.modalInput}
                    placeholder="e.g., 7"
                    placeholderTextColor={colors.textSecondary}
                    value={shareExpirationDays}
                    onChangeText={setShareExpirationDays}
                    keyboardType="number-pad"
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                    <TouchableOpacity
                      style={[dynamicStyles.modalBtnSecondary, { marginBottom: 0 }]}
                      onPress={() => { setShowShareModal(false); setShareLink(null); setShareLinkExpiresInDays(undefined); }}
                    >
                      <Text style={dynamicStyles.modalBtnSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[dynamicStyles.modalBtn, { marginBottom: 0, marginLeft: 12, minWidth: 120 }]}
                      onPress={handleCreateShareLink}
                      disabled={linkLoading}
                    >
                      {linkLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={dynamicStyles.modalBtnText}>Create Link</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={dynamicStyles.modalSection}>
                    <View style={dynamicStyles.modalSectionTitle}>
                      <Ionicons name="link" size={18} color={colors.text} />
                      <Text style={dynamicStyles.modalSectionTitleText}>Share Link</Text>
                    </View>
                    <View style={dynamicStyles.modalLinkRow}>
                      <TextInput
                        style={dynamicStyles.modalLinkInput}
                        value={shareLink}
                        editable={false}
                        selectTextOnFocus
                      />
                      <TouchableOpacity style={[dynamicStyles.modalCopyBtn, { marginLeft: 8 }]} onPress={handleCopyLink}>
                        <Text style={dynamicStyles.modalCopyBtnText}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[dynamicStyles.modalLabelHint, { marginBottom: 0 }]}>
                      {shareLinkExpiresInDays
                        ? `This link expires in ${shareLinkExpiresInDays} day(s). Anyone with this link can access the file.`
                        : 'This link does not expire. Anyone with this link can access the file with viewer permissions.'}
                    </Text>
                  </View>

                  <View style={dynamicStyles.modalSection}>
                    <View style={dynamicStyles.modalSectionTitle}>
                      <Ionicons name="mail-outline" size={18} color={colors.text} />
                      <Text style={dynamicStyles.modalSectionTitleText}>Send via Email</Text>
                    </View>
                    <TextInput
                      style={[dynamicStyles.modalInput, { minHeight: 72 }]}
                      placeholder="Email Addresses (comma or newline separated)"
                      placeholderTextColor={colors.textSecondary}
                      value={shareEmails}
                      onChangeText={setShareEmails}
                      multiline
                    />
                    <Text style={[dynamicStyles.modalLabelHint, { marginBottom: 6 }]}>
                      Enter multiple email addresses separated by commas or new lines
                    </Text>
                    <TextInput
                      style={[dynamicStyles.modalInput, { minHeight: 60 }]}
                      placeholder="Add a personal message..."
                      placeholderTextColor={colors.textSecondary}
                      value={shareMessage}
                      onChangeText={setShareMessage}
                      multiline
                    />
                    <TouchableOpacity
                      style={[dynamicStyles.modalBtn, dynamicStyles.modalBtnGreen]}
                      onPress={handleSendInviteEmail}
                      disabled={sendingEmail}
                    >
                      {sendingEmail ? <ActivityIndicator size="small" color="#fff" /> : <Text style={dynamicStyles.modalBtnText}>Send Email</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
