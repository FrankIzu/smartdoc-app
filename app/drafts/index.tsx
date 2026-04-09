import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useDelayedOfflineBanner } from '../../hooks/useDelayedOfflineBanner';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollRestoresHeaderProps } from '../../contexts/HeaderVisibilityContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { toAlertMessage } from '../../utils/alertUtils';
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

type SectionKey = 'today' | 'yesterday' | 'last30' | 'older';

function stripExtension(name?: string): string {
  if (!name) return 'Untitled Draft';
  return name.replace(/\.[^./\\]+$/, '');
}

function getSectionKey(date: Date): SectionKey {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOf30DaysAgo = new Date(startOfToday);
  startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30);

  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === startOfToday.getTime()) return 'today';
  if (d.getTime() === startOfYesterday.getTime()) return 'yesterday';
  if (d.getTime() >= startOf30DaysAgo.getTime()) return 'last30';
  return 'older';
}

const SECTION_LABELS: Record<SectionKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last30: 'Last 30 days',
  older: 'Older',
};

const SECTION_ORDER: SectionKey[] = ['today', 'yesterday', 'last30', 'older'];

export default function DraftsListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const scrollRestoresHeaderProps = useScrollRestoresHeaderProps();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const { offlineBannerVisible, showOfflineBannerAfterDelay } = useDelayedOfflineBanner(isOffline);
  const draftSwipeRefs = useRef<Map<number, Swipeable>>(new Map());

  const flushPendingCreates = useCallback(async (): Promise<void> => {
    const pendingCreates = await draftsCache.getPendingCreates();
    if (pendingCreates.length === 0) return;
    const sorted = [...pendingCreates].sort((a, b) => a.queued_at - b.queued_at);
    for (const create of sorted) {
      try {
        const res = await apiClient.createDraft();
        const serverId = (res as any)?.draft?.id;
        if (!serverId) break;

        await apiClient.saveDraft(serverId, create.html, create.plainText);
        if ((create.filename || 'Untitled Draft') !== 'Untitled Draft') {
          await apiClient.renameFile(serverId, create.filename);
        }

        await draftsCache.saveDraftContent(serverId, {
          filename: create.filename || 'Untitled Draft',
          content_html: create.html || '<p><br></p>',
        });
        await draftsCache.deleteDraftContent(create.localId);
        await draftsCache.remapPendingSaves(create.localId, serverId);
        await draftsCache.remapPendingRenames(create.localId, serverId);
        await draftsCache.removePendingCreate(create.localId);
        await draftsCache.removeFromDraftsList(create.localId);
      } catch {
        // Stop here; later reconnect will retry remaining creates.
        break;
      }
    }
  }, []);

  const flushAllPendingSaves = useCallback(async () => {
    const pending = await draftsCache.getPendingSaves();
    if (pending.length === 0) return;
    for (const item of pending) {
      if (draftsCache.isLocalDraftId(item.id)) continue;
      try {
        await apiClient.saveDraft(item.id, item.html, item.plainText);
        await draftsCache.removePendingSave(item.id);
      } catch {
        // Still offline or error — leave in queue
        break;
      }
    }
  }, []);

  const flushAllPendingRenames = useCallback(async () => {
    const pending = await draftsCache.getPendingRenames();
    if (pending.length === 0) return;
    for (const item of pending) {
      if (draftsCache.isLocalDraftId(item.id)) continue;
      try {
        await apiClient.renameFile(item.id, item.filename);
        await draftsCache.removePendingRename(item.id);
      } catch {
        break;
      }
    }
  }, []);

  const loadDrafts = useCallback(async (fromRefresh = false) => {
    if (!user) return;

    // Load from cache immediately so user sees data without waiting
    const cached = await draftsCache.getDraftsList();
    if (cached && cached.length > 0) {
      setDrafts(cached as DraftItem[]);
      setLoading(false);
    }

    try {
      // Strictly serialized flush order: creates -> saves -> renames
      await flushPendingCreates();
      await flushAllPendingSaves();
      await flushAllPendingRenames();

      const res = await apiClient.getDrafts();
      const list = (res as any).drafts ?? (res?.data?.drafts ?? []) ?? [];
      const serverDrafts: DraftItem[] = Array.isArray(list) ? list : [];
      const refreshedCache = await draftsCache.getDraftsList();
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
      // Persist fetched list to cache
      await draftsCache.saveDraftsList(merged as CachedDraftMeta[]);
    } catch (e: any) {
      if (isNetworkError(e)) {
        setIsOffline(true);
        showOfflineBannerAfterDelay();
        // Already showing cached data — no additional alert needed
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
  }, [user, flushAllPendingRenames, flushAllPendingSaves, flushPendingCreates, showOfflineBannerAfterDelay]);

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
    if (!searchQuery.trim()) {
      return drafts;
    }
    const query = searchQuery.toLowerCase().trim();
    return drafts.filter(draft => {
      const filename = (draft.original_filename || '').toLowerCase();
      const createdFrom = (draft.json_data?.created_from || '').toLowerCase();
      return filename.includes(query) || createdFrom.includes(query);
    });
  }, [drafts, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<SectionKey, DraftItem[]>();
    SECTION_ORDER.forEach(k => map.set(k, []));
    filteredDrafts.forEach(d => {
      const raw = d.updated_at || d.created_at;
      const date = raw ? new Date(raw) : new Date();
      const key = getSectionKey(date);
      map.get(key)!.push(d);
    });
    return SECTION_ORDER.map(key => ({ key, label: SECTION_LABELS[key], items: map.get(key)! })).filter(
      g => g.items.length > 0
    );
  }, [filteredDrafts]);

  const handleNewDraft = async () => {
    if (creating) return;
    setCreating(true);
    try {
      if (isOffline) {
        const localId = -Date.now();
        const nowIso = new Date().toISOString();
        const localDraft: CachedDraftMeta = {
          id: localId,
          original_filename: 'Untitled Draft',
          file_kind: 'draft',
          created_at: nowIso,
          updated_at: nowIso,
        };
        const currentList = (await draftsCache.getDraftsList()) || [];
        const updated = [localDraft, ...currentList.filter(d => d.id !== localId)];
        await draftsCache.saveDraftsList(updated);
        await draftsCache.saveDraftContent(localId, {
          filename: 'Untitled Draft',
          content_html: '<p><br></p>',
        });
        await draftsCache.addPendingCreate({
          localId,
          filename: 'Untitled Draft',
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
        // Add to cache immediately
        const updated = [newDraft as CachedDraftMeta, ...drafts as CachedDraftMeta[]];
        await draftsCache.saveDraftsList(updated);
        router.push(`/drafts/edit/${newDraft.id}`);
      } else {
        Alert.alert('Error', toAlertMessage((res as any)?.message, 'Failed to create draft'));
      }
    } catch (e: any) {
      if (isNetworkError(e)) {
        setIsOffline(true);
        showOfflineBannerAfterDelay();
        const localId = -Date.now();
        const nowIso = new Date().toISOString();
        const localDraft: CachedDraftMeta = {
          id: localId,
          original_filename: 'Untitled Draft',
          file_kind: 'draft',
          created_at: nowIso,
          updated_at: nowIso,
        };
        const currentList = (await draftsCache.getDraftsList()) || [];
        const updated = [localDraft, ...currentList.filter(d => d.id !== localId)];
        await draftsCache.saveDraftsList(updated);
        await draftsCache.saveDraftContent(localId, {
          filename: 'Untitled Draft',
          content_html: '<p><br></p>',
        });
        await draftsCache.addPendingCreate({
          localId,
          filename: 'Untitled Draft',
          html: '<p><br></p>',
          plainText: '',
        });
        setDrafts(updated as DraftItem[]);
        router.push(`/drafts/edit/${localId}`);
      } else {
        Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Failed to create draft'));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleOpenDraft = (draft: DraftItem) => {
    router.push(`/drafts/edit/${draft.id}`);
  };

  const performDeleteDraft = useCallback(async (draft: DraftItem) => {
    const label = stripExtension(draft.original_filename);
    const ref = draftSwipeRefs.current.get(draft.id);
    try {
      if (draftsCache.isLocalDraftId(draft.id)) {
        await draftsCache.removePendingCreate(draft.id);
        await draftsCache.removePendingSave(draft.id);
        await draftsCache.removePendingRename(draft.id);
        await draftsCache.removeFromDraftsList(draft.id);
        await draftsCache.deleteDraftContent(draft.id);
      } else {
        await apiClient.deleteDraft(draft.id);
        await draftsCache.removePendingSave(draft.id);
        await draftsCache.removePendingRename(draft.id);
        await draftsCache.removeFromDraftsList(draft.id);
        await draftsCache.deleteDraftContent(draft.id);
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      ref?.close();
    } catch (e: any) {
      Alert.alert('Error', toAlertMessage(e?.message ?? e?.response?.data?.message, 'Could not delete draft'));
      ref?.close();
    }
  }, []);

  const confirmDeleteDraft = useCallback(
    (draft: DraftItem) => {
      Alert.alert(
        'Move this file to trash?',
        'You can restore it within 30 days from the Deleted tab.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => draftSwipeRefs.current.get(draft.id)?.close() },
          { text: 'Move to trash', style: 'destructive', onPress: () => void performDeleteDraft(draft) },
        ]
      );
    },
    [performDeleteDraft]
  );

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backBtn: { padding: 10, marginRight: 6, marginTop: 4 },
    headerBtn: { padding: 10, marginRight: 6, marginTop: 4 },
    headerTitleWrap: { flex: 1, minWidth: 0 },
    headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
    headerSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    newButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#5AC8FA',
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    headerNewButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#5AC8FA',
      width: 36,
      height: 36,
      borderRadius: 18,
      marginTop: 4,
    },
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
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 6,
    },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },
    list: { paddingBottom: 24 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemContent: { flex: 1, minWidth: 0 },
    itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    itemSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyIcon: { marginBottom: 12 },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 6 },
    emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
    searchContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface || colors.background,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 4,
      fontSize: 14,
      color: colors.text,
    },
    searchClearBtn: {
      padding: 4,
    },
  }), [colors]);

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <TapToToggleHeaderView style={dynamicStyles.container}>
      <AnimatedHeaderContainer>
        <View style={dynamicStyles.header}>
          <TouchableOpacity style={dynamicStyles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <View style={dynamicStyles.headerTitleWrap}>
            <Text style={dynamicStyles.headerTitle}>Drafts</Text>
            <Text style={dynamicStyles.headerSubtitle}>Notes | Invite others</Text>
          </View>
          <TouchableOpacity
            style={dynamicStyles.headerBtn}
            onPress={() => router.push('/drafts/recent')}
            accessibilityLabel="Recently deleted and shared notes"
            accessibilityRole="button"
          >
            <Ionicons name="archive-outline" size={26} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.headerBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary || '#007AFF'} />
            ) : (
              <Ionicons name="refresh-outline" size={28} color={colors.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.headerNewButton} onPress={handleNewDraft} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="add" size={24} color="#fff" />
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

      {!loading && drafts.length > 0 && (
        <View style={dynamicStyles.searchContainer}>
          <View style={dynamicStyles.searchInputContainer}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={dynamicStyles.searchIcon} />
            <TextInput
              style={dynamicStyles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search drafts..."
              placeholderTextColor={colors.textSecondary}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={dynamicStyles.searchClearBtn}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary || '#007AFF'} />
        </View>
      ) : filteredDrafts.length === 0 && drafts.length === 0 ? (
        <ScrollView
          contentContainerStyle={dynamicStyles.empty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          {...scrollRestoresHeaderProps}
        >
          <Ionicons name="create-outline" size={56} color={colors.textSecondary} style={dynamicStyles.emptyIcon} />
          <Text style={dynamicStyles.emptyTitle}>No drafts yet</Text>
          <Text style={dynamicStyles.emptySubtitle}>
            {isOffline
              ? 'No cached drafts available. Connect to the internet to load your notes.'
              : 'Create a draft or use "Edit as Draft" on a supported file.'}
          </Text>
          {!isOffline && (
            <TouchableOpacity style={dynamicStyles.newButton} onPress={handleNewDraft} disabled={creating}>
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="add" size={18} color="#fff" />
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
          <Ionicons name="search-outline" size={56} color={colors.textSecondary} style={dynamicStyles.emptyIcon} />
          <Text style={dynamicStyles.emptyTitle}>No drafts found</Text>
          <Text style={dynamicStyles.emptySubtitle}>No drafts match "{searchQuery}"</Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={dynamicStyles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          {...scrollRestoresHeaderProps}
        >
          {grouped.map(({ key, label, items }) => (
            <View key={key}>
              <View style={dynamicStyles.sectionHeader}>
                <Text style={dynamicStyles.sectionTitle}>{label}</Text>
              </View>
              {items.map((draft) => (
                <Swipeable
                  key={draft.id}
                  ref={(r) => {
                    if (r) draftSwipeRefs.current.set(draft.id, r);
                    else draftSwipeRefs.current.delete(draft.id);
                  }}
                  renderRightActions={() => (
                    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#FF3B30',
                          justifyContent: 'center',
                          alignItems: 'center',
                          width: 88,
                        }}
                        onPress={() => confirmDeleteDraft(draft)}
                        accessibilityLabel="Delete draft"
                        accessibilityRole="button"
                      >
                        <Ionicons name="trash-outline" size={22} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  overshootRight={false}
                  friction={2}
                  containerStyle={{ backgroundColor: colors.card }}
                >
                  <TouchableOpacity
                    style={dynamicStyles.item}
                    onPress={() => handleOpenDraft(draft)}
                    activeOpacity={0.7}
                  >
                    <View style={dynamicStyles.itemContent}>
                      <Text style={dynamicStyles.itemTitle} numberOfLines={1}>
                        {stripExtension(draft.original_filename)}
                      </Text>
                      <Text style={dynamicStyles.itemSubtitle} numberOfLines={1}>
                        {draft.json_data?.created_from ? `From: ${draft.json_data.created_from}` : ''}
                        {draft.json_data?.created_from && draft.created_at ? ' · ' : ''}
                        {draft.created_at ? new Date(draft.created_at).toLocaleDateString() : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </Swipeable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
      </TapToToggleHeaderView>
    </SafeAreaView>
  );
}
