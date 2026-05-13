import {
  flushPendingCalendarCreates,
  getPendingCalendarCreates,
  pendingCreatesToEventRows,
  type FlushResult
} from '@/utils/calendarPendingCreates';
import { Ionicons } from '@expo/vector-icons';
import { addNetworkStateListener, useNetworkState } from 'expo-network';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
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
  calendarSyncGoogleWithStaleConnectionRecovery,
} from '../../services/calendarApi';
import {
  buildCalendarListStorageKey,
  getCalendarListCache,
  getCalendarListFallback,
  isCalendarFetchOfflineError,
  saveCalendarListCache,
} from '../../utils/calendarCache';
import { isDeviceOfflineForCalendar } from '../../utils/calendarOffline';
import { addCalendarPeriod, formatCalendarTitle, type CalendarSubView } from '../../utils/calendarRange';
import {
  calendarDisplayLocation,
  calendarEventMatchesLocalSearch,
  defaultCalendarListWindow,
  eventHasReachMeeting,
  filterEventsByTab,
  formatEventWhen,
  ListTabFilter,
  sortCalendarEventsByStartAsc,
  sortCalendarEventsByStartDesc,
} from '../../utils/calendarTime';
import { CalendarOAuthWebView } from './components/CalendarOAuthWebView';
import { CalendarReachPill } from './components/CalendarReachIndicator';
import { CalendarVisualPane } from './components/CalendarVisualPane';

type EventRow = Record<string, any>;

const CALENDAR_LIST_PAGE = 10;

