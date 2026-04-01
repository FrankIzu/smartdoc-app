import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    Dimensions,
    Keyboard,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';
import { WebView } from 'react-native-webview';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, STORAGE_KEYS } from '../../../constants/Config';
import { useHeaderVisibility } from '../../../contexts/HeaderVisibilityContext';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { apiClient } from '../../../services/api';
import { toAlertMessage } from '../../../utils/alertUtils';
import { draftsCache, isNetworkError } from '../../../utils/draftsCache';
import { secureStorage } from '../../../utils/storage';
import { AnimatedHeaderContainer } from '../../components/AnimatedHeaderContainer';
import { TapToToggleHeaderView } from '../../components/TapToToggleHeaderView';
import { useAuth } from '../../context/auth';

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

function stripExtension(name?: string): string {
  if (!name) return 'Untitled Draft';
  return name.replace(/\.[^./\\]+$/, '');
}

/** Base editor HTML with empty content; real content is injected in onLoadEnd to avoid escaping/timing issues. */
function getRichEditorBaseHtml(bgColor: string, textColor: string): string {
  const safeBg = bgColor.replace(/[^a-zA-Z0-9#(),.% ]/g, '');
  const safeText = textColor.replace(/[^a-zA-Z0-9#(),.% ]/g, '');
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/><style>
    *{box-sizing:border-box}
    body{margin:0;padding:0;padding-left:12px;padding-right:12px;padding-bottom:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5;background:${safeBg};color:${safeText};min-height:100vh;-webkit-user-select:auto;user-select:auto}
    #content{outline:0;min-height:200px}
    #content:empty:before{content:attr(data-placeholder);color:gray}
  </style></head><body><div id="content" contenteditable="true" data-placeholder="Start typing..."></div>
  <script>
    (function(){
      var el=document.getElementById('content');
      el.innerHTML='<p><br><\\/p>';
      function send(){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(el.innerHTML); }
      setTimeout(function(){
        el.addEventListener('input',send);
        el.addEventListener('blur',send);
      },0);
      var lastTap=0;
      el.addEventListener('touchend',function(e){
        var now=Date.now();
        if(now-lastTap<300){
          if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('__DOUBLE_TAP__');
          e.preventDefault();
        }
        lastTap=now;
      });
    })();
  </script></body></html>`;
}

export default function DraftEditScreen() {
  const { id, share } = useLocalSearchParams<{ id: string; share?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const draftId = id ? parseInt(id, 10) : NaN;
  const { toggleHeader, toggleEnabled } = useHeaderVisibility();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [filename, setFilename] = useState('Untitled Draft');
  const [contentText, setContentText] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [initialEditorHtml, setInitialEditorHtml] = useState<string | null>(null);
  const [presenceEditors, setPresenceEditors] = useState<Map<number, string>>(new Map());
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSendLinkModal, setShowSendLinkModal] = useState(false);
  const [showEditorsModal, setShowEditorsModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkExpiresInDays, setShareLinkExpiresInDays] = useState<number | undefined>(undefined);
  const [linkLoading, setLinkLoading] = useState(false);
  const [shareRole, setShareRole] = useState<'viewer' | 'member' | 'admin'>('viewer');
  const [shareExpirationDays, setShareExpirationDays] = useState('');
  const [shareEmails, setShareEmails] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [externalShares, setExternalShares] = useState<Array<{
    id: number;
    share_type: string;
    role: string;
    is_active: boolean;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
    token?: string;
  }>>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showColorPicker, setShowColorPicker] = useState<'fore' | 'back' | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'local' | 'error' | null>(null);
  const initialFilenameRef = useRef<string | null>(null);
  const currentFilenameRef = useRef<string>('Untitled Draft');
  const renameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedRef = useRef(false);
  currentFilenameRef.current = filename;

  useEffect(() => {
    if (share === '1') setShowShareModal(true);
  }, [share]);

  // Load external shares when modals open
  useEffect(() => {
    if ((showShareModal || showSendLinkModal) && draftId && !isNaN(draftId)) {
      loadExternalShares();
    }
  }, [showShareModal, showSendLinkModal, draftId]);

  const loadExternalShares = useCallback(async () => {
    if (!draftId || isNaN(draftId)) return;
    setLoadingShares(true);
    try {
      const res = await apiClient.getFileExternalShares(draftId);
      if ((res as any)?.success) {
        setExternalShares((res as any).shares || []);
      }
    } catch (e: any) {
      // Only pass strings to console - passing objects can cause "cannot be cast to String" native crash
      const msg = e?.message ?? (typeof e?.response?.data?.message === 'string' ? e.response.data.message : null) ?? 'Unknown error';
      console.error('Failed to load external shares:', msg);
    } finally {
      setLoadingShares(false);
    }
  }, [draftId]);

  const handleRevokeShare = useCallback(async (shareId: number) => {
    if (!draftId || isNaN(draftId)) return;
    Alert.alert(
      'Revoke Share Link',
      'Are you sure you want to revoke this share link? It will no longer be accessible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiClient.revokeFileShare(draftId, shareId);
              if ((res as any)?.success) {
                Alert.alert('Success', 'Share link revoked');
                loadExternalShares();
                // Clear shareLink if the revoked share matches the current one
                if (shareLink) {
                  const share = externalShares.find(s => s.id === shareId);
                  if (share?.token && shareLink.includes(share.token)) {
                    setShareLink(null);
                  }
                }
              } else {
                Alert.alert('Error', toAlertMessage((res as any)?.message, 'Failed to revoke share link'));
              }
            } catch (e: any) {
              Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Failed to revoke share link'));
            }
          },
        },
      ]
    );
  }, [draftId, shareLink, externalShares, loadExternalShares]);

  const handleDeleteShare = useCallback(async (shareId: number) => {
    if (!draftId || isNaN(draftId)) return;
    Alert.alert(
      'Delete Share Link',
      'Are you sure you want to permanently delete this revoked share link? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiClient.deleteFileShare(draftId, shareId);
              if ((res as any)?.success) {
                Alert.alert('Success', 'Share link deleted');
                loadExternalShares();
              } else {
                Alert.alert('Error', toAlertMessage((res as any)?.message, 'Failed to delete share link'));
              }
            } catch (e: any) {
              Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Failed to delete share link'));
            }
          },
        },
      ]
    );
  }, [draftId, loadExternalShares]);

  // Reset share link state when modals close
  useEffect(() => {
    if (!showShareModal && !showSendLinkModal) {
      // Don't reset shareLink here - keep it so user can reopen send modal
    }
  }, [showShareModal, showSendLinkModal]);

  const socketRef = useRef<Socket | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedRef = useRef(false);
  const contentTextRef = useRef('');
  const editorRef = useRef<TextInput>(null);
  const webViewRef = useRef<WebView>(null);
  const contentHtmlRef = useRef('');
  const saveRequestedRef = useRef(false);
  const ignoreFirstEmptyMessageRef = useRef(false);
  const contentToInjectRef = useRef<string>('');
  const selectionRef = useRef({ start: 0, end: 0 });
  const formatSelectionRef = useRef({ start: 0, end: 0 });
  const lastKnownVersionRef = useRef<number | null>(null);
  const lastKnownUpdatedAtRef = useRef<string | null>(null);
  const refetchDraftContentRef = useRef<((version: number, updatedAt: string) => Promise<void>) | null>(null);
  hasUnsavedRef.current = hasUnsavedChanges;
  contentTextRef.current = contentText;
  contentHtmlRef.current = contentHtml;
  if (selection.start !== 0 || selection.end !== 0) selectionRef.current = selection;

  // Keyboard: show toolbar above keyboard when it opens
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Load draft content — cache-first for instant offline access
  useEffect(() => {
    if (!draftId || isNaN(draftId)) return;
    draftLoadedRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);

        // 1. Load from local cache immediately (no network needed)
        const cached = await draftsCache.getDraftContent(draftId);
        if (cached && !cancelled) {
          const cachedHtml = cached.content_html || '<p><br></p>';
          setFilename(cached.filename || 'Untitled Draft');
          initialFilenameRef.current = cached.filename || 'Untitled Draft';
          setContentText(stripHtmlToText(cachedHtml));
          setContentHtml(cachedHtml);
          setInitialEditorHtml(cachedHtml);
          contentToInjectRef.current = cachedHtml;
          if (cached.version != null) lastKnownVersionRef.current = Number(cached.version);
          if (cached.updated_at != null) lastKnownUpdatedAtRef.current = String(cached.updated_at);
          ignoreFirstEmptyMessageRef.current = !!(cachedHtml && stripHtmlToText(cachedHtml).trim());
          draftLoadedRef.current = true;
          setLoading(false);
        }

        // Local-only drafts (negative IDs) never fetch from API.
        if (draftsCache.isLocalDraftId(draftId)) {
          setIsOffline(true);
          if (!cached) {
            const emptyHtml = '<p><br></p>';
            setFilename('Untitled Draft');
            initialFilenameRef.current = 'Untitled Draft';
            setContentText('');
            setContentHtml(emptyHtml);
            setInitialEditorHtml(emptyHtml);
            contentToInjectRef.current = emptyHtml;
            draftLoadedRef.current = true;
          }
          return;
        }

        // 2. Fetch from API to get latest version
        const res = await apiClient.getDraftContent(draftId);
        if (cancelled) return;
        if ((res as any)?.success) {
          const data = (res as any).data ?? res;
          const html = (res as any).content_html ?? data?.content_html ?? '';
          const name = (res as any).filename ?? data?.filename ?? 'Untitled Draft';
          const ver = (res as any).version ?? data?.version;
          const updatedAt = (res as any).updated_at ?? data?.updated_at;

          // Only update UI if server has newer content than cache
          const serverVersion = ver != null ? Number(ver) : null;
          const cacheVersion = cached?.version != null ? Number(cached.version) : null;
          const serverIsNewer = serverVersion == null || cacheVersion == null || serverVersion > cacheVersion;

          if (serverIsNewer || !cached) {
            setFilename(name);
            initialFilenameRef.current = name;
            draftLoadedRef.current = true;
            setContentText(stripHtmlToText(html));
            setContentHtml(html);
            const safeHtml = html || '<p><br></p>';
            setInitialEditorHtml(safeHtml);
            contentToInjectRef.current = safeHtml;
            if (ver != null) lastKnownVersionRef.current = Number(ver);
            if (updatedAt != null) lastKnownUpdatedAtRef.current = String(updatedAt);
            ignoreFirstEmptyMessageRef.current = !!(html && stripHtmlToText(html).trim());
            // Inject updated content into WebView if already rendered
            if (cached) {
              const script = `(function(){ var el=document.getElementById('content'); if(el) el.innerHTML=${JSON.stringify(safeHtml)}; })(); true;`;
              webViewRef.current?.injectJavaScript(script);
            }
          }

          setIsOffline(false);
          // Persist to cache
          await draftsCache.saveDraftContent(draftId, {
            filename: name,
            content_html: html,
            version: ver != null ? Number(ver) : undefined,
            updated_at: updatedAt != null ? String(updatedAt) : undefined,
          });

          await flushPendingOpsForDraft();
        } else if (!cached) {
          Alert.alert('Error', 'Failed to load draft', [{ text: 'OK', onPress: () => router.back() }]);
        }
      } catch (e: any) {
        if (cancelled) return;
        if (isNetworkError(e)) {
          setIsOffline(true);
          if (!draftLoadedRef.current) {
            // No cache and no network — go back
            Alert.alert('Offline', 'This note is not available offline yet. Open it while online first to cache it locally.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          }
          // If we loaded from cache, stay on screen — already showing cached content
        } else {
          if (!draftLoadedRef.current) {
            Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Failed to load draft'), [
              { text: 'OK', onPress: () => router.back() },
            ]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draftId, router]);

  // Socket.IO: connect, join document room, presence
  useEffect(() => {
    if (!draftId || isNaN(draftId) || draftsCache.isLocalDraftId(draftId) || !user?.id) return;
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
          // Network just came back — flush any locally queued save immediately
          flushPendingOpsForDraft();
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

        socket.on('draft_saved', (data: { draft_id: number; version: number; updated_at: string }) => {
          if (data.draft_id !== draftId) return;
          if (data.version <= (lastKnownVersionRef.current ?? 0)) return;
          if (hasUnsavedRef.current) {
            Alert.alert(
              'Draft updated elsewhere',
              'This draft was updated on another device. Reload?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reload', onPress: () => refetchDraftContentRef.current?.(data.version, data.updated_at) },
              ]
            );
            return;
          }
          refetchDraftContentRef.current?.(data.version, data.updated_at);
        });

        socketRef.current = socket;
      } catch (e: any) {
        console.warn('Draft socket init failed:', typeof e?.message === 'string' ? e.message : 'Unknown error');
      }
    })();

    return () => {
      if (socket) {
        socket.off('draft_saved');
        if (socket.connected) {
          socket.emit('leave_document_room', {
            doc_type: 'file',
            doc_id: draftId,
            user_id: currentUserId,
            display_name: displayName,
          });
          socket.disconnect();
        }
      }
      socketRef.current = null;
    };
  }, [draftId, user?.id, user?.name, user?.email]);

  const normalizeHtml = useCallback((html: string): string => {
    if (!html) return '<p></p>';
    // Preserve all formatting tags exactly as generated by document.execCommand
    // Only do minimal normalization for consistency
    let normalized = html;
    
    // Normalize <b> to <strong> for consistency (strong is better semantic HTML and works better with CSS)
    normalized = normalized.replace(/<b\b([^>]*)>/gi, '<strong$1>');
    normalized = normalized.replace(/<\/b>/gi, '</strong>');
    
    // Normalize <i> to <em> for consistency (em is better semantic HTML)
    normalized = normalized.replace(/<i\b([^>]*)>/gi, '<em$1>');
    normalized = normalized.replace(/<\/i>/gi, '</em>');
    
    // Debug: log HTML being saved (remove in production if needed)
    if (__DEV__) {
      console.log('Saving HTML:', normalized.substring(0, 200));
    }
    
    return normalized;
  }, []);

  const handleSave = useCallback(async (textOrHtml?: string, isHtml = false) => {
    if (!draftId || isNaN(draftId)) return;
    let html = isHtml ? (textOrHtml ?? contentHtmlRef.current) : textToSimpleHtml(textOrHtml ?? contentTextRef.current);
    if (isHtml) {
      html = normalizeHtml(html);
    }
    const plainText = stripHtmlToText(html);

    // Always persist locally first so content is never lost
    await draftsCache.saveDraftContent(draftId, {
      filename: currentFilenameRef.current || 'Untitled Draft',
      content_html: html,
      version: lastKnownVersionRef.current ?? undefined,
      updated_at: lastKnownUpdatedAtRef.current ?? undefined,
    });

    setSaving(true);
    setSaveStatus('saving');
    try {
      if (draftsCache.isLocalDraftId(draftId)) {
        await draftsCache.updatePendingCreate(draftId, {
          html,
          plainText,
          filename: currentFilenameRef.current || 'Untitled Draft',
        });
        setIsOffline(true);
        setSaveStatus('local');
        setHasUnsavedChanges(false);
        return;
      }
      // Debug: verify HTML contains formatting tags
      if (__DEV__) {
        const hasBold = /<(strong|b)>/i.test(html);
        const hasItalic = /<(em|i)>/i.test(html);
        const hasLinks = /<a\s+href/i.test(html);
        const hasLists = /<(ul|ol|li)>/i.test(html);
        console.log('Formatting check:', { hasBold, hasItalic, hasLinks, hasLists });
      }
      const res = await apiClient.saveDraft(draftId, html, plainText);
      setHasUnsavedChanges(false);
      setIsOffline(false);
      setSaveStatus('saved');
      // Remove from pending queue on successful save
      await draftsCache.removePendingSave(draftId);
      const file = (res as any)?.file ?? (res as any)?.data?.file;
      if (file?.version != null) lastKnownVersionRef.current = Number(file.version);
      if (file?.updated_at != null) lastKnownUpdatedAtRef.current = String(file.updated_at);
      // Update cache with server-confirmed version info
      await draftsCache.saveDraftContent(draftId, {
        filename: currentFilenameRef.current || 'Untitled Draft',
        content_html: html,
        version: lastKnownVersionRef.current ?? undefined,
        updated_at: lastKnownUpdatedAtRef.current ?? undefined,
      });
    } catch (e: any) {
      if (e?.message?.includes('409') || (e?.response?.status === 409)) {
        setSaveStatus('error');
        Alert.alert('Someone else is editing', 'Your changes were not saved. Someone else is editing this draft.');
      } else if (isNetworkError(e)) {
        // Queue for later sync — content already saved locally above
        setIsOffline(true);
        setSaveStatus('local');
        await draftsCache.addPendingSave({
          id: draftId,
          html,
          plainText,
          filename: currentFilenameRef.current || 'Untitled Draft',
        });
        setHasUnsavedChanges(false);
      } else {
        setSaveStatus('error');
        Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Failed to save draft'));
      }
    } finally {
      setSaving(false);
    }
  }, [draftId, normalizeHtml]);

  const refetchDraftContent = useCallback(async (version: number, updatedAt: string) => {
    if (!draftId || isNaN(draftId)) return;
    if (draftsCache.isLocalDraftId(draftId)) return;
    try {
      const res = await apiClient.getDraftContent(draftId);
      if (!(res as any)?.success) return;
      const data = (res as any).data ?? res;
      const html = (res as any).content_html ?? data?.content_html ?? '';
      const safeHtml = html || '<p><br></p>';
      setContentHtml(safeHtml);
      setContentText(stripHtmlToText(safeHtml));
      contentHtmlRef.current = safeHtml;
      contentTextRef.current = stripHtmlToText(safeHtml);
      setInitialEditorHtml(safeHtml);
      contentToInjectRef.current = safeHtml;
      lastKnownVersionRef.current = version;
      lastKnownUpdatedAtRef.current = updatedAt;
      setHasUnsavedChanges(false);
      const script = `(function(){ var el=document.getElementById('content'); if(el) el.innerHTML=${JSON.stringify(safeHtml)}; })(); true;`;
      webViewRef.current?.injectJavaScript(script);
    } catch (_) {
      // ignore refetch errors
    }
  }, [draftId]);

  useEffect(() => {
    refetchDraftContentRef.current = refetchDraftContent;
    return () => { refetchDraftContentRef.current = null; };
  }, [refetchDraftContent]);

  /** Flush pending save/rename for this draft to the server. Safe to call speculatively. */
  const flushPendingOpsForDraft = useCallback(async () => {
    if (!draftId || isNaN(draftId)) return;
    if (draftsCache.isLocalDraftId(draftId)) return;
    const pending = await draftsCache.getPendingSaves();
    const item = pending.find(p => p.id === draftId);
    if (item) {
      try {
        await apiClient.saveDraft(draftId, item.html, item.plainText);
        await draftsCache.removePendingSave(draftId);
        setIsOffline(false);
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
        if (item.filename) {
          await draftsCache.saveDraftContent(draftId, {
            filename: item.filename,
            content_html: item.html,
          });
        }
      } catch {
        return;
      }
    }

    const pendingRenames = await draftsCache.getPendingRenames();
    const rename = pendingRenames.find(r => r.id === draftId);
    if (!rename) return;
    try {
      await apiClient.renameFile(draftId, rename.filename);
      await draftsCache.removePendingRename(draftId);
      setIsOffline(false);
      setSaveStatus('saved');
    } catch {
      // Still offline — leave in queue
    }
  }, [draftId]);

  // Sync pending operations when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        flushPendingOpsForDraft();
      }
    });
    return () => sub.remove();
  }, [flushPendingOpsForDraft]);

  const handleContentChange = useCallback((text: string) => {
    setContentText(text);
    setHasUnsavedChanges(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      handleSave(text);
    }, 2000);
  }, [handleSave]);

  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    const rawHtml = event.nativeEvent.data || '';
    
    // Handle double-tap toggle header
    if (rawHtml === '__DOUBLE_TAP__') {
      if (toggleEnabled) {
        toggleHeader();
      }
      return;
    }
    
    const isEmpty = !rawHtml || rawHtml === '<p><br></p>' || !stripHtmlToText(rawHtml).trim();
    if (isEmpty && ignoreFirstEmptyMessageRef.current) {
      ignoreFirstEmptyMessageRef.current = false;
      return;
    }
    const html = normalizeHtml(rawHtml);
    setContentHtml(html);
    contentHtmlRef.current = html;
    setContentText(stripHtmlToText(html));
    contentTextRef.current = stripHtmlToText(html);
    if (saveRequestedRef.current) {
      saveRequestedRef.current = false;
      handleSave(html, true);
      return;
    }
    setHasUnsavedChanges(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      handleSave(html, true);
    }, 2000);
  }, [handleSave, normalizeHtml, toggleHeader, toggleEnabled]);

  const handleWebViewLoadEnd = useCallback(() => {
    const html = contentToInjectRef.current || '<p><br></p>';
    const script = `(function(){ var el=document.getElementById('content'); if(el) el.innerHTML=${JSON.stringify(html)}; })(); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const handleSelectionChange = useCallback((e: any) => {
    const { start, end } = e.nativeEvent.selection;
    setSelection({ start, end });
    formatSelectionRef.current = { start, end };
    if (start !== 0 || end !== 0) selectionRef.current = { start, end };
  }, []);

  const captureSelectionForFormat = useCallback(() => {
    formatSelectionRef.current = { ...selectionRef.current };
  }, []);

  const execCommandAndSync = useCallback((command: string, value?: string) => {
    const cmd = value !== undefined
      ? `document.execCommand('${command}', false, ${JSON.stringify(value)});`
      : `document.execCommand('${command}', false);`;
    webViewRef.current?.injectJavaScript(
      `(function(){ var el=document.getElementById('content'); if(el){ el.focus(); ${cmd} if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(el.innerHTML); } })(); true;`
    );
  }, []);

  const setForeColor = useCallback((color: string) => {
    // Use TipTap-compatible format: <span style="color: #hex">text</span>
    const script = `(function(){
      var el=document.getElementById('content');
      if(!el) return;
      el.focus();
      var sel=window.getSelection();
      if(!sel||sel.rangeCount===0) return;
      var range=sel.getRangeAt(0);
      if(range.collapsed) return;
      var span=document.createElement('span');
      span.style.color='${color}';
      try{range.surroundContents(span);}catch(e){
        var contents=range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
      }
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(el.innerHTML);
    })(); true;`;
    webViewRef.current?.injectJavaScript(script);
    setShowColorPicker(null);
  }, []);

  const setBackColor = useCallback((color: string) => {
    // Use TipTap-compatible format: <mark style="background-color: #hex">text</mark>
    const script = `(function(){
      var el=document.getElementById('content');
      if(!el) return;
      el.focus();
      var sel=window.getSelection();
      if(!sel||sel.rangeCount===0) return;
      var range=sel.getRangeAt(0);
      if(range.collapsed) return;
      var mark=document.createElement('mark');
      mark.style.backgroundColor='${color}';
      try{range.surroundContents(mark);}catch(e){
        var contents=range.extractContents();
        mark.appendChild(contents);
        range.insertNode(mark);
      }
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(el.innerHTML);
    })(); true;`;
    webViewRef.current?.injectJavaScript(script);
    setShowColorPicker(null);
  }, []);

  const insertTable = useCallback(() => {
    const script = `(function(){
      var el=document.getElementById('content');
      if(!el) return;
      el.focus();
      var table='<table border="1" style="border-collapse:collapse;width:100%;"><tr><td style="padding:8px;">&nbsp;</td><td style="padding:8px;">&nbsp;</td></tr><tr><td style="padding:8px;">&nbsp;</td><td style="padding:8px;">&nbsp;</td></tr></table>';
      document.execCommand('insertHTML',false,table);
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(el.innerHTML);
    })(); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const toggleLink = useCallback(() => {
    const script = `(function(){
      var el=document.getElementById('content');
      if(!el) return;
      el.focus();
      var sel=window.getSelection();
      if(!sel||sel.rangeCount===0) return;
      var range=sel.getRangeAt(0);
      var inLink=false;
      var node=range.commonAncestorContainer;
      while(node&&node!==el){
        if(node.nodeType===1&&node.nodeName&&node.nodeName.toUpperCase()==='A'){
          inLink=true;
          break;
        }
        node=node.parentNode;
      }
      if(inLink){
        document.execCommand('unlink',false);
      }else{
        if(range.collapsed){
          document.execCommand('createLink',false,'https://');
        }else{
          document.execCommand('createLink',false,'https://');
        }
      }
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(el.innerHTML);
    })(); true;`;
    webViewRef.current?.injectJavaScript(script);
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

  /** Persist current filename to server if it changed. Call on blur, Back, and Save. */
  const persistFilenameIfChanged = useCallback(async (): Promise<void> => {
    const name = (currentFilenameRef.current || '').trim() || 'Untitled Draft';
    if (name === (initialFilenameRef.current ?? '')) return;
    if (!draftId || isNaN(draftId)) return;
    // Always update local cache immediately
    await draftsCache.updateCachedFilename(draftId, name);
    initialFilenameRef.current = name;
    if (draftsCache.isLocalDraftId(draftId)) {
      await draftsCache.updatePendingCreate(draftId, { filename: name });
      return;
    }
    try {
      await apiClient.renameFile(draftId, name);
    } catch (e: any) {
      if (!isNetworkError(e)) throw e;
      await draftsCache.addPendingRename({ id: draftId, filename: name });
      setIsOffline(true);
      setSaveStatus('local');
    }
  }, [draftId]);

  const handleRenameBlur = useCallback(async () => {
    try {
      await persistFilenameIfChanged();
    } catch (e: any) {
      Alert.alert('Rename failed', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Could not rename draft'));
    }
  }, [persistFilenameIfChanged]);

  const handleBack = useCallback(async () => {
    try {
      await persistFilenameIfChanged();
    } catch (_) {
      // Allow leaving even if rename failed; user already has name in field
    }
    if (hasUnsavedRef.current) {
      Alert.alert('Unsaved changes', 'Leave without saving?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  }, [router, persistFilenameIfChanged]);

  // Debounced immediate save of filename when user types (persist after 600ms idle). Only run after draft has loaded so we don't trigger a rename on open (e.g. shared file permission error).
  useEffect(() => {
    if (!draftId || isNaN(draftId) || !draftLoadedRef.current) return;
    if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
    const name = (filename || '').trim() || 'Untitled Draft';
    if (name === (initialFilenameRef.current ?? '')) return;
    const timeoutId = setTimeout(() => {
      renameTimeoutRef.current = null;
      persistFilenameIfChanged().catch((e: any) => {
        Alert.alert('Rename failed', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Could not rename draft'));
      });
    }, 600);
    renameTimeoutRef.current = timeoutId;
    return () => {
      clearTimeout(timeoutId);
      if (renameTimeoutRef.current === timeoutId) renameTimeoutRef.current = null;
    };
  }, [draftId, filename, persistFilenameIfChanged]);

  const others = Array.from(presenceEditors.entries()).map(([uid, name]) => ({ id: uid, name }));
  const othersLabel = others.length === 0
    ? ''
    : others.length === 1
      ? `${others[0].name} is editing`
      : others.length === 2
        ? `${others[0].name} and ${others[1].name} are editing`
        : `${others.length} people are editing`;

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
      if (link) {
        // Reload shares to show the new link
        await loadExternalShares();
        // Close create modal and open send modal
        setShowShareModal(false);
        setShowSendLinkModal(true);
      } else {
        Alert.alert('Error', toAlertMessage((res as any)?.message, 'Failed to create link'));
      }
    } catch (e: any) {
      Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Failed to create link'));
    } finally {
      setLinkLoading(false);
    }
  }, [draftId, shareRole, shareExpirationDays]);

  const handleCopyLink = useCallback(async (link?: string) => {
    const linkToCopy = link || shareLink;
    if (linkToCopy) {
      await Clipboard.setStringAsync(linkToCopy);
      Alert.alert('Copied', 'Link copied to clipboard');
    }
  }, [shareLink]);

  const handleShareLink = useCallback((link: string) => {
    setShareLink(link);
    setShowShareModal(false);
    setShowSendLinkModal(true);
  }, []);

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
      setShowSendLinkModal(false);
    } catch (e: any) {
      Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Failed to send email'));
    } finally {
      setSendingEmail(false);
    }
  }, [draftId, shareLink, shareEmails, shareMessage]);

  const displayFilename = stripExtension(filename);
  const roleOptions: { value: 'viewer' | 'member' | 'admin'; label: string }[] = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'member', label: 'Member' },
    { value: 'admin', label: 'Admin' },
  ];

  const webViewSource = useMemo(
    () => ({ html: getRichEditorBaseHtml(colors.background || '#fff', colors.text || '#000') }),
    [colors.background, colors.text]
  );

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
    backBtn: { padding: 10, marginRight: 6, marginTop: 4 },
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
    headerBtn: { padding: 10, marginTop: 4 },
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FF9500',
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    offlineBannerText: {
      fontSize: 12,
      color: '#fff',
      fontWeight: '600',
      marginLeft: 6,
      flex: 1,
    },
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
    keyboardToolbar: {
      position: 'absolute',
      left: 8,
      right: 8,
      minHeight: 48,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    toolbarScroll: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, minHeight: 36 },
    toolBtn: { padding: 8, marginRight: 4, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
    editorWrap: { flex: 1, paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0 },
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
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    modalBoxCompact: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 0,
      minWidth: 320,
      maxWidth: 480,
      maxHeight: '80%',
      alignSelf: 'center',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    modalBody: {
      padding: 12,
      paddingBottom: 0,
      flexGrow: 0,
    },
    modalBodyScroll: {
      padding: 20,
      paddingBottom: 16,
      flexGrow: 0,
    },
    modalBodySendLink: {
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 12,
      flexGrow: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    modalTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginLeft: 8 },
    modalCloseBtn: { padding: 8, margin: -8 },
    modalFileName: { fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
    modalLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
    modalLabelHint: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
    modalRoleRow: { flexDirection: 'row', marginBottom: 12 },
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
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 0,
    },
    modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    modalBtnSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 0,
    },
    modalBtnSecondaryText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    modalBtnGreen: { backgroundColor: '#34C759' },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.background,
      minHeight: 40,
      marginBottom: 10,
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
    modalSectionSendLink: { marginBottom: 12 },
    modalSectionTitle: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    modalSectionTitleSendLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    modalSectionTitleText: { fontSize: 15, fontWeight: '600', color: colors.text, marginLeft: 6 },
    shareLinksContainer: { marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    shareLinksTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
    shareLinkItem: {
      flexDirection: 'column',
      paddingVertical: 6,
      paddingHorizontal: 0,
      marginBottom: 6,
    },
    shareLinkInfo: { flex: 1, minWidth: 0, marginBottom: 8 },
    shareLinkType: { fontSize: 13, fontWeight: '600', color: colors.text },
    shareLinkDetails: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
    shareLinkActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    shareLinkRevokeBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#FF3B30' },
    shareLinkRevokeBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    shareLinkDeleteBtn: { padding: 6, borderRadius: 6, backgroundColor: '#FF3B30' },
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
      <TapToToggleHeaderView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <AnimatedHeaderContainer height={100}>
          <View style={dynamicStyles.header}>
            <TouchableOpacity style={dynamicStyles.backBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={28} color={colors.text} />
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
              <TouchableOpacity style={dynamicStyles.headerBtn} onPress={() => {
                if (shareLink) {
                  setShowSendLinkModal(true);
                } else {
                  setShowShareModal(true);
                }
              }}>
                <Ionicons name="share-outline" size={26} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={dynamicStyles.headerBtn} onPress={() => {
                if (shareLink) {
                  setShowSendLinkModal(true);
                } else {
                  setShowShareModal(true);
                }
              }}>
                <Ionicons name="person-add-outline" size={26} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={dynamicStyles.headerBtn} onPress={async () => {
                try {
                  await persistFilenameIfChanged();
                } catch (_) {}
                saveRequestedRef.current = true;
                webViewRef.current?.injectJavaScript(
                  "(function(){ var el=document.getElementById('content'); if(el&&window.ReactNativeWebView) window.ReactNativeWebView.postMessage(el.innerHTML); })(); true;"
                );
                if (!webViewRef.current) handleSave(contentHtmlRef.current || '', true);
              }} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="save-outline" size={26} color={colors.text} />}
              </TouchableOpacity>
            </View>
          </View>
          {isOffline && (
            <View style={dynamicStyles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
              <Text style={dynamicStyles.offlineBannerText}>
                {saveStatus === 'local' ? 'Offline — saved locally, will sync when online' : 'Offline — changes saved locally'}
              </Text>
            </View>
          )}
          {!isOffline && saveStatus === 'local' && (
            <View style={[dynamicStyles.offlineBanner, { backgroundColor: '#34C759' }]}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
              <Text style={dynamicStyles.offlineBannerText}>Back online — syncing local changes...</Text>
            </View>
          )}
          {othersLabel ? (
            <TouchableOpacity
              style={dynamicStyles.presenceBar}
              onPress={() => setShowEditorsModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
              <Text style={dynamicStyles.presenceText}>{othersLabel}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ) : null}
        </AnimatedHeaderContainer>

        <View style={dynamicStyles.editorWrap}>
          {initialEditorHtml !== null ? (
            <WebView
              key={`draft-${draftId}`}
              ref={webViewRef}
              originWhitelist={['*']}
              source={webViewSource}
              onLoadEnd={handleWebViewLoadEnd}
              onMessage={handleWebViewMessage}
              style={[dynamicStyles.editor, { backgroundColor: colors.background, minHeight: 200 }]}
              scrollEnabled={true}
              keyboardDisplayRequiresUserAction={false}
              nestedScrollEnabled
              hideKeyboardAccessoryView={true}
            />
          ) : (
            <View style={[dynamicStyles.editor, { backgroundColor: colors.background, minHeight: 200, justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {keyboardHeight > 0 ? (
        <View style={[dynamicStyles.keyboardToolbar, { bottom: keyboardHeight }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={dynamicStyles.toolbarScroll}
            keyboardShouldPersistTaps="always"
          >
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('undo')} accessibilityLabel="Undo">
              <Ionicons name="return-up-back-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('redo')} accessibilityLabel="Redo">
              <Ionicons name="return-up-forward-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('bold')} accessibilityLabel="Bold">
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('italic')} accessibilityLabel="Italic">
              <Text style={{ fontSize: 16, fontStyle: 'italic', fontWeight: '600', color: colors.text }}>I</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('underline')} accessibilityLabel="Underline">
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' }}>U</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('insertUnorderedList')} accessibilityLabel="Bullet list">
              <Ionicons name="ellipse-outline" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('insertOrderedList')} accessibilityLabel="Numbered list">
              <Ionicons name="reorder-three-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={toggleLink} accessibilityLabel="Link">
              <Ionicons name="link-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => setShowColorPicker('fore')} accessibilityLabel="Text color">
              <Ionicons name="color-palette-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => setShowColorPicker('back')} accessibilityLabel="Background color">
              <Ionicons name="color-fill-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={insertTable} accessibilityLabel="Insert table">
              <Ionicons name="grid-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('indent')} accessibilityLabel="Indent">
              <Ionicons name="arrow-forward-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.toolBtn} onPress={() => execCommandAndSync('outdent')} accessibilityLabel="Outdent">
              <Ionicons name="arrow-back-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}

      {/* Color Picker Modal */}
      <Modal visible={showColorPicker !== null} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          style={dynamicStyles.modalOverlay}
          onPress={() => setShowColorPicker(null)}
        >
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={[dynamicStyles.modalBoxCompact, { minWidth: 200, maxWidth: 260 }]}>
            <View style={[dynamicStyles.modalHeader, { paddingTop: 8, paddingBottom: 6, paddingHorizontal: 12 }]}>
              <Text style={[dynamicStyles.modalTitle, { fontSize: 14, marginLeft: 4 }]}>
                {showColorPicker === 'fore' ? 'Text Color' : 'Background Color'}
              </Text>
              <TouchableOpacity
                style={dynamicStyles.modalCloseBtn}
                onPress={() => setShowColorPicker(null)}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 8, paddingBottom: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, width: 180 }}>
                {['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#808080', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080'].map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => showColorPicker === 'fore' ? setForeColor(color) : setBackColor(color)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: color,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      </TapToToggleHeaderView>

      {/* Currently editing – list of other editors */}
      <Modal visible={showEditorsModal} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          style={dynamicStyles.modalOverlay}
          onPress={() => setShowEditorsModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={[dynamicStyles.modalBox, { minWidth: 280, maxWidth: 360 }]}>
            <View style={[dynamicStyles.modalHeader, { paddingBottom: 12 }]}>
              <View style={dynamicStyles.modalTitleRow}>
                <Ionicons name="people-outline" size={22} color={colors.text} />
                <Text style={dynamicStyles.modalTitle}>Currently editing</Text>
              </View>
              <TouchableOpacity style={dynamicStyles.modalCloseBtn} onPress={() => setShowEditorsModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {others.map(({ id: uid, name }) => (
                <View key={uid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 16, color: colors.text }}>{name || 'Someone'}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ padding: 16, paddingTop: 0 }}>
              <TouchableOpacity style={[dynamicStyles.modalBtn, { marginBottom: 0 }]} onPress={() => setShowEditorsModal(false)}>
                <Text style={dynamicStyles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Create Link Modal */}
      <Modal visible={showShareModal} transparent animationType="fade">
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={dynamicStyles.modalOverlay}
            onPress={() => {
              setShowShareModal(false);
            }}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={[dynamicStyles.modalBox, { minWidth: 320, maxWidth: 480 }]}>
            <View style={[dynamicStyles.modalHeader, { paddingBottom: 12 }]}>
              <View style={dynamicStyles.modalTitleRow}>
                <Ionicons name="link-outline" size={22} color="#007AFF" />
                <Text style={dynamicStyles.modalTitle}>Create Share Link</Text>
              </View>
              <TouchableOpacity
                style={dynamicStyles.modalCloseBtn}
                onPress={() => { setShowShareModal(false); }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={{ maxHeight: Dimensions.get('window').height * 0.65, flexGrow: 0 }}
              contentContainerStyle={[dynamicStyles.modalBody, { padding: 16, paddingBottom: 20 }]}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <Text style={[dynamicStyles.modalFileName, { marginBottom: 16 }]} numberOfLines={1}>{displayFilename}</Text>

              <Text style={[dynamicStyles.modalLabel, { marginBottom: 8 }]}>Access Role</Text>
              <View style={[dynamicStyles.modalRoleRow, { marginBottom: 16 }]}>
                {roleOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      dynamicStyles.modalRoleOption,
                      shareRole === opt.value ? dynamicStyles.modalRoleOptionActive : dynamicStyles.modalRoleOptionInactive,
                      { paddingVertical: 8, paddingHorizontal: 10 },
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
              <Text style={[dynamicStyles.modalLabel, { marginBottom: 4 }]}>Expiration (days)</Text>
              <Text style={[dynamicStyles.modalLabelHint, { marginBottom: 8 }]}>Leave empty for no expiration</Text>
              <TextInput
                style={[dynamicStyles.modalInput, { marginBottom: 20 }]}
                placeholder=""
                placeholderTextColor={colors.textSecondary}
                value={shareExpirationDays}
                onChangeText={setShareExpirationDays}
                keyboardType="number-pad"
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                <TouchableOpacity
                  style={[dynamicStyles.modalBtnSecondary, { marginBottom: 0, paddingVertical: 10, paddingHorizontal: 16 }]}
                  onPress={() => { setShowShareModal(false); }}
                >
                  <Text style={dynamicStyles.modalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[dynamicStyles.modalBtn, { marginBottom: 0, marginLeft: 12, minWidth: 100, paddingVertical: 10, paddingHorizontal: 16 }]}
                  onPress={handleCreateShareLink}
                  disabled={linkLoading}
                >
                  {linkLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={dynamicStyles.modalBtnText}>Create Link</Text>}
                </TouchableOpacity>
              </View>

              {/* Existing Share Links */}
              {externalShares.length > 0 && (
                <View style={[dynamicStyles.shareLinksContainer, { marginTop: 20, marginBottom: 8, paddingBottom: 8 }]}>
                  {loadingShares ? (
                    <ActivityIndicator size="small" color={colors.primary || '#007AFF'} />
                  ) : (
                    <View>
                      {externalShares.map((share) => {
                        const isRevoked = share.revoked_at || !share.is_active;
                        const shareLinkUrl = share.share_type === 'link' && share.token
                          ? `${API_BASE_URL}/share/link?token=${share.token}`
                          : null;
                        return (
                          <View key={share.id} style={[dynamicStyles.shareLinkItem, { paddingVertical: 4, marginBottom: 4 }]}>
                            <View style={dynamicStyles.shareLinkInfo}>
                              {shareLinkUrl && !isRevoked && (
                                <Text style={[dynamicStyles.shareLinkDetails, { fontSize: 12, marginTop: 0 }]} numberOfLines={1}>
                                  {shareLinkUrl}
                                </Text>
                              )}
                              {isRevoked && shareLinkUrl && (
                                <Text style={[dynamicStyles.shareLinkDetails, { fontSize: 12, marginTop: 0, color: colors.textSecondary }]} numberOfLines={1}>
                                  {shareLinkUrl}
                                </Text>
                              )}
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                                <View style={{ flex: 1 }}>
                                  {share.expires_at && (
                                    <Text style={dynamicStyles.shareLinkDetails}>
                                      Expires: {new Date(share.expires_at).toLocaleDateString()}
                                    </Text>
                                  )}
                                  {isRevoked && (
                                    <Text style={{ fontSize: 11, color: '#FF3B30', marginTop: share.expires_at ? 2 : 0 }}>(revoked)</Text>
                                  )}
                                </View>
                                {!isRevoked && shareLinkUrl && (
                                  <View style={dynamicStyles.shareLinkActions}>
                                    <TouchableOpacity
                                      style={[dynamicStyles.modalCopyBtn, { paddingVertical: 6, paddingHorizontal: 10 }]}
                                      onPress={() => handleShareLink(shareLinkUrl)}
                                    >
                                      <Ionicons name="share-outline" size={16} color="#fff" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[dynamicStyles.modalCopyBtn, { paddingVertical: 6, paddingHorizontal: 10 }]}
                                      onPress={() => handleCopyLink(shareLinkUrl)}
                                    >
                                      <Ionicons name="copy-outline" size={16} color="#fff" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[dynamicStyles.shareLinkRevokeBtn, { paddingVertical: 6, paddingHorizontal: 10 }]}
                                      onPress={() => handleRevokeShare(share.id)}
                                    >
                                      <Ionicons name="ban-outline" size={16} color="#fff" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[dynamicStyles.shareLinkDeleteBtn, { padding: 6 }]}
                                      onPress={() => handleDeleteShare(share.id)}
                                    >
                                      <Ionicons name="trash-outline" size={16} color="#fff" />
                                    </TouchableOpacity>
                                  </View>
                                )}
                                {isRevoked && (
                                  <TouchableOpacity
                                    style={[dynamicStyles.shareLinkDeleteBtn, { padding: 6 }]}
                                    onPress={() => handleDeleteShare(share.id)}
                                  >
                                    <Ionicons name="trash-outline" size={16} color="#fff" />
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Send Link Modal - Shows link and email form */}
      <Modal visible={showSendLinkModal} transparent animationType="fade">
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={dynamicStyles.modalOverlay}
            onPress={() => {
              setShowSendLinkModal(false);
            }}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={[dynamicStyles.modalBox, { minWidth: 320, maxWidth: 480 }]}>
            <View style={[dynamicStyles.modalHeader, { paddingBottom: 6 }]}>
              <View style={dynamicStyles.modalTitleRow}>
                <Ionicons name="mail-outline" size={22} color="#007AFF" />
                <Text style={dynamicStyles.modalTitle}>Send Share Link</Text>
              </View>
              <TouchableOpacity
                style={dynamicStyles.modalCloseBtn}
                onPress={() => { setShowSendLinkModal(false); }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={dynamicStyles.modalBodySendLink} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true} bounces={false}>
              <Text style={[dynamicStyles.modalFileName, { marginBottom: 10 }]} numberOfLines={1}>{displayFilename}</Text>

              {shareLink ? (
                <>
                  <View style={dynamicStyles.modalSectionSendLink}>
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
                  </View>

                  <View style={[dynamicStyles.modalSectionSendLink, { marginBottom: 0 }]}>
                    <View style={dynamicStyles.modalSectionTitleSendLink}>
                      <Ionicons name="mail-outline" size={18} color={colors.text} />
                      <Text style={dynamicStyles.modalSectionTitleText}>Send via Email</Text>
                    </View>
                    <TextInput
                      style={[dynamicStyles.modalInput, { minHeight: 60, marginBottom: 8 }]}
                      placeholder="Email Addresses (comma or newline separated)"
                      placeholderTextColor={colors.textSecondary}
                      value={shareEmails}
                      onChangeText={setShareEmails}
                      multiline
                    />
                    <TextInput
                      style={[dynamicStyles.modalInput, { minHeight: 50, marginBottom: 10 }]}
                      placeholder="Add a personal message..."
                      placeholderTextColor={colors.textSecondary}
                      value={shareMessage}
                      onChangeText={setShareMessage}
                      multiline
                    />
                    <TouchableOpacity
                      style={[dynamicStyles.modalBtn, dynamicStyles.modalBtnGreen, { marginBottom: 0 }]}
                      onPress={handleSendInviteEmail}
                      disabled={sendingEmail}
                    >
                      {sendingEmail ? <ActivityIndicator size="small" color="#fff" /> : <Text style={dynamicStyles.modalBtnText}>Send Email</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={{ paddingVertical: 20 }}>
                  <Text style={[dynamicStyles.modalLabelHint, { textAlign: 'center' }]}>
                    No share link available. Create a link first.
                  </Text>
                  <TouchableOpacity
                    style={[dynamicStyles.modalBtn, { marginTop: 16 }]}
                    onPress={() => {
                      setShowSendLinkModal(false);
                      setShowShareModal(true);
                    }}
                  >
                    <Text style={dynamicStyles.modalBtnText}>Create Link</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
