import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService } from '../../services/api';
import { intakesListScreenKey } from '../../services/userScopedCache';
import { screenCache } from '../../utils/screenCache';
import {
  INTAKE_DUE_BADGE_LABELS,
  INTAKE_STATUS_LABELS,
  type Intake,
  type IntakeStatus,
} from '../../types/intake';
import { useAuth } from '../context/auth';

const INTAKES_LIST_CACHE_MS = 30_000;
const INTAKES_PAGE_SIZE = 20;

type PaginatedIntakesCache = {
  items: Intake[];
  hasMore: boolean;
  page: number;
};

const STATUS_COLORS: Record<IntakeStatus, { bg: string; text: string }> = {
  draft: { bg: '#E5E7EB', text: '#374151' },
  waiting_for_client: { bg: '#DBEAFE', text: '#1D4ED8' },
  in_review: { bg: '#FEF3C7', text: '#92400E' },
  completed: { bg: '#D1FAE5', text: '#065F46' },
  archived: { bg: '#E5E7EB', text: '#6B7280' },
};

const DUE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  on_track: { bg: '#ECFDF5', text: '#047857' },
  due_tomorrow: { bg: '#FFFBEB', text: '#B45309' },
  overdue: { bg: '#FEF2F2', text: '#B91C1C' },
};

