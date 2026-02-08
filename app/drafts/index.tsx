import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
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
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadDrafts = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.getDrafts();
      const list = (res as any).drafts ?? (res?.data?.drafts ?? []) ?? [];
      setDrafts(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed to load drafts:', e);
      setDrafts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadDrafts();
    }, [loadDrafts])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDrafts();
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
      const res = await apiClient.createDraft();
      if (res?.success && (res as any).draft?.id) {
        router.push(`/drafts/edit/${(res as any).draft.id}`);
      } else {
        Alert.alert('Error', (res as any)?.message || 'Failed to create draft');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create draft');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenDraft = (draft: DraftItem) => {
    router.push(`/drafts/edit/${draft.id}`);
  };

  const handleShareDraft = (draft: DraftItem, e: any) => {
    e?.stopPropagation?.();
    router.push(`/drafts/edit/${draft.id}?share=1`);
  };

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
    backBtn: { padding: 8, marginRight: 4 },
    headerBtn: { padding: 8, marginRight: 4 },
    headerTitleWrap: { flex: 1, minWidth: 0 },
    headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
    headerSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    newButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#34C759',
      width: 28,
      height: 28,
      borderRadius: 14,
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
    itemIcon: { marginRight: 12 },
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
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={dynamicStyles.headerTitleWrap}>
            <Text style={dynamicStyles.headerTitle}>Drafts</Text>
            <Text style={dynamicStyles.headerSubtitle}>Notes | Invite other to edit | ChatGD</Text>
          </View>
          <TouchableOpacity style={dynamicStyles.headerBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary || '#007AFF'} />
            ) : (
              <Ionicons name="refresh-outline" size={24} color={colors.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.newButton} onPress={handleNewDraft} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="add" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
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
        >
          <Ionicons name="create-outline" size={56} color={colors.textSecondary} style={dynamicStyles.emptyIcon} />
          <Text style={dynamicStyles.emptyTitle}>No drafts yet</Text>
          <Text style={dynamicStyles.emptySubtitle}>Create a draft or use "Edit as Draft" on a supported file.</Text>
          <TouchableOpacity style={dynamicStyles.newButton} onPress={handleNewDraft} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="add" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : filteredDrafts.length === 0 && searchQuery.trim() ? (
        <ScrollView
          contentContainerStyle={dynamicStyles.empty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
        >
          {grouped.map(({ key, label, items }) => (
            <View key={key}>
              <View style={dynamicStyles.sectionHeader}>
                <Text style={dynamicStyles.sectionTitle}>{label}</Text>
              </View>
              {items.map(draft => (
                <TouchableOpacity
                  key={draft.id}
                  style={dynamicStyles.item}
                  onPress={() => handleOpenDraft(draft)}
                  activeOpacity={0.7}
                >
                  <View style={dynamicStyles.itemIcon}>
                    <Ionicons name="create-outline" size={24} color="#34C759" />
                  </View>
                  <View style={dynamicStyles.itemContent}>
                    <Text style={dynamicStyles.itemTitle} numberOfLines={1}>
                      {draft.original_filename || 'Untitled Draft'}
                    </Text>
                    <Text style={dynamicStyles.itemSubtitle} numberOfLines={1}>
                      {draft.json_data?.created_from ? `From: ${draft.json_data.created_from}` : ''}
                      {draft.json_data?.created_from && draft.created_at ? ' · ' : ''}
                      {draft.created_at ? new Date(draft.created_at).toLocaleDateString() : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={(e) => handleShareDraft(draft, e)} style={{ padding: 8 }}>
                    <Ionicons name="person-add-outline" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
      </TapToToggleHeaderView>
    </SafeAreaView>
  );
}
