import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ListRenderItem,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { calendarIsCompanyAdmin, useCalendarProfile } from '../../hooks/useCalendarProfile';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
    calendarAssetsMetadata,
    calendarConnections,
    calendarDeleteConnection,
    calendarGetStats,
    calendarListEvents,
    calendarSearchCompanyMembers,
    calendarSyncGoogle,
} from '../../services/calendarApi';
import {
    addCalendarPeriod,
    calendarFetchRange,
    formatCalendarTitle,
    type CalendarSubView,
} from '../../utils/calendarRange';
import {
    defaultCalendarListWindow,
    calendarDisplayLocation,
    eventHasReachMeeting,
    filterEventsByTab,
    formatEventWhen,
    ListTabFilter,
    parseUTC,
    sortCalendarEventsByStartDesc,
} from '../../utils/calendarTime';
import { CalendarOAuthWebView } from './components/CalendarOAuthWebView';
import { CalendarReachPill } from './components/CalendarReachIndicator';
import { CalendarVisualPane } from './components/CalendarVisualPane';

type EventRow = Record<string, any>;

const CALENDAR_LIST_PAGE = 10;

function isGoogleCalendarConnection(c: Record<string, unknown>): boolean {
  const p = String(c.provider ?? c.type ?? '').toLowerCase();
  return p.includes('google');
}

function isPersonalEvent(ev: EventRow): boolean {
  return String(ev.event_type ?? '').toLowerCase() === 'personal';
}

const TABS: { key: ListTabFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'today', label: 'Today' },
  { key: 'past', label: 'Past' },
];