function timeAgo(dateString?: string | null): string | null {
  if (!dateString) return null;
  const then = new Date(dateString).getTime();
  if (isNaN(then)) return null;
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

export default function IntakeListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const pageRef = useRef(1);
  const onEndReachedCalledDuringMomentumRef = useRef(false);

  const listCacheKey = intakesListScreenKey(user?.id, showArchived);

  const loadIntakes = useCallback(async (archived: boolean, forceRefresh = false, append = false) => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (append && (!hasMoreRef.current || loadingMoreRef.current)) return;

    const cacheKey = intakesListScreenKey(user.id, archived);
    if (!forceRefresh && !append && cacheKey) {
      const cached = screenCache.get<PaginatedIntakesCache>(cacheKey, INTAKES_LIST_CACHE_MS);
      if (cached) {
        setIntakes(cached.items);
        setHasMore(cached.hasMore);
        hasMoreRef.current = cached.hasMore;
        pageRef.current = cached.page;
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    const fetchPage = append ? pageRef.current + 1 : 1;
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else if (!forceRefresh) {
      setLoading(true);
    }

    try {
      const response = await apiService.getIntakes(
        archived ? 'archived' : undefined,
        fetchPage,
        INTAKES_PAGE_SIZE,
      );
      if (response.success) {
        const rows = response.intakes || [];
        const pagination = response.pagination;
        const hasMorePage =
          pagination?.has_more === true ||
          (pagination?.has_more !== false && rows.length >= INTAKES_PAGE_SIZE);

        setIntakes((prev) => {
          const merged = append ? [...prev, ...rows] : rows;
          pageRef.current = fetchPage;
          if (!append && cacheKey) {
            screenCache.set(cacheKey, { items: merged, hasMore: hasMorePage, page: fetchPage });
          }
          return merged;
        });
        setHasMore(hasMorePage);
        hasMoreRef.current = hasMorePage;
      } else if (!append) {
        Alert.alert('Error', response.message || 'Failed to load Intakes');
      }
    } catch (error: any) {
      console.error('Load intakes error:', error);
      if (!append) Alert.alert('Error', error.message || 'Failed to load Intakes');
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [user]);

  const loadMoreIntakes = useCallback(() => {
    if (loading || refreshing || loadingMoreRef.current || !hasMoreRef.current) return;
    void loadIntakes(showArchived, false, true);
  }, [loading, refreshing, showArchived, loadIntakes]);

  const lastLoadTimeRef = useRef<number>(0);
  const RELOAD_DEBOUNCE_MS = 2000;

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const now = Date.now();
      if (now - lastLoadTimeRef.current > RELOAD_DEBOUNCE_MS) {
        lastLoadTimeRef.current = now;
        loadIntakes(showArchived);
      }
    }, [user, showArchived, loadIntakes])
  );

  const handleRefresh = () => {
    if (!user) return;
    setRefreshing(true);
    pageRef.current = 1;
    hasMoreRef.current = true;
    if (listCacheKey) screenCache.invalidate(listCacheKey);
    loadIntakes(showArchived, true);
  };

  const handleToggleArchived = (archived: boolean) => {
    setShowArchived(archived);
    pageRef.current = 1;
    hasMoreRef.current = true;
    setHasMore(true);
    loadIntakes(archived);
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    placeholder: {
      width: 24,
    },
    tabsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      gap: 8,
    },
    tabButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    tabButtonActive: {
      backgroundColor: colors.isDark ? 'rgba(59, 130, 246, 0.24)' : '#DBEAFE',
    },
    tabButtonText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      marginLeft: 4,
    },
    tabButtonTextActive: {
      color: '#1D4ED8',
      fontWeight: '600',
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyDescription: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    createButton: {
      backgroundColor: '#007AFF',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    createButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    listContainer: {
      padding: 16,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 4,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flexShrink: 1,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '600',
    },
    clientName: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    progressBarBg: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surface,
      marginRight: 10,
    },
    progressBarFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: '#007AFF',
    },
    progressLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 12,
    },
    metaText: {
      fontSize: 11,
      color: colors.textLight,
    },
  }), [colors]);

  const renderIntake = ({ item }: { item: Intake }) => {
    const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.draft;
    const dueColor = item.due_badge ? DUE_BADGE_COLORS[item.due_badge] : null;
    const lastFile = timeAgo(item.last_file_received_at);
    const lastReminder = timeAgo(item.last_reminder_sent_at);

    return (
      <TouchableOpacity style={dynamicStyles.card} onPress={() => router.push(`/intake/${item.id}`)}>
        <View style={dynamicStyles.cardTitleRow}>
          <Text style={dynamicStyles.cardTitle} numberOfLines={1} ellipsizeMode="tail">{item.title}</Text>
          <View style={[dynamicStyles.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[dynamicStyles.badgeText, { color: statusColor.text }]}>
              {INTAKE_STATUS_LABELS[item.status]}
            </Text>
          </View>
          {item.due_badge && dueColor && (
            <View style={[dynamicStyles.badge, { backgroundColor: dueColor.bg }]}>
              <Text style={[dynamicStyles.badgeText, { color: dueColor.text }]}>
                {INTAKE_DUE_BADGE_LABELS[item.due_badge]}
              </Text>
            </View>
          )}
        </View>
        {item.client_name && (
          <Text style={dynamicStyles.clientName} numberOfLines={1}>{item.client_name}</Text>
        )}
        <View style={dynamicStyles.progressRow}>
          <View style={dynamicStyles.progressBarBg}>
            <View style={[dynamicStyles.progressBarFill, { width: `${item.progress?.percent ?? 0}%` }]} />
          </View>
          <Text style={dynamicStyles.progressLabel}>
            {item.progress?.received ?? 0}/{item.progress?.total ?? 0} &middot; {item.progress?.percent ?? 0}%
          </Text>
        </View>
        {(lastFile || lastReminder) && (
          <View style={dynamicStyles.metaRow}>
            {lastFile && <Text style={dynamicStyles.metaText}>Last file: {lastFile}</Text>}
            {lastReminder && <Text style={dynamicStyles.metaText}>Reminder sent {lastReminder}</Text>}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={dynamicStyles.title}>Intake</Text>
          <View style={dynamicStyles.placeholder} />
        </View>
        <View style={dynamicStyles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading Intakes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={dynamicStyles.title}>Intake</Text>
        <TouchableOpacity onPress={() => router.push('/intake/create')}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <View style={dynamicStyles.tabsRow}>
        <TouchableOpacity
          style={[dynamicStyles.tabButton, !showArchived && dynamicStyles.tabButtonActive]}
          onPress={() => handleToggleArchived(false)}
        >
          <Text style={[dynamicStyles.tabButtonText, !showArchived && dynamicStyles.tabButtonTextActive]}>
            Active
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[dynamicStyles.tabButton, showArchived && dynamicStyles.tabButtonActive]}
          onPress={() => handleToggleArchived(true)}
        >
          <Ionicons
            name="archive-outline"
            size={14}
            color={showArchived ? '#1D4ED8' : colors.textSecondary}
          />
          <Text style={[dynamicStyles.tabButtonText, showArchived && dynamicStyles.tabButtonTextActive]}>
            Archived
          </Text>
        </TouchableOpacity>
      </View>

      {intakes.length === 0 ? (
        <View style={dynamicStyles.emptyContainer}>
          <Ionicons name="clipboard-outline" size={64} color={colors.textLight} />
          <Text style={dynamicStyles.emptyTitle}>
            {showArchived ? 'No archived Intakes' : 'No Intakes yet'}
          </Text>
          {!showArchived && (
            <>
              <Text style={dynamicStyles.emptyDescription}>
                Create a checklist, send the link, and let GrabDocs chase the missing documents for you.
              </Text>
              <TouchableOpacity
                style={dynamicStyles.createButton}
                onPress={() => router.push('/intake/create')}
              >
                <Text style={dynamicStyles.createButtonText}>Create Your First Intake</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={intakes}
          renderItem={renderIntake}
          keyExtractor={(item) => `intake-${item.id}`}
          contentContainerStyle={dynamicStyles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#007AFF" />
          }
          onEndReached={loadMoreIntakes}
          onEndReachedThreshold={0.4}
          onMomentumScrollBegin={() => {
            onEndReachedCalledDuringMomentumRef.current = false;
          }}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