/** Axios / AbortController cancellations should not wedge loading or hydrate error paths. */
function isCalendarFetchCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { code?: string; name?: string };
  return o.code === 'ERR_CANCELED' || o.name === 'AbortError' || o.name === 'CanceledError';
}

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
  const [events, setEvents] = useState<EventRow[]>([]);
  /** Last full-window fetch (no event search API param); feeds instant hybrid search while typing. */
  const [eventsBaseline, setEventsBaseline] = useState<EventRow[]>([]);
  const statsForDiskRef = useRef<Record<string, number>>({});
  const calendarLoadGenerationRef = useRef(0);
  const calendarListAbortRef = useRef<AbortController | null>(null);

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

  const networkState = useNetworkState();
  const deviceOffline = useMemo(
    () => isDeviceOfflineForCalendar(networkState),
    [networkState?.isConnected, networkState?.type, networkState?.isInternetReachable]
  );
  const [calendarReadOnlyOffline, setCalendarReadOnlyOffline] = useState(false);
  const [pendingEventRows, setPendingEventRows] = useState<EventRow[]>([]);

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

  const dismissCalendarOverlays = useCallback(() => {
    Keyboard.dismiss();
    setMemberHits([]);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 175);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    if (!isAdmin) {
      setMemberHits([]);
      return;
    }
    const raw = debouncedSearch.trim();
    if (!raw.startsWith('@')) {
      setMemberHits([]);
      return;
    }
    const memberQuery = raw.slice(1).trim();
    if (memberQuery.length < 1) {
      setMemberHits([]);
      return;
    }
    const t = setTimeout(() => {
      calendarSearchCompanyMembers(memberQuery, 8).then(setMemberHits).catch(() => setMemberHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [debouncedSearch, isAdmin]);

  React.useEffect(() => {
    statsForDiskRef.current = stats;
  }, [stats]);

  React.useEffect(() => {
    if (!isPersonalAccount) return;
    setShowPersonal(true);
    setShowCompany(false);
  }, [isPersonalAccount]);

  const listStorageKey = useMemo(
    () =>
      buildCalendarListStorageKey({
        userId: profile?.id,
        debouncedSearch,
        showCancelled,
        viewUserId,
        isPersonalAccount,
        showPersonal,
        showCompany,
      }),
    [
      profile?.id,
      debouncedSearch,
      showCancelled,
      viewUserId,
      isPersonalAccount,
      showPersonal,
      showCompany,
    ]
  );

  const load = useCallback(async () => {
    const debTrim = debouncedSearch.trim();
    /** `@` prefixes member lookup; omit search param so the full window feeds local + member UI. */
    const eventApiSearch = debTrim.startsWith('@') ? '' : debTrim;

    calendarListAbortRef.current?.abort();
    const controller = new AbortController();
    calendarListAbortRef.current = controller;
    const signal = controller.signal;
    const gen = ++calendarLoadGenerationRef.current;

    /** Same window as web: past 30 days through next 90 days for events + stats. */
    const { start, end } = defaultCalendarListWindow();
    const params: Parameters<typeof calendarListEvents>[0] = {
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    };
    if (eventApiSearch) params.search = eventApiSearch;
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
        setEventsBaseline([]);
        return;
      }
    }

    setMetaById({});

    const statsParams: Parameters<typeof calendarGetStats>[0] = {
      start_date: params.start_date,
      end_date: params.end_date,
    };
    if (viewUserId != null && isAdmin) statsParams.view_user_id = viewUserId;
    if (params.event_type) statsParams.event_type = params.event_type;

    const refreshStatsWithList = eventApiSearch.length === 0;

    try {
      let list: EventRow[];
      let diskStats: Record<string, number>;

      if (refreshStatsWithList) {
        const [lst, st] = await Promise.all([
          calendarListEvents(params, { signal }),
          calendarGetStats(statsParams, { signal }),
        ]);
        if (signal.aborted || gen !== calendarLoadGenerationRef.current) return;
        list = lst;
        diskStats = st;
        setEvents(list);
        setStats(st);
        setEventsBaseline(list);
      } else {
        list = await calendarListEvents(params, { signal });
        if (signal.aborted || gen !== calendarLoadGenerationRef.current) return;
        diskStats = statsForDiskRef.current;
        setEvents(list);
      }

      if (signal.aborted || gen !== calendarLoadGenerationRef.current) return;

      if (listStorageKey) void saveCalendarListCache(listStorageKey, list, diskStats);
    } catch (e: unknown) {
      if (isCalendarFetchCancelled(e) || gen !== calendarLoadGenerationRef.current) return;
      throw e;
    }
  }, [
    debouncedSearch,
    viewUserId,
    isAdmin,
    showPersonal,
    showCompany,
    showCancelled,
    isPersonalAccount,
    profile?.id,
    listStorageKey,
  ]);

  const reloadPendingRows = useCallback(async () => {
    const uid = profile?.id;
    if (uid == null) {
      setPendingEventRows([]);
      return;
    }
    const list = await getPendingCalendarCreates();
    setPendingEventRows(
      pendingCreatesToEventRows(list, {
        userId: uid,
        viewUserId,
        isAdmin,
        showPersonal,
        showCompany,
        isPersonalAccount,
      })
    );
  }, [
    profile?.id,
    viewUserId,
    isAdmin,
    showPersonal,
    showCompany,
    isPersonalAccount,
  ]);

  const localSearchForEvents = useMemo(() => {
    const s = search.trim();
    if (s.startsWith('@')) return '';
    return s;
  }, [search]);

  const debouncedEventSearch = useMemo(() => {
    const s = debouncedSearch.trim();
    if (s.startsWith('@')) return '';
    return s;
  }, [debouncedSearch]);

  const mergedServerRows = useMemo(() => {
    const live = localSearchForEvents;
    const db = debouncedEventSearch;

    if (!live) return events;

    if (live !== db && eventsBaseline.length > 0) {
      return eventsBaseline.filter((e) =>
        calendarEventMatchesLocalSearch(e as Record<string, unknown>, live)
      );
    }
    return events;
  }, [events, eventsBaseline, localSearchForEvents, debouncedEventSearch]);

  const displayEvents = useMemo(() => {
    const pendingFiltered = pendingEventRows.filter((e) =>
      calendarEventMatchesLocalSearch(e as Record<string, unknown>, localSearchForEvents)
    );
    return sortCalendarEventsByStartAsc([...mergedServerRows, ...pendingFiltered]);
  }, [mergedServerRows, pendingEventRows, localSearchForEvents]);

  const eventsSignature = useMemo(() => displayEvents.map((e) => String(e.id ?? '')).join(','), [displayEvents]);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      refreshConnections();
      if (!deviceOffline) {
        calendarSyncGoogleWithStaleConnectionRecovery().catch(() => {});
      }
      reloadPendingRows();
    }, [refreshProfile, refreshConnections, deviceOffline, reloadPendingRows])
  );

  React.useEffect(() => {
    if (profileLoading) return;
    let cancelled = false;

    const hydrateDisk = async (): Promise<boolean> => {
      if (listStorageKey) {
        const cached = await getCalendarListCache(listStorageKey);
        if (!cancelled && cached) {
          const keyHasEventSearch =
            debouncedSearch.trim().length > 0 && !debouncedSearch.trim().startsWith('@');
          setEvents(cached.events);
          setStats(cached.stats);
          if (!keyHasEventSearch) setEventsBaseline(cached.events as EventRow[]);
          setLoading(false);
          return true;
        }
      }
      const fallback = await getCalendarListFallback(profile?.id);
      if (!cancelled && fallback) {
        const keyHasEventSearch =
          debouncedSearch.trim().length > 0 && !debouncedSearch.trim().startsWith('@');
        setEvents(fallback.events);
        setStats(fallback.stats);
        if (!keyHasEventSearch) setEventsBaseline(fallback.events as EventRow[]);
        setLoading(false);
        return true;
      }
      return false;
    };

    (async () => {
      const hadDisk = await hydrateDisk();

      if (deviceOffline) {
        if (!cancelled) setCalendarReadOnlyOffline(true);
        if (!hadDisk && !cancelled) {
          setEvents([]);
          setStats({});
          setEventsBaseline([]);
          setLoading(false);
        }
        return;
      }

      if (!hadDisk && !cancelled) setLoading(true);
      if (!cancelled) setCalendarReadOnlyOffline(false);

      try {
        if (!cancelled) await load();
        if (!cancelled) setCalendarReadOnlyOffline(false);
      } catch (e: any) {
        console.warn('Calendar load failed', e?.message);
        if (isCalendarFetchOfflineError(e)) {
          await hydrateDisk();
          if (!cancelled) setCalendarReadOnlyOffline(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [load, profileLoading, listStorageKey, profile?.id, deviceOffline, debouncedSearch]);

  React.useEffect(() => {
    if (deviceOffline || profileLoading || profile?.id == null) return;
    let cancelled = false;
    (async () => {
      const r = await flushPendingCalendarCreates(profile.id);
      if (cancelled) return;
      try {
        if (r.synced > 0) await load();
      } catch {
        /* load handles hydrate */
      }
      await reloadPendingRows();
      const parts: string[] = [];
      if (r.synced > 0) {
        parts.push(
          `${r.synced} queued event(s) were saved. Invitations and emails are handled by the server.`
        );
      }
      if (r.permanent > 0) {
        parts.push(
          `${r.permanent} item(s) need attention (validation error or max retries). Open each queued event for details or discard.`
        );
      }
      if (parts.length) Alert.alert('Calendar sync', parts.join('\n\n'));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    deviceOffline,
    profileLoading,
    profile?.id,
    load,
    reloadPendingRows,
    networkState?.isConnected,
    networkState?.isInternetReachable,
  ]);

  React.useEffect(() => {
    if (profileLoading || profile?.id == null) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sub = addNetworkStateListener((state) => {
      if (isDeviceOfflineForCalendar(state)) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        flushPendingCalendarCreates(profile.id).then(async (r: FlushResult) => {
          if (r.synced > 0) {
            try {
              await load();
            } catch {
              /* ignore */
            }
            await reloadPendingRows();
          }
        });
      }, 800);
    });
    return () => {
      sub.remove();
      clearTimeout(debounce);
    };
  }, [profile?.id, profileLoading, load, reloadPendingRows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (deviceOffline) {
        let ok = false;
        if (listStorageKey) {
          const c = await getCalendarListCache(listStorageKey);
          if (c) {
            setEvents(c.events);
            setStats(c.stats);
            ok = true;
          }
        }
        if (!ok) {
          const fb = await getCalendarListFallback(profile?.id);
          if (fb) {
            setEvents(fb.events);
            setStats(fb.stats);
          }
        }
        setCalendarReadOnlyOffline(true);
        return;
      }
      if (profile?.id != null) {
        await flushPendingCalendarCreates(profile.id);
      }
      await calendarSyncGoogleWithStaleConnectionRecovery().catch(() => {});
      await load();
      setCalendarReadOnlyOffline(false);
    } catch (e: any) {
      console.warn('Calendar refresh failed', e?.message);
      if (isCalendarFetchOfflineError(e)) {
        if (listStorageKey) {
          const c = await getCalendarListCache(listStorageKey);
          if (c) {
            setEvents(c.events);
            setStats(c.stats);
          }
        } else {
          const fb = await getCalendarListFallback(profile?.id);
          if (fb) {
            setEvents(fb.events);
            setStats(fb.stats);
          }
        }
        setCalendarReadOnlyOffline(true);
      }
    } finally {
      setRefreshing(false);
      reloadPendingRows();
    }
  }, [load, deviceOffline, listStorageKey, profile?.id, reloadPendingRows]);

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
    if (deviceOffline) {
      Alert.alert('Offline', 'Connect to sync Google Calendar.');
      return;
    }
    setSyncMenuBusy(true);
    try {
      await calendarSyncGoogleWithStaleConnectionRecovery();
      await refreshConnections();
      await load();
      Alert.alert('Sync', 'Calendar sync started');
      setLinkMenuOpen(false);
    } catch (e: any) {
      Alert.alert('Sync failed', e?.response?.data?.error || e?.message || '');
    } finally {
      setSyncMenuBusy(false);
    }
  }, [load, refreshConnections, deviceOffline]);

  const disconnectGoogleFromMenu = useCallback(() => {
    Alert.alert('Disconnect', 'Remove Google Calendar from GrabDocs?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          if (deviceOffline) {
            Alert.alert('Offline', 'Disconnecting requires a connection.');
            return;
          }
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
  }, [calendarConnectionsList, load, refreshConnections, deviceOffline]);

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
    [calendarSubView, dismissCalendarOverlays]
  );

  const visibleEvents = useMemo(() => {
    if (showCancelled) return displayEvents;
    return displayEvents.filter((e) => String(e.status ?? '').toLowerCase() !== 'cancelled');
  }, [displayEvents, showCancelled]);

  const filtered = useMemo(() => {
    const base =
      layoutMode === 'calendar' ? visibleEvents : filterEventsByTab(visibleEvents, tab);
    if (layoutMode !== 'list') return base;
    /** Web: Past = newest first; All / Upcoming / Today = earliest first. */
    return tab === 'past'
      ? sortCalendarEventsByStartDesc(base)
      : sortCalendarEventsByStartAsc(base);
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

  const todayLabel = 'Today';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
        back: { padding: 8, marginRight: 8 },
        h1: { fontSize: 22, fontWeight: '700', color: colors.text, flex: 1, minWidth: 0 },
        headerRight: {
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 0,
          gap: 2,
        },
        headerLinkBtn: {
          maxWidth: 158,
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingVertical: 4,
          paddingLeft: 4,
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
        listEventCount: {
          paddingHorizontal: 16,
          marginBottom: 8,
          fontSize: 13,
          color: colors.textSecondary,
        },
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
          gap: 10,
        },
        /** Segmented control: Calendar | List — reads as tabs, not loose chips. */
        layoutModeSegment: {
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'stretch',
          padding: 3,
          borderRadius: 10,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        layoutModeTab: {
          flex: 1,
          minWidth: 0,
          paddingVertical: 9,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
        },
        layoutModeTabActive: {
          backgroundColor: colors.primary,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.12,
          shadowRadius: 2,
          elevation: 2,
        },
        layoutModeTabText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.textSecondary,
        },
        layoutModeTabTextActive: {
          color: '#fff',
        },
        showCancelledCluster: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        },
        switchShowCancelled: {
          transform: [{ scaleX: 0.94 }, { scaleY: 0.94 }],
        },
        listCancelledLabel: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.text,
          maxWidth: 108,
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
        offlineBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 10,
          marginBottom: 8,
          backgroundColor: `${colors.tint ?? '#007AFF'}18`,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        offlineBannerText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
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
    dismissCalendarOverlays();
    if (viewUserId != null && isAdmin) {
      router.push({ pathname: '/calendar/create', params: { viewUserId: String(viewUserId) } } as any);
    } else {
      router.push('/calendar/create' as any);
    }
  }, [router, viewUserId, isAdmin, dismissCalendarOverlays]);

  const navigateToEventDetail = useCallback(
    (ev: EventRow) => {
      if (ev._offlinePendingCreate && ev._offlinePendingLocalId) {
        router.push(`/calendar/pending/${ev._offlinePendingLocalId}` as any);
      } else {
        router.push(`/calendar/${ev.id}` as any);
      }
    },
    [router]
  );

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
          onPress={() => {
            dismissCalendarOverlays();
            navigateToEventDetail(ev);
          }}
        >
          <Text style={styles.cardTitle}>
            {ev._offlinePendingCreate ? (ev._needsAttention ? 'Needs attention · ' : 'Queued · ') : ''}
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
    [router, styles, metaIndicatorLabels, dismissCalendarOverlays, navigateToEventDetail]
  );

  const listKeyExtractor = useCallback((item: EventRow) => String(item.id), []);

  const openStatList = useCallback((nextTab: ListTabFilter) => {
    dismissCalendarOverlays();
    setLayoutMode('list');
    setTab(nextTab);
  }, [dismissCalendarOverlays]);

  const listHeader = useMemo(
    () => (
      <View style={styles.statRow}>
        <TouchableOpacity
          style={[styles.statMiniCard, layoutMode === 'list' && tab === 'all' && styles.statMiniCardSelected]}
          onPress={() => openStatList('all')}
          accessibilityRole="button"
          accessibilityLabel={`Total ${stats.total_events ?? stats.total ?? '—'} events, show list`}
        >
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {stats.total_events ?? stats.total ?? '—'}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            Total
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statMiniCard, layoutMode === 'list' && tab === 'upcoming' && styles.statMiniCardSelected]}
          onPress={() => openStatList('upcoming')}
          accessibilityRole="button"
          accessibilityLabel={`Upcoming ${stats.upcoming_events ?? stats.upcoming ?? '—'} events, show list`}
        >
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {stats.upcoming_events ?? stats.upcoming ?? '—'}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statMiniCard, layoutMode === 'list' && tab === 'today' && styles.statMiniCardSelected]}
          onPress={() => openStatList('today')}
          accessibilityRole="button"
          accessibilityLabel={`Today ${stats.events_today ?? stats.today ?? '—'} events, show list`}
        >
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {stats.events_today ?? stats.today ?? '—'}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            {todayLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statMiniCard, layoutMode === 'list' && tab === 'past' && styles.statMiniCardSelected]}
          onPress={() => openStatList('past')}
          accessibilityRole="button"
          accessibilityLabel={`Past ${stats.past_events ?? stats.past ?? '—'} events, show list`}
        >
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {stats.past_events ?? stats.past ?? '—'}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            Past
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [layoutMode, openStatList, stats, styles, tab, todayLabel]
  );

  const showOfflineBanner = deviceOffline || calendarReadOnlyOffline;

  const listEmpty = useMemo(() => {
    if (loading) {
      return <ActivityIndicator style={{ marginTop: 40 }} />;
    }
    if (filtered.length === 0) {
      const offlineEmpty =
        showOfflineBanner &&
        events.length === 0 &&
        pendingEventRows.length === 0 &&
        Object.keys(stats).length === 0;
      return (
        <Text style={[styles.cardSub, { textAlign: 'center', marginTop: 32 }]}>
          {offlineEmpty ? 'No saved calendar yet. Connect once to download events.' : 'No events in this view.'}
        </Text>
      );
    }
    return null;
  }, [loading, filtered.length, styles.cardSub, showOfflineBanner, events.length, pendingEventRows.length, stats]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.h1}>Calendar</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={openCreate}
            accessibilityLabel="New event"
            accessibilityRole="button"
            style={styles.headerIconBtn}
          >
            <Ionicons name="add" size={24} color={colors.tint ?? '#007AFF'} />
          </TouchableOpacity>
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
      </View>

      {showOfflineBanner ? (
        <View style={styles.offlineBanner} accessibilityRole="text">
          <Ionicons name="cloud-offline-outline" size={20} color={colors.tint ?? '#007AFF'} />
          <Text style={styles.offlineBannerText}>
            {deviceOffline
              ? "You're offline — showing saved calendar."
              : "Can't reach the server — showing saved calendar."}
          </Text>
        </View>
      ) : null}

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
            <TouchableOpacity style={[styles.chip, showPersonal && styles.chipOn]} onPress={() => {
              dismissCalendarOverlays();
              setShowPersonal((v) => !v);
            }}>
              <Text style={styles.chipText}>Personal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, showCompany && styles.chipOn]} onPress={() => {
              dismissCalendarOverlays();
              setShowCompany((v) => !v);
            }}>
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
          blurOnSubmit={false}
          clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
        />
        <View style={styles.filterRowActions}>
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
        <View style={styles.layoutModeSegment}>
          <TouchableOpacity
            style={[styles.layoutModeTab, layoutMode === 'calendar' && styles.layoutModeTabActive]}
            onPress={() => {
              dismissCalendarOverlays();
              setLayoutMode('calendar');
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: layoutMode === 'calendar' }}
            accessibilityLabel="Calendar view"
          >
            <Text
              style={[
                styles.layoutModeTabText,
                layoutMode === 'calendar' && styles.layoutModeTabTextActive,
              ]}
            >
              Calendar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.layoutModeTab, layoutMode === 'list' && styles.layoutModeTabActive]}
            onPress={() => {
              dismissCalendarOverlays();
              setLayoutMode('list');
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: layoutMode === 'list' }}
            accessibilityLabel="List view"
          >
            <Text
              style={[styles.layoutModeTabText, layoutMode === 'list' && styles.layoutModeTabTextActive]}
            >
              List
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.showCancelledCluster}>
          <Text style={styles.listCancelledLabel} numberOfLines={1}>
            Show cancelled
          </Text>
          <Switch
            value={showCancelled}
            onValueChange={(v) => {
              dismissCalendarOverlays();
              setShowCancelled(v);
            }}
            accessibilityLabel="Show cancelled events"
            style={styles.switchShowCancelled}
            trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
            thumbColor={colors.switchThumbAndroid(showCancelled)}
            ios_backgroundColor={colors.switchTrackOff}
          />
        </View>
      </View>

      {layoutMode === 'calendar' ? (
        <>
          {calendarSubView !== 'month' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 12,
                marginBottom: 8,
                gap: 12,
              }}
            >
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
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              marginBottom: 10,
              gap: 8,
            }}
          >
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={dismissCalendarOverlays}
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1, minWidth: 0 }}
              contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 2 }}
            >
              {(['month', 'week', 'day', 'agenda'] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.chip, calendarSubView === v && styles.chipOn]}
                  onPress={() => {
                    dismissCalendarOverlays();
                    setCalendarSubView(v);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.chipText}>{v === 'agenda' ? 'Agenda' : v.charAt(0).toUpperCase() + v.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={goCalendarToday}
              style={{ flexShrink: 0, alignSelf: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Today"
            >
              <Text style={styles.linkTxt}>Today</Text>
            </TouchableOpacity>
          </View>

          {calendarSubView === 'month' ? (
            <ScrollView
              ref={monthVerticalScrollRef}
              style={{ flex: 1 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: calendarScrollBottomPad }}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={dismissCalendarOverlays}
            >
              <CalendarVisualPane
                subView={calendarSubView}
                cursor={calendarCursor}
                monthSelectedDay={monthSelectedDay}
                onMonthSelectedDay={setMonthSelectedDay}
                onCursorDateChange={setCalendarCursor}
                visibleEvents={visibleEvents}
                listTab={tab}
                onDismissOverlays={dismissCalendarOverlays}
                colors={{
                  background: colors.background,
                  surface: colors.surface,
                  text: colors.text,
                  textSecondary: colors.textSecondary,
                  border: colors.border,
                }}
                onEventPress={(id) => {
                  dismissCalendarOverlays();
                  const ev = visibleEvents.find((e) => e.id === id);
                  if (ev) navigateToEventDetail(ev);
                  else router.push(`/calendar/${id}` as any);
                }}
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
                listTab={tab}
                colors={{
                  background: colors.background,
                  surface: colors.surface,
                  text: colors.text,
                  textSecondary: colors.textSecondary,
                  border: colors.border,
                }}
                onEventPress={(id) => {
                  const ev = visibleEvents.find((e) => e.id === id);
                  if (ev) navigateToEventDetail(ev);
                  else router.push(`/calendar/${id}` as any);
                }}
                listRefreshControl={calendarListRefresh}
              />
            </View>
          )}
        </>
      ) : (
        <>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
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

          <Text style={styles.listEventCount} accessibilityLiveRegion="polite">
            {filtered.length} event(s)
          </Text>

          <FlatList
            style={{ flex: 1 }}
            data={pagedFiltered}
            extraData={metaById}
            keyExtractor={listKeyExtractor}
            renderItem={renderEventItem}
            ListEmptyComponent={listEmpty}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: calendarScrollBottomPad, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={dismissCalendarOverlays}
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
          await calendarSyncGoogleWithStaleConnectionRecovery().catch(() => {});
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
