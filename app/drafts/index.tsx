import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import FileNameText from '../../components/FileNameText';
import { useScrollRestoresHeaderProps } from '../../contexts/HeaderVisibilityContext';
import { useOpenChatGD } from '../../contexts/ChatGDSheetContext';
import { useDelayedOfflineBanner } from '../../hooks/useDelayedOfflineBanner';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { toAlertMessage } from '../../utils/alertUtils';
import {
  anchoredPopoverCardStyle,
  anchoredPopoverOverlayStyle,
} from '../../utils/dialogSurfaceStyles';
import { CachedDraftMeta, draftsCache, isNetworkError } from '../../utils/draftsCache';
import { AnimatedHeaderContainer } from '../components/AnimatedHeaderContainer';
import { TapToToggleHeaderView } from '../components/TapToToggleHeaderView';
import { useAuth } from '../context/auth';

interface DraftItem {
  id: number;
  original_filename?: string;
  file_kind?: string;
  created_at: string;
  updated_at?: string;
  json_data?: { source_file_id?: number; created_from?: string };
}

function stripExtension(name?: string): string {
  if (!name) return 'Untitled Note';
  return name.replace(/\.[^./\\]+$/, '');
}

function getSectionKey(date: Date): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOf7DaysAgo = new Date(startOfToday);
  startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 7);
  const startOf30DaysAgo = new Date(startOfToday);
  startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30);

  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === startOfToday.getTime()) return 'today';
  if (d.getTime() === startOfYesterday.getTime()) return 'yesterday';
  if (d.getTime() > startOf7DaysAgo.getTime()) return 'last7';
  if (d.getTime() > startOf30DaysAgo.getTime()) return 'last30';
  return `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getSectionLabel(key: string): string {
  if (key === 'today') return 'Today';
  if (key === 'yesterday') return 'Yesterday';
  if (key === 'last7') return 'Previous 7 Days';
  if (key === 'last30') return 'Previous 30 Days';
  if (key.startsWith('month-')) {
    const parts = key.split('-');
    return new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, 1)
      .toLocaleString('default', { month: 'long', year: 'numeric' });
  }
  return key;
}

function formatItemDate(draft: DraftItem, sectionKey: string): string {
  const raw = draft.updated_at || draft.created_at;
  if (!raw) return '';
  const date = new Date(raw);
  if (sectionKey === 'today') {
    return date.toLocaleTimeString('default', { hour: 'numeric', minute: '2-digit' });
  }
  if (sectionKey === 'yesterday') return 'Yesterday';
  if (sectionKey === 'last7') {
    return date.toLocaleDateString('default', { weekday: 'long' });
  }
  if (sectionKey === 'last30') {
    return date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CHATGD_PLACEHOLDER_FROM_DRAFTS = 'Ask about your notes';

export default function DraftsListScreen() {
  const router = useRouter();
  const openChatGD = useOpenChatGD();
  const { user } = useAuth();
  const colors = useThemeColors();
  const isDarkMode = colors.isDark;
  const scrollRestoresHeaderProps = useScrollRestoresHeaderProps();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const { offlineBannerVisible, showOfflineBannerAfterDelay } = useDelayedOfflineBanner(isOffline);
  const draftSwipeRefs = useRef<Map<number, Swipeable>>(new Map());
  const moreButtonRef = useRef<View>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, right: 0 });
  const userId = user?.id;

  const flushPendingCreates = useCallback(async (): Promise<void> => {
    if (!userId) return;
    const pendingCreates = await draftsCache.getPendingCreates(userId);
    if (pendingCreates.length === 0) return;
    const sorted = [...pendingCreates].sort((a, b) => a.queued_at - b.queued_at);
    for (const create of sorted) {
      try {
        const res = await apiClient.createDraft();
        const serverId = (res as any)?.draft?.id;
        if (!serverId) break;

        await apiClient.saveDraft(serverId, create.html, create.plainText);
        if ((create.filename || 'Untitled Note') !== 'Untitled Note') {
          await apiClient.renameFile(serverId, create.filename);
        }

        await draftsCache.saveDraftContent(userId, serverId, {
          filename: create.filename || 'Untitled Note',
          content_html: create.html || '<p><br></p>',
        });
        await draftsCache.deleteDraftContent(userId, create.localId);
        await draftsCache.remapPendingSaves(userId, create.localId, serverId);
        await draftsCache.remapPendingRenames(userId, create.localId, serverId);
        await draftsCache.removePendingCreate(userId, create.localId);
        await draftsCache.removeFromDraftsList(userId, create.localId);
      } catch {
        break;
      }
    }
  }, [userId]);

  const flushAllPendingSaves = useCallback(async () => {
    if (!userId) return;
    const pending = await draftsCache.getPendingSaves(userId);
    if (pending.length === 0) return;
    for (const item of pending) {
      if (draftsCache.isLocalDraftId(item.id)) continue;
      try {
        await apiClient.saveDraft(item.id, item.html, item.plainText);
        await draftsCache.removePendingSave(userId, item.id);
      } catch {
        break;
      }
    }
  }, [userId]);

  const flushAllPendingRenames = useCallback(async () => {
    if (!userId) return;
    const pending = await draftsCache.getPendingRenames(userId);
    if (pending.length === 0) return;
    for (const item of pending) {
      if (draftsCache.isLocalDraftId(item.id)) continue;
      try {
        await apiClient.renameFile(item.id, item.filename);
        await draftsCache.removePendingRename(userId, item.id);
      } catch {
        break;
      }
    }
  }, [userId]);

  const loadDrafts = useCallback(async (fromRefresh = false) => {
    if (!userId) return;

    const cached = await draftsCache.getDraftsList(userId);
    if (cached && cached.length > 0) {
      setDrafts(cached as DraftItem[]);
      setLoading(false);
    }

    try {
      await flushPendingCreates();
      await flushAllPendingSaves();
      await flushAllPendingRenames();

      const res = await apiClient.getDrafts();
      const list = (res as any).drafts ?? (res?.data?.drafts ?? []) ?? [];
      const serverDrafts: DraftItem[] = Array.isArray(list) ? list : [];
      const refreshedCache = await draftsCache.getDraftsList(userId);
      const localDrafts = (refreshedCache || []).filter(d => draftsCache.isLocalDraftId(d.id)) as DraftItem[];
      const serverIds = new Set(serverDrafts.map(d => d.id));
      const localOnly = localDrafts.filter(d => !serverIds.has(d.id));
      const merged = [...serverDrafts, ...localOnly].sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      });

      setDrafts(merged);
      setIsOffline(false);
      await draftsCache.saveDraftsList(userId, merged as CachedDraftMeta[]);
    } catch (e: any) {
      if (isNetworkError(e)) {
        setIsOffline(true);
        showOfflineBannerAfterDelay();
        if (!cached || cached.length === 0) {
          setDrafts([]);
        }
      } else {
        console.error('Failed to load drafts:', e);
        if (!cached) setDrafts([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, flushAllPendingRenames, flushAllPendingSaves, flushPendingCreates, showOfflineBannerAfterDelay]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDrafts();
    }, [loadDrafts])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDrafts(true);
  };

  const filteredDrafts = useMemo(() => {
    if (!searchQuery.trim()) return drafts;
    const query = searchQuery.toLowerCase().trim();
    return drafts.filter(draft => {
      const filename = (draft.original_filename || '').toLowerCase();
      const createdFrom = (draft.json_data?.created_from || '').toLowerCase();
      return filename.includes(query) || createdFrom.includes(query);
    });
  }, [drafts, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, DraftItem[]>();
    const sectionOrder: string[] = [];

    filteredDrafts.forEach(d => {
      const raw = d.updated_at || d.created_at;
      const date = raw ? new Date(raw) : new Date();
      const key = getSectionKey(date);
      if (!map.has(key)) {
        map.set(key, []);
        sectionOrder.push(key);
      }
      map.get(key)!.push(d);
    });

    const fixed = ['today', 'yesterday', 'last7', 'last30'];
    sectionOrder.sort((a, b) => {
      const pa = fixed.indexOf(a);
      const pb = fixed.indexOf(b);
      if (pa !== -1 && pb !== -1) return pa - pb;
      if (pa !== -1) return -1;
      if (pb !== -1) return 1;
      return b.localeCompare(a);
    });

    return sectionOrder
      .map(key => ({ key, label: getSectionLabel(key), items: map.get(key)! }))
      .filter(g => g.items.length > 0);
  }, [filteredDrafts]);

  const handleNewDraft = async () => {
    if (creating || !userId) return;
    setCreating(true);
    try {
      if (isOffline) {
        const localId = -Date.now();
        const nowIso = new Date().toISOString();
        const localDraft: CachedDraftMeta = {
          id: localId,
          original_filename: 'Untitled Note',
          file_kind: 'draft',
          created_at: nowIso,
          updated_at: nowIso,
        };
        const currentList = (await draftsCache.getDraftsList(userId)) || [];
        const updated = [localDraft, ...currentList.filter(d => d.id !== localId)];
        await draftsCache.saveDraftsList(userId, updated);
        await draftsCache.saveDraftContent(userId, localId, {
          filename: 'Untitled Note',
          content_html: '<p><br></p>',
        });
        await draftsCache.addPendingCreate(userId, {
          localId,
          filename: 'Untitled Note',
          html: '<p><br></p>',
          plainText: '',
        });
        setDrafts(updated as DraftItem[]);
        router.push(`/drafts/edit/${localId}`);
        return;
      }

      const res = await apiClient.createDraft();
      if (res?.success && (res as any).draft?.id) {
        const newDraft = (res as any).draft;
        const updated = [newDraft as CachedDraftMeta, ...drafts as CachedDraftMeta[]];
        await draftsCache.saveDraftsList(userId, updated);
        router.push(`/drafts/edit/${newDraft.id}`);
      } else {
        Alert.alert('Error', toAlertMessage((res as any)?.message, 'Failed to create note'));
      }
    } catch (e: any) {
      if (isNetworkError(e)) {
        setIsOffline(true);
        showOfflineBannerAfterDelay();
        const localId = -Date.now();
        const nowIso = new Date().toISOString();
        const localDraft: CachedDraftMeta = {
          id: localId,
          original_filename: 'Untitled Note',
          file_kind: 'draft',
          created_at: nowIso,
          updated_at: nowIso,
        };
        const currentList = (await draftsCache.getDraftsList(userId)) || [];
        const updated = [localDraft, ...currentList.filter(d => d.id !== localId)];
        await draftsCache.saveDraftsList(userId, updated);
        await draftsCache.saveDraftContent(userId, localId, {
          filename: 'Untitled Note',
          content_html: '<p><br></p>',
        });
        await draftsCache.addPendingCreate(userId, {
          localId,
          filename: 'Untitled Note',
          html: '<p><br></p>',
          plainText: '',
        });
        setDrafts(updated as DraftItem[]);
        router.push(`/drafts/edit/${localId}`);
      } else {
        Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Failed to create note'));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleOpenDraft = (draft: DraftItem) => {
    router.push(`/drafts/edit/${draft.id}`);
  };

  const handleMoreOptions = useCallback(() => {
    moreButtonRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get('window').width;
      setMenuAnchor({ top: y + height + 6, right: screenWidth - x - width });
      setMenuVisible(true);
    });
  }, []);

  const performDeleteDraft = useCallback(async (draft: DraftItem) => {
    if (!userId) return;
    const ref = draftSwipeRefs.current.get(draft.id);
    try {
      if (draftsCache.isLocalDraftId(draft.id)) {
        await draftsCache.removePendingCreate(userId, draft.id);
        await draftsCache.removePendingSave(userId, draft.id);
        await draftsCache.removePendingRename(userId, draft.id);
        await draftsCache.removeFromDraftsList(userId, draft.id);
        await draftsCache.deleteDraftContent(userId, draft.id);
      } else {
        await apiClient.deleteDraft(draft.id);
        await draftsCache.removePendingSave(userId, draft.id);
        await draftsCache.removePendingRename(userId, draft.id);
        await draftsCache.removeFromDraftsList(userId, draft.id);
        await draftsCache.deleteDraftContent(userId, draft.id);
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      ref?.close();
    } catch (e: any) {
      Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Could not delete note'));
      ref?.close();
    }
  }, [userId]);

  const confirmDeleteDraft = useCallback(
    (draft: DraftItem) => {
      Alert.alert(
        'Move to Trash?',
        'You can restore this note within 30 days from Deleted Notes.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => draftSwipeRefs.current.get(draft.id)?.close() },
          { text: 'Move to Trash', style: 'destructive', onPress: () => void performDeleteDraft(draft) },
        ]
      );
    },
    [performDeleteDraft]
  );

  const accentColor = colors.primary || '#007AFF';

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backBtn: { paddingHorizontal: 8, paddingVertical: 8 },
    headerTitleWrap: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
    headerTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
    headerSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    headerActionBtn: { paddingHorizontal: 10, paddingVertical: 8 },
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FF9500',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    offlineBannerText: {
      fontSize: 13,
      color: '#fff',
      fontWeight: '600',
      marginLeft: 6,
      flex: 1,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.background,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    searchIcon: { marginRight: 6 },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 0,
    },
    searchClearBtn: { padding: 2 },
    list: { paddingTop: 4, paddingBottom: 32 },
    sectionHeader: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
    },
    sectionCard: {
      marginHorizontal: 16,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 4,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
    },
    itemBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    itemContent: { flex: 1, minWidth: 0 },
    itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    itemSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
    itemChevron: { marginLeft: 6 },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
      paddingHorizontal: 32,
    },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
    emptySubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
    emptyNewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: accentColor,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 22,
      gap: 6,
    },
    emptyNewBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    popoverOverlay: anchoredPopoverOverlayStyle(isDarkMode),
    popoverCard: anchoredPopoverCardStyle(colors, isDarkMode),
    popoverItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    popoverItemBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    popoverItemIcon: { marginRight: 12 },
    popoverItemText: { fontSize: 16, color: colors.text, flex: 1 },
    popoverItemTextDestructive: { fontSize: 16, color: '#FF3B30', flex: 1 },
  }), [colors, accentColor, isDarkMode]);

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <TapToToggleHeaderView style={dynamicStyles.container}>
        <AnimatedHeaderContainer>
          <View style={dynamicStyles.header}>
            <TouchableOpacity style={dynamicStyles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={30} color={accentColor} />
            </TouchableOpacity>
            <View style={dynamicStyles.headerTitleWrap}>
              <Text style={dynamicStyles.headerTitle}>Notes</Text>
              {drafts.length > 0 && (
                <Text style={dynamicStyles.headerSubtitle}>
                  {drafts.length} {drafts.length === 1 ? 'note' : 'notes'}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={dynamicStyles.headerActionBtn}
              onPress={onRefresh}
              disabled={refreshing}
              accessibilityLabel="Refresh"
              accessibilityRole="button"
            >
              {refreshing
                ? <ActivityIndicator size="small" color={accentColor} />
                : <Ionicons name="refresh-outline" size={30} color={accentColor} />}
            </TouchableOpacity>
            <TouchableOpacity
              ref={moreButtonRef}
              style={dynamicStyles.headerActionBtn}
              onPress={handleMoreOptions}
              accessibilityLabel="More options"
              accessibilityRole="button"
            >
              <Ionicons name="ellipsis-horizontal-circle" size={28} color={accentColor} />
            </TouchableOpacity>
            <TouchableOpacity
              style={dynamicStyles.headerActionBtn}
              onPress={handleNewDraft}
              disabled={creating}
              accessibilityLabel="New note"
              accessibilityRole="button"
            >
              {creating ? (
                <ActivityIndicator size="small" color={accentColor} />
              ) : (
                <Ionicons name="create-outline" size={30} color={accentColor} />
              )}
            </TouchableOpacity>
          </View>

          {offlineBannerVisible && (
            <View style={dynamicStyles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
              <Text style={dynamicStyles.offlineBannerText}>Offline — showing cached notes</Text>
            </View>
          )}
        </AnimatedHeaderContainer>

        <View style={dynamicStyles.searchContainer}>
          <View style={dynamicStyles.searchInputContainer}>
            <Ionicons name="search" size={16} color={colors.textSecondary} style={dynamicStyles.searchIcon} />
            <TextInput
              style={dynamicStyles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search"
              placeholderTextColor={colors.textSecondary}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={dynamicStyles.searchClearBtn}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={accentColor} />
          </View>
        ) : filteredDrafts.length === 0 && drafts.length === 0 ? (
          <ScrollView
            contentContainerStyle={dynamicStyles.empty}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            {...scrollRestoresHeaderProps}
          >
            <Ionicons name="create-outline" size={64} color={colors.textSecondary} style={dynamicStyles.emptyIcon} />
            <Text style={dynamicStyles.emptyTitle}>No Notes Yet</Text>
            <Text style={dynamicStyles.emptySubtitle}>
              {isOffline
                ? 'No cached notes available. Connect to the internet to load your notes.'
                : 'Tap the compose button to write your first note.'}
            </Text>
            {!isOffline && (
              <TouchableOpacity style={dynamicStyles.emptyNewBtn} onPress={handleNewDraft} disabled={creating}>
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={dynamicStyles.emptyNewBtnText}>New Note</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        ) : filteredDrafts.length === 0 && searchQuery.trim() ? (
          <ScrollView
            contentContainerStyle={dynamicStyles.empty}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            {...scrollRestoresHeaderProps}
          >
            <Ionicons name="search-outline" size={64} color={colors.textSecondary} style={dynamicStyles.emptyIcon} />
            <Text style={dynamicStyles.emptyTitle}>No Results</Text>
            <Text style={dynamicStyles.emptySubtitle}>{`No notes match "${searchQuery}"`}</Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={dynamicStyles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            showsVerticalScrollIndicator={false}
            {...scrollRestoresHeaderProps}
          >
            {grouped.map(({ key, label, items }) => (
              <View key={key}>
                <View style={dynamicStyles.sectionHeader}>
                  <Text style={dynamicStyles.sectionTitle}>{label}</Text>
                </View>
                <View style={dynamicStyles.sectionCard}>
                  {items.map((draft, index) => (
                    <Swipeable
                      key={draft.id}
                      ref={(r) => {
                        if (r) draftSwipeRefs.current.set(draft.id, r);
                        else draftSwipeRefs.current.delete(draft.id);
                      }}
                      renderRightActions={() => (
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#FF3B30',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: 88,
                          }}
                          onPress={() => confirmDeleteDraft(draft)}
                          accessibilityLabel="Delete note"
                          accessibilityRole="button"
                        >
                          <Ionicons name="trash-outline" size={22} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                            Delete
                          </Text>
                        </TouchableOpacity>
                      )}
                      overshootRight={false}
                      friction={2}
                      containerStyle={{ backgroundColor: colors.card }}
                    >
                      <TouchableOpacity
                        style={[dynamicStyles.item, index < items.length - 1 && dynamicStyles.itemBorder]}
                        onPress={() => handleOpenDraft(draft)}
                        activeOpacity={0.6}
                      >
                        <View style={dynamicStyles.itemContent}>
                          <FileNameText
                            name={stripExtension(draft.original_filename)}
                            style={dynamicStyles.itemTitle}
                          />
                          <Text style={dynamicStyles.itemSubtitle} numberOfLines={1}>
                            {formatItemDate(draft, key)}
                            {draft.json_data?.created_from ? `  ·  ${draft.json_data.created_from}` : ''}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={colors.textSecondary}
                          style={dynamicStyles.itemChevron}
                        />
                      </TouchableOpacity>
                    </Swipeable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </TapToToggleHeaderView>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={dynamicStyles.popoverOverlay}>
            <View style={[dynamicStyles.popoverCard, { top: menuAnchor.top, right: menuAnchor.right }]}>
              <TouchableOpacity
                style={[dynamicStyles.popoverItem, dynamicStyles.popoverItemBorder]}
                onPress={() => {
                  setMenuVisible(false);
                  openChatGD({ chatPlaceholder: CHATGD_PLACEHOLDER_FROM_DRAFTS });
                }}
              >
                <Ionicons name="chatbubbles-outline" size={20} color={colors.text} style={dynamicStyles.popoverItemIcon} />
                <Text style={dynamicStyles.popoverItemText}>Ask ChatGD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dynamicStyles.popoverItem}
                onPress={() => { setMenuVisible(false); router.push('/drafts/recent'); }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.text} style={dynamicStyles.popoverItemIcon} />
                <Text style={dynamicStyles.popoverItemText}>Deleted Notes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}