export default function CalendarHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { profile, loading: profileLoading, refresh: refreshProfile } = useCalendarProfile();
  const isAdmin = calendarIsCompanyAdmin(profile);
  const isPersonalAccount = useMemo(() => {
    if (!profile) return false;
    return (profile.company_id ?? 0) === 0;
  }, [profile]);

  /** Personal/Company chips only after profile is known (avoid treating null profile as company). */
  const showCompanyPersonalFilters = profile !== null && !isPersonalAccount;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<ListTabFilter>('upcoming');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showPersonal, setShowPersonal] = useState(true);
  const [showCompany, setShowCompany] = useState(true);
  const [showCancelled, setShowCancelled] = useState(false);
  const [viewUserId, setViewUserId] = useState<number | null>(null);
  const [viewUserLabel, setViewUserLabel] = useState<string | null>(null);
  const [metaById, setMetaById] = useState<Record<string, any>>({});
  const [listPageCount, setListPageCount] = useState(CALENDAR_LIST_PAGE);

  const [memberHits, setMemberHits] = useState<any[]>([]);
  const onEndReachedCalledDuringMomentumRef = useRef(false);

  const [calendarConnectionsList, setCalendarConnectionsList] = useState<any[]>([]);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [oauthOpen, setOauthOpen] = useState(false);
  const [syncMenuBusy, setSyncMenuBusy] = useState(false);

  const [layoutMode, setLayoutMode] = useState<'calendar' | 'list'>('calendar');
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [calendarSubView, setCalendarSubView] = useState<CalendarSubView>('month');
  const [monthSelectedDay, setMonthSelectedDay] = useState(() => new Date());

  const monthVerticalScrollRef = useRef<ScrollView>(null);

  const calendarFabBottom = Math.max(insets.bottom, 8) + 16;
  const calendarScrollBottomPad = calendarFabBottom + 56 + 16;

  const refreshConnections = useCallback(async () => {
    try {
      const list = await calendarConnections();
      setCalendarConnectionsList(list);
    } catch {
      setCalendarConnectionsList([]);
    }
  }, []);

  const hasGoogleLinked = useMemo(
    () => calendarConnectionsList.some((c) => isGoogleCalendarConnection(c)),
    [calendarConnectionsList]
  );

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    if (!isAdmin || debouncedSearch.length < 1) {
      setMemberHits([]);
      return;
    }
    const t = setTimeout(() => {
      calendarSearchCompanyMembers(debouncedSearch, 8).then(setMemberHits).catch(() => setMemberHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [debouncedSearch, isAdmin]);

  React.useEffect(() => {
    if (!isPersonalAccount) return;
    setShowPersonal(true);
    setShowCompany(false);
  }, [isPersonalAccount]);

  const load = useCallback(async () => {
    const { start, end } =
      layoutMode === 'list'
        ? defaultCalendarListWindow()
        : calendarFetchRange(calendarCursor, calendarSubView);
    const params: Parameters<typeof calendarListEvents>[0] = {
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    };
    if (debouncedSearch) params.search = debouncedSearch;
    params.include_cancelled = showCancelled;
    if (viewUserId != null && isAdmin) params.view_user_id = viewUserId;

    if (isPersonalAccount) {
      params.event_type = 'personal';
    } else {
      if (!showPersonal && showCompany) params.event_type = 'company';
      if (showPersonal && !showCompany) params.event_type = 'personal';
      if (!showPersonal && !showCompany) {
        setEvents([]);
        setStats({});
        setMetaById({});
        return;
      }
    }

    setMetaById({});

    const statsParams = {
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    };
    const [list, st] = await Promise.all([
      calendarListEvents(params),
      viewUserId != null && isAdmin
        ? Promise.resolve({} as Record<string, number>)
        : calendarGetStats(statsParams),
    ]);
    setEvents(list);
    setStats(st);
  }, [
    debouncedSearch,
    viewUserId,
    isAdmin,
    showPersonal,
    showCompany,
    showCancelled,
    isPersonalAccount,
    layoutMode,
    calendarCursor,
    calendarSubView,
  ]);

  const eventsSignature = useMemo(() => events.map((e) => String(e.id ?? '')).join(','), [events]);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      refreshConnections();
      calendarSyncGoogle().catch(() => {});
    }, [refreshProfile, refreshConnections])
  );

  React.useEffect(() => {
    if (profileLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (!cancelled) await load();
      } catch (e: any) {
        console.warn('Calendar load failed', e?.message);
        if (!cancelled) {
          setLoadError(e?.response?.data?.error || e?.message || 'Could not load calendar');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, profileLoading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      await calendarSyncGoogle().catch(() => {});
      await load();
    } catch (e: any) {
      setLoadError(e?.response?.data?.error || e?.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const calendarListRefresh = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />,
    [refreshing, onRefresh]
  );

  const onHeaderCalendarLinkPress = useCallback(() => {
    if (hasGoogleLinked) {
      setLinkMenuOpen(true);
    } else {
      setOauthOpen(true);
    }
  }, [hasGoogleLinked]);

  const syncGoogleFromMenu = useCallback(async () => {
    setSyncMenuBusy(true);
    try {
      await calendarSyncGoogle();
      await refreshConnections();
      await load();
      Alert.alert('Sync', 'Calendar sync started');
      setLinkMenuOpen(false);
    } catch (e: any) {
      Alert.alert('Sync failed', e?.response?.data?.error || e?.message || '');
    } finally {
      setSyncMenuBusy(false);
    }
  }, [load, refreshConnections]);

  const disconnectGoogleFromMenu = useCallback(() => {
    Alert.alert('Disconnect', 'Remove Google Calendar from GrabDocs?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          const googleIds = calendarConnectionsList
            .filter((c) => isGoogleCalendarConnection(c))
            .map((c) => Number(c.id))
            .filter((id) => Number.isFinite(id));
          try {
            for (const id of googleIds) {
              await calendarDeleteConnection(id);
            }
            await refreshConnections();
            await load();
            setLinkMenuOpen(false);
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.error || e?.message || '');
          }
        },
      },
    ]);
  }, [calendarConnectionsList, load, refreshConnections]);

  const goCalendarToday = useCallback(() => {
    const n = new Date();
    setCalendarCursor(n);
    setMonthSelectedDay(n);
  }, []);

  const bumpCalendar = useCallback(
    (delta: number) => {
      setCalendarCursor((prevCursor) => {
        const next = addCalendarPeriod(prevCursor, calendarSubView, delta);
        if (calendarSubView === 'month') {
          setMonthSelectedDay((sel) => {
            const y = next.getFullYear();
            const mo = next.getMonth();
            const maxD = new Date(y, mo + 1, 0).getDate();
            const d = Math.min(sel.getDate(), maxD);
            return new Date(y, mo, d);
          });
        } else {
          setMonthSelectedDay(next);
        }
        return next;
      });
    },
    [calendarSubView]
  );

  const visibleEvents = useMemo(() => {
    if (showCancelled) return events;
    return events.filter((e) => String(e.status ?? '').toLowerCase() !== 'cancelled');
  }, [events, showCancelled]);

  const filtered = useMemo(() => {
    const base =
      layoutMode === 'calendar' ? visibleEvents : filterEventsByTab(visibleEvents, tab);
    if (layoutMode !== 'list') return base;
    return sortCalendarEventsByStartDesc(base);
  }, [visibleEvents, tab, layoutMode]);

  React.useEffect(() => {
    const cap = filtered.length;
    setListPageCount(cap === 0 ? 0 : Math.min(CALENDAR_LIST_PAGE, cap));
  }, [tab, debouncedSearch, viewUserId, showPersonal, showCompany, showCancelled, eventsSignature, filtered.length]);

  const pagedFiltered = useMemo(
    () => filtered.slice(0, Math.max(listPageCount, 0)),
    [filtered, listPageCount]
  );

  React.useEffect(() => {
    const companyIds = pagedFiltered
      .filter((ev) => !isPersonalEvent(ev) && ev.id != null)
      .map((ev) => Number(ev.id));
    const missing = companyIds.filter((id) => metaById[String(id)] === undefined);
    const batch = missing.slice(0, CALENDAR_LIST_PAGE);
    if (batch.length === 0) return;
    let cancelled = false;
    calendarAssetsMetadata(batch)
      .then((meta) => {
        if (cancelled || !meta || typeof meta !== 'object' || Array.isArray(meta)) return;
        setMetaById((prev) => ({ ...prev, ...(meta as Record<string, any>) }));
      })
      .catch(() => {
        if (cancelled) return;
        setMetaById((prev) => {
          const next = { ...prev };
          for (const id of batch) {
            if (next[String(id)] === undefined) next[String(id)] = {};
          }
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [pagedFiltered, metaById]);

  const listStats = useMemo(() => {
    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000 - 1;

    return visibleEvents.reduce(
      (acc, ev) => {
        const start = ev.start_time ? parseUTC(ev.start_time).getTime() : 0;
        const end = ev.end_time ? parseUTC(ev.end_time).getTime() : start;
        acc.total_events += 1;
        if (end >= now && ev.status !== 'cancelled') acc.upcoming_events += 1;
        if (end < now) acc.past_events += 1;
        if (
          ev.status !== 'cancelled' &&
          ((start >= dayStartMs && start <= dayEndMs) || (start < dayStartMs && end >= dayStartMs))
        ) {
          acc.events_today += 1;
        }
        return acc;
      },
      { total_events: 0, upcoming_events: 0, past_events: 0, events_today: 0 }
    );
  }, [visibleEvents]);
  const displayStats = viewUserId != null && isAdmin ? listStats : stats;
  const todayLabel = 'Today';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
        back: { padding: 8, marginRight: 8 },
        h1: { fontSize: 22, fontWeight: '700', color: colors.text, flex: 1, minWidth: 0 },
        headerLinkBtn: {
          maxWidth: 158,
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingVertical: 4,
          paddingLeft: 8,
        },
        headerConnectText: {
          color: '#007AFF',
          fontSize: 12,
          fontWeight: '600',
          textAlign: 'right',
          lineHeight: 16,
        },
        chip: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 16,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        chipOn: { backgroundColor: '#007AFF22', borderColor: '#007AFF' },
        chipText: { color: colors.text, fontSize: 13 },
        tabs: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 6,
          marginBottom: 8,
          minHeight: 48,
        },
        tabBtn: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          minHeight: 40,
          justifyContent: 'center',
          marginHorizontal: 4,
          borderRadius: 8,
          backgroundColor: colors.surface,
        },
        tabBtnOn: { backgroundColor: '#007AFF' },
        tabTxt: { color: colors.text, fontSize: 13, lineHeight: 18 },
        tabTxtOn: { color: '#fff', fontWeight: '600' },
        statRow: {
          flexDirection: 'row',
          paddingHorizontal: 12,
          marginBottom: 10,
          gap: 6,
        },
        statMiniCard: {
          flex: 1,
          minWidth: 0,
          paddingVertical: 8,
          paddingHorizontal: 4,
          borderRadius: 10,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        },
        statMiniCardSelected: {
          borderColor: '#007AFF',
          backgroundColor: '#007AFF18',
        },
        statVal: { fontSize: 15, fontWeight: '700', color: colors.text },
        statLbl: {
          fontSize: 10,
          color: colors.textSecondary,
          marginTop: 2,
          textAlign: 'center',
        },
        layoutModeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          marginBottom: 10,
          gap: 8,
        },
        layoutModeChips: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          flex: 1,
          minWidth: 0,
        },
        showCancelledCluster: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        },
        switchShowCancelled: {
          transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }],
        },
        listCancelledLabel: {
          fontSize: 11,
          color: colors.textSecondary,
        },
        card: {
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 14,
          borderRadius: 12,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
        cardSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
        cardMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'nowrap',
          marginTop: 4,
          width: '100%',
          overflow: 'hidden',
        },
        /** Text must sit in a flex:1 wrapper or RN often won’t shrink and the tail drops below. */
        cardMetaDateWrap: {
          flex: 1,
          minWidth: 0,
          marginRight: 6,
        },
        cardMetaDate: { fontSize: 13, color: colors.textSecondary },
        cardMetaType: { flexShrink: 0, fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
        cardMetaTail: {
          flexDirection: 'row',
          alignItems: 'center',
          flexGrow: 0,
          flexShrink: 0,
          gap: 6,
        },
        /** Plain row (no nested ScrollView) — ScrollView inside FlatList rows often lays out full-width and stacks. */
        cardMetaPillsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 4,
          maxWidth: 168,
          overflow: 'hidden',
        },
        cardIndicatorPill: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 8,
          backgroundColor: '#007AFF18',
        },
        cardIndicatorTxt: { fontSize: 11, color: '#007AFF', fontWeight: '600' },
        fab: {
          position: 'absolute',
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#007AFF',
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
        },
        linkTxt: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
        errBanner: {
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 12,
          borderRadius: 10,
          backgroundColor: '#FEE2E2',
          borderWidth: 1,
          borderColor: '#FECACA',
        },
        errText: { color: '#991B1B', fontSize: 14, marginBottom: 8 },
        errRetry: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
        filterChipsOnlyRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          marginBottom: 8,
          gap: 8,
        },
        searchToolbarRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          marginBottom: 10,
          gap: 6,
        },
        searchInline: {
          flex: 1,
          minWidth: 0,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.text,
          backgroundColor: colors.surface,
          fontSize: 14,
        },
        filterRowActions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
        headerIconBtn: {
          padding: 6,
          justifyContent: 'center',
          alignItems: 'center',
        },
        filterChipsStandalone: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
        viewingBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 10,
          marginBottom: 8,
          backgroundColor: colors.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        viewingBannerText: { flex: 1, fontSize: 14, color: colors.textSecondary, marginRight: 12 },
        memberSuggestBox: {
          marginHorizontal: 16,
          marginTop: -4,
          marginBottom: 8,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        memberSuggestRow: {
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        memberSuggestName: { color: colors.text, fontSize: 15 },
        memberSuggestEmail: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
        modalWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
        modalBackdropPressable: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
        modalCard: {
          borderRadius: 14,
          padding: 20,
          borderWidth: 1,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        modalTitle: {
          fontSize: 17,
          fontWeight: '700',
          color: colors.text,
          marginBottom: 16,
        },
        modalBtn: {
          backgroundColor: '#007AFF',
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: 'center',
          marginBottom: 10,
          minHeight: 48,
          justifyContent: 'center',
        },
        modalBtnDanger: {
          backgroundColor: '#ef4444',
          marginBottom: 0,
        },
        modalBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
        modalBtnDisabled: { opacity: 0.65 },
      }),
    [colors]
  );

  const openCreate = useCallback(() => {
    if (viewUserId != null && isAdmin) {
      router.push({ pathname: '/calendar/create', params: { viewUserId: String(viewUserId) } } as any);
    } else {
      router.push('/calendar/create' as any);
    }
  }, [router, viewUserId, isAdmin]);

  const metaIndicatorLabels = useCallback((id: number): string[] => {
    const m = metaById[String(id)];
    if (!m) return [];
    const parts: string[] = [];
    if (m.has_recording) parts.push('Recording');
    if (m.has_transcript) parts.push('Transcript');
    if (m.has_summary) parts.push('Summary');
    if (m.has_chat) parts.push('Chat');
    return parts;
  }, [metaById]);

  const onListEndReached = useCallback(() => {
    if (onEndReachedCalledDuringMomentumRef.current) return;
    onEndReachedCalledDuringMomentumRef.current = true;
    setListPageCount((c) => {
      if (c >= filtered.length) return c;
      return Math.min(c + CALENDAR_LIST_PAGE, filtered.length);
    });
  }, [filtered.length]);

  const renderEventItem: ListRenderItem<EventRow> = useCallback(
    ({ item: ev }) => {
      const reach = eventHasReachMeeting(ev);
      const hasAssetMeta = !isPersonalEvent(ev) && metaIndicatorLabels(ev.id).length > 0;
      const company = String(ev.event_type ?? '').toLowerCase() === 'company';
      const showRightTail = company || hasAssetMeta;
      const locationLabel = calendarDisplayLocation(ev.location);

      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/calendar/${ev.id}` as any)}
        >
          <Text style={styles.cardTitle}>
            {String(ev.status ?? '').toLowerCase() === 'cancelled' ? 'Cancelled · ' : ''}
            {ev.title || 'Untitled'}
          </Text>
          <View style={styles.cardMetaRow}>
            <View style={styles.cardMetaDateWrap}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text style={styles.cardMetaDate} numberOfLines={2}>
                  {formatEventWhen(ev)}
                </Text>
                {reach ? <CalendarReachPill /> : null}
              </View>
            </View>
            {showRightTail ? (
              <View style={styles.cardMetaTail}>
                {hasAssetMeta ? (
                  <View style={styles.cardMetaPillsRow}>
                    {metaIndicatorLabels(ev.id).map((label) => (
                      <View key={label} style={styles.cardIndicatorPill}>
                        <Text style={styles.cardIndicatorTxt}>{label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {company ? (
                  <Text style={styles.cardMetaType} numberOfLines={1}>
                    Company event
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
          {locationLabel ? <Text style={styles.cardSub}>📍 {locationLabel}</Text> : null}
        </TouchableOpacity>
      );
    },
    [router, styles, metaIndicatorLabels]
  );

  const listKeyExtractor = useCallback((item: EventRow) => String(item.id), []);

  const openStatList = useCallback((nextTab: ListTabFilter) => {
    setLayoutMode('list');
    setTab(nextTab);
  }, []);

  const listHeader = useMemo(
    () => (
      <View style={styles.statRow}>
        <TouchableOpacity
          style={[styles.statMiniCard, layoutMode === 'list' && tab === 'all' && styles.statMiniCardSelected]}
          onPress={() => openStatList('all')}
          accessibilityRole="button"
          accessibilityLabel={`Total ${displayStats.total_events ?? displayStats.total ?? '—'} events, show list`}
        >
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {displayStats.total_events ?? displayStats.total ?? '—'}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            Total
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statMiniCard, layoutMode === 'list' && tab === 'upcoming' && styles.statMiniCardSelected]}
          onPress={() => openStatList('upcoming')}
          accessibilityRole="button"
          accessibilityLabel={`Upcoming ${displayStats.upcoming_events ?? displayStats.upcoming ?? '—'} events, show list`}
        >
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {displayStats.upcoming_events ?? displayStats.upcoming ?? '—'}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statMiniCard, layoutMode === 'list' && tab === 'today' && styles.statMiniCardSelected]}
          onPress={() => openStatList('today')}
          accessibilityRole="button"
          accessibilityLabel={`Today ${displayStats.events_today ?? displayStats.today ?? '—'} events, show list`}
        >
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {displayStats.events_today ?? displayStats.today ?? '—'}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            {todayLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statMiniCard, layoutMode === 'list' && tab === 'past' && styles.statMiniCardSelected]}
          onPress={() => openStatList('past')}
          accessibilityRole="button"
          accessibilityLabel={`Past ${displayStats.past_events ?? displayStats.past ?? '—'} events, show list`}
        >
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {displayStats.past_events ?? displayStats.past ?? '—'}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            Past
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [displayStats, layoutMode, openStatList, styles, tab, todayLabel]
  );

  const listEmpty = useMemo(() => {
    if (loading) {
      return <ActivityIndicator style={{ marginTop: 40 }} />;
    }
    if (loadError && events.length === 0) {
      return (
        <Text style={[styles.cardSub, { textAlign: 'center', marginTop: 32, paddingHorizontal: 24 }]}>
          Calendar could not be loaded. Use Try again above.
        </Text>
      );
    }
    if (filtered.length === 0) {
      return <Text style={[styles.cardSub, { textAlign: 'center', marginTop: 32 }]}>No events in this view.</Text>;
    }
    return null;
  }, [loading, loadError, events.length, filtered.length, styles.cardSub]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.h1}>Calendar</Text>
        <TouchableOpacity
          style={styles.headerLinkBtn}
          onPress={onHeaderCalendarLinkPress}
          accessibilityLabel={hasGoogleLinked ? 'Google Calendar — sync or disconnect' : 'Connect Google Calendar'}
        >
          {hasGoogleLinked ? (
            <Ionicons name="link-outline" size={24} color="#007AFF" />
          ) : (
            <Text style={styles.headerConnectText}>Connect Google Calendar</Text>
          )}
        </TouchableOpacity>
      </View>

      {isAdmin && viewUserId != null ? (
        <View style={styles.viewingBanner}>
          <Text style={styles.viewingBannerText} numberOfLines={2}>
            Viewing calendar for {viewUserLabel ?? `member #${viewUserId}`}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setViewUserId(null);
              setViewUserLabel(null);
            }}
            accessibilityLabel="Clear member calendar view"
          >
            <Text style={styles.linkTxt}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showCompanyPersonalFilters ? (
        <View style={styles.filterChipsOnlyRow}>
          <View style={styles.filterChipsStandalone}>
            <TouchableOpacity style={[styles.chip, showPersonal && styles.chipOn]} onPress={() => setShowPersonal((v) => !v)}>
              <Text style={styles.chipText}>Personal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, showCompany && styles.chipOn]} onPress={() => setShowCompany((v) => !v)}>
              <Text style={styles.chipText}>Company</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.searchToolbarRow}>
        <TextInput
          style={styles.searchInline}
          placeholder={
            profile !== null && isAdmin ? 'Events, members…' : 'Search events…'
          }
          accessibilityLabel={
            profile !== null && isAdmin
              ? 'Search events or members by name or email'
              : 'Search title, location, notes'
          }
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
        />
        <View style={styles.filterRowActions}>
          <TouchableOpacity
            onPress={openCreate}
            accessibilityLabel="New event"
            accessibilityRole="button"
            style={styles.headerIconBtn}
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.tint} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              router.push('/(tabs)/chats?openStartNew=1&chatSource=calendar' as any)
            }
            accessibilityLabel="Open ChatGD"
            accessibilityRole="button"
            style={styles.headerIconBtn}
          >
            <Ionicons name="chatbubbles-outline" size={24} color={colors.tint} />
          </TouchableOpacity>
        </View>
      </View>

      {isAdmin && debouncedSearch.length > 0 && memberHits.length > 0 ? (
        <View style={styles.memberSuggestBox}>
          {memberHits.map((item) => (
            <TouchableOpacity
              key={String(item.id)}
              style={styles.memberSuggestRow}
              onPress={() => {
                setViewUserId(Number(item.id));
                setViewUserLabel(String(item.name || item.email || '').trim() || null);
                setSearch('');
                setMemberHits([]);
              }}
            >
              <Text style={styles.memberSuggestName} numberOfLines={1}>
                {item.name || item.email || `User #${item.id}`}
              </Text>
              {item.email && item.name ? (
                <Text style={styles.memberSuggestEmail} numberOfLines={1}>
                  {item.email}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {listHeader}

      <View style={styles.layoutModeRow}>
        <View style={styles.layoutModeChips}>
          <TouchableOpacity
            style={[styles.chip, layoutMode === 'calendar' && styles.chipOn]}
            onPress={() => setLayoutMode('calendar')}
            accessibilityRole="button"
            accessibilityLabel="Calendar view"
          >
            <Text style={styles.chipText}>Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, layoutMode === 'list' && styles.chipOn]}
            onPress={() => setLayoutMode('list')}
            accessibilityRole="button"
            accessibilityLabel="List view"
          >
            <Text style={styles.chipText}>List</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.showCancelledCluster}>
          <Text style={styles.listCancelledLabel} numberOfLines={1}>
            Show cancelled
          </Text>
          <Switch
            value={showCancelled}
            onValueChange={setShowCancelled}
            accessibilityLabel="Show cancelled events"
            style={styles.switchShowCancelled}
          />
        </View>
      </View>

      {loadError && !loading ? (
        <View style={styles.errBanner}>
          <Text style={styles.errText}>{loadError}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoadError(null);
              setLoading(true);
              load()
                .catch((e: any) => setLoadError(e?.response?.data?.error || e?.message || 'Could not load calendar'))
                .finally(() => setLoading(false));
            }}
          >
            <Text style={styles.errRetry}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {layoutMode === 'calendar' ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 8 }}>
            <TouchableOpacity style={{ width: 52 }} onPress={goCalendarToday}>
              <Text style={styles.linkTxt}>Today</Text>
            </TouchableOpacity>
            {calendarSubView === 'month' ? (
              <View style={{ flex: 1 }} />
            ) : (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <TouchableOpacity onPress={() => bumpCalendar(-1)} accessibilityLabel="Previous period">
                  <Ionicons name="chevron-back" size={24} color="#007AFF" />
                </TouchableOpacity>
                <Text style={{ fontWeight: '700', fontSize: 15, color: colors.text, maxWidth: 180 }} numberOfLines={1}>
                  {formatCalendarTitle(calendarCursor, calendarSubView)}
                </Text>
                <TouchableOpacity onPress={() => bumpCalendar(1)} accessibilityLabel="Next period">
                  <Ionicons name="chevron-forward" size={24} color="#007AFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0, marginBottom: 10 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          >
            {(['month', 'week', 'day', 'agenda'] as const).map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.chip, calendarSubView === v && styles.chipOn]}
                onPress={() => setCalendarSubView(v)}
                accessibilityRole="button"
              >
                <Text style={styles.chipText}>{v === 'agenda' ? 'Agenda' : v.charAt(0).toUpperCase() + v.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {calendarSubView === 'month' ? (
            <ScrollView
              ref={monthVerticalScrollRef}
              style={{ flex: 1 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: calendarScrollBottomPad }}
              keyboardShouldPersistTaps="handled"
            >
              <CalendarVisualPane
                subView={calendarSubView}
                cursor={calendarCursor}
                monthSelectedDay={monthSelectedDay}
                onMonthSelectedDay={setMonthSelectedDay}
                onCursorDateChange={setCalendarCursor}
                visibleEvents={visibleEvents}
                colors={{
                  background: colors.background,
                  surface: colors.surface,
                  text: colors.text,
                  textSecondary: colors.textSecondary,
                  border: colors.border,
                }}
                onEventPress={(id) => router.push(`/calendar/${id}` as any)}
                monthScrollRef={monthVerticalScrollRef}
              />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <CalendarVisualPane
                subView={calendarSubView}
                cursor={calendarCursor}
                monthSelectedDay={monthSelectedDay}
                onMonthSelectedDay={setMonthSelectedDay}
                onCursorDateChange={setCalendarCursor}
                visibleEvents={visibleEvents}
                colors={{
                  background: colors.background,
                  surface: colors.surface,
                  text: colors.text,
                  textSecondary: colors.textSecondary,
                  border: colors.border,
                }}
                onEventPress={(id) => router.push(`/calendar/${id}` as any)}
                listRefreshControl={calendarListRefresh}
              />
            </View>
          )}
        </>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={styles.tabs}
            nestedScrollEnabled
          >
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tabBtn, tab === t.key && styles.tabBtnOn]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtOn]} numberOfLines={1}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            style={{ flex: 1 }}
            data={pagedFiltered}
            extraData={metaById}
            keyExtractor={listKeyExtractor}
            renderItem={renderEventItem}
            ListEmptyComponent={listEmpty}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: calendarScrollBottomPad, flexGrow: 1 }}
            onEndReached={onListEndReached}
            onEndReachedThreshold={0.35}
            onMomentumScrollBegin={() => {
              onEndReachedCalledDuringMomentumRef.current = false;
            }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <TouchableOpacity style={[styles.fab, { bottom: calendarFabBottom }]} onPress={openCreate} accessibilityLabel="New event">
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={linkMenuOpen} transparent animationType="fade" onRequestClose={() => setLinkMenuOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdropPressable} onPress={() => setLinkMenuOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Google Calendar</Text>
            <TouchableOpacity
              style={[styles.modalBtn, syncMenuBusy && styles.modalBtnDisabled]}
              disabled={syncMenuBusy}
              onPress={syncGoogleFromMenu}
              accessibilityRole="button"
              accessibilityLabel="Sync Google Calendar"
            >
              {syncMenuBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalBtnText}>Sync</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnDanger]}
              onPress={disconnectGoogleFromMenu}
              accessibilityRole="button"
              accessibilityLabel="Disconnect Google Calendar"
            >
              <Text style={styles.modalBtnText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CalendarOAuthWebView
        visible={oauthOpen}
        onClose={() => setOauthOpen(false)}
        onSuccess={async () => {
          await refreshConnections();
          await calendarSyncGoogle().catch(() => {});
          try {
            await load();
          } catch {
            /* surfaced via existing load error paths */
          }
        }}
        onError={(msg) => Alert.alert('Connection', msg)}
      />
    </SafeAreaView>
  );
}
