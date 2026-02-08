import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../hooks/useThemeColors';
import { apiClient } from '../services/api';
import { AnimatedHeaderContainer } from './components/AnimatedHeaderContainer';
import { TapToToggleHeaderView } from './components/TapToToggleHeaderView';
import { useAuth } from './context/auth';

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  metadata?: {
    action_type?: string;
    navigation_path?: string;
    has_actions?: boolean;
    share_id?: number;
    file_id?: number;
    file_name?: string;
    sender_name?: string;
    invitation_id?: number;
    [key: string]: any;
  };
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingId, setMarkingId] = useState<number | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.getNotifications();
      if (res?.success && res?.data) {
        const list = res.data.notifications ?? [];
        const count = res.data.unreadCount ?? list.filter((n: AppNotification) => !n.read).length;
        setNotifications(list);
        setUnreadCount(count);
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const markAsRead = useCallback(async (id: number) => {
    setMarkingId(id);
    try {
      await apiClient.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } finally {
      setMarkingId(null);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    try {
      await apiClient.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }, [unreadCount]);

  const clearAll = useCallback(async () => {
    if (notifications.length === 0) return;
    try {
      await apiClient.clearAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }, [notifications.length]);

  const handleNotificationPress = useCallback(
    (n: AppNotification) => {
      if (!n.read) markAsRead(n.id);
      if (n.metadata?.navigation_path) {
        const path = n.metadata.navigation_path as string;
        if (path.startsWith('/')) router.push(path as any);
        else router.push(`/${path}` as any);
      }
    },
    [markAsRead, router]
  );

  const dynamicStyles = StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
    markAll: { color: '#007AFF', fontSize: 16 },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 48,
    },
    emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    rowUnread: { backgroundColor: colors.card },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    body: { flex: 1 },
    title: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 },
    message: { fontSize: 14, color: colors.textSecondary },
    time: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  });

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <TapToToggleHeaderView style={[styles.container, { backgroundColor: colors.background }]}>
        <AnimatedHeaderContainer>
          <View style={dynamicStyles.header}>
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={dynamicStyles.headerTitle}>Notifications</Text>
            <View style={{ width: 40 }} />
          </View>
        </AnimatedHeaderContainer>
        <View style={dynamicStyles.empty}>
          <Text style={dynamicStyles.emptyText}>Sign in to view notifications.</Text>
        </View>
        </TapToToggleHeaderView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <TapToToggleHeaderView style={[styles.container, { backgroundColor: colors.background }]}>
      <AnimatedHeaderContainer>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>Notifications</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {notifications.length > 0 && (
              <TouchableOpacity onPress={clearAll}>
                <Text style={[dynamicStyles.markAll, { color: '#FF3B30' }]}>Clear all</Text>
              </TouchableOpacity>
            )}
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllAsRead}>
                <Text style={dynamicStyles.markAll}>Mark all read</Text>
              </TouchableOpacity>
            )}
            {notifications.length === 0 && unreadCount === 0 && <View style={{ width: 80 }} />}
          </View>
        </View>
      </AnimatedHeaderContainer>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : undefined}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {notifications.length === 0 ? (
            <View style={dynamicStyles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary} />
              <Text style={[dynamicStyles.emptyText, { marginTop: 12 }]}>
                No notifications yet.
              </Text>
            </View>
          ) : (
            notifications.map((n) => (
              <TouchableOpacity
                key={n.id}
                style={[dynamicStyles.row, !n.read && dynamicStyles.rowUnread]}
                onPress={() => handleNotificationPress(n)}
                activeOpacity={0.7}
              >
                <View style={dynamicStyles.iconWrap}>
                  <Ionicons
                    name={
                      n.type === 'success'
                        ? 'checkmark-circle'
                        : n.type === 'warning'
                        ? 'warning'
                        : n.type === 'error'
                        ? 'alert-circle'
                        : 'notifications'
                    }
                    size={22}
                    color={n.read ? colors.textSecondary : '#007AFF'}
                  />
                </View>
                <View style={dynamicStyles.body}>
                  <Text style={dynamicStyles.title} numberOfLines={1}>
                    {n.title}
                  </Text>
                  <Text style={dynamicStyles.message} numberOfLines={2}>
                    {n.message}
                  </Text>
                  <Text style={dynamicStyles.time}>
                    {n.created_at
                      ? new Date(n.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </Text>
                </View>
                {!n.read && (
                  <View style={styles.unreadDot}>
                    <View style={[styles.unreadDotInner, { backgroundColor: '#007AFF' }]} />
                  </View>
                )}
                {markingId === n.id && (
                  <ActivityIndicator size="small" color="#007AFF" style={{ marginLeft: 8 }} />
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
      </TapToToggleHeaderView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  emptyContainer: { flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  unreadDot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
