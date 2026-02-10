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
import { getNotificationScreen } from './services/pushNotifications';
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
    inviter_name?: string;
    role?: string;
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
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionTaken, setActionTaken] = useState<Record<number, 'accepted' | 'rejected'>>({});

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
      if (n.metadata?.has_actions) return;
      if (!n.read) markAsRead(n.id);
      const path =
        n.metadata?.navigation_path
          ? (n.metadata.navigation_path as string).startsWith('/')
            ? (n.metadata.navigation_path as string)
            : `/${n.metadata.navigation_path}`
          : getNotificationScreen({ type: n.type, ...(n.metadata || {}) });
      if (path !== '/notifications') {
        try {
          router.push(path as any);
        } catch {
          router.push('/notifications' as any);
        }
      }
    },
    [markAsRead, router]
  );

  const handleAcceptFileInvite = useCallback(
    async (n: AppNotification) => {
      const shareId = n.metadata?.share_id;
      if (shareId == null) return;
      const key = `accept_file_invite_${n.id}`;
      setActionLoading((prev) => ({ ...prev, [key]: true }));
      try {
        await apiClient.acceptFileShare(shareId);
        try {
          await apiClient.markNotificationRead(n.id);
        } catch {
          // Best-effort: home badge will refresh on next dashboard load
        }
        setActionTaken((prev) => ({ ...prev, [n.id]: 'accepted' }));
        setNotifications((prev) =>
          prev.map((n2) => (n2.id === n.id ? { ...n2, read: true } : n2))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n2) => n2.id !== n.id));
          setActionTaken((prev) => {
            const next = { ...prev };
            delete next[n.id];
            return next;
          });
          // Open Files tab so user sees the accepted file
          router.push('/(tabs)/documents');
        }, 800);
      } catch (err: any) {
        alert(err?.message || 'Failed to accept invite');
      } finally {
        setActionLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [router]
  );

  const handleRejectFileInvite = useCallback(
    async (n: AppNotification) => {
      const shareId = n.metadata?.share_id;
      if (shareId == null) return;
      const key = `reject_file_invite_${n.id}`;
      setActionLoading((prev) => ({ ...prev, [key]: true }));
      try {
        await apiClient.rejectFileShare(shareId);
        try {
          await apiClient.markNotificationRead(n.id);
        } catch {
          // Best-effort: home badge will refresh on next dashboard load
        }
        setActionTaken((prev) => ({ ...prev, [n.id]: 'rejected' }));
        setNotifications((prev) =>
          prev.map((n2) => (n2.id === n.id ? { ...n2, read: true } : n2))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n2) => n2.id !== n.id));
          setActionTaken((prev) => {
            const next = { ...prev };
            delete next[n.id];
            return next;
          });
        }, 800);
      } catch (err: any) {
        alert(err?.message || 'Failed to reject invite');
      } finally {
        setActionLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    []
  );

  const isDraftOrFileInvite = (n: AppNotification) =>
    (n.type === 'draft_invite' || n.type === 'file_invite' || n.type === 'file_received' ||
      n.metadata?.action_type === 'draft_invite' || n.metadata?.action_type === 'file_invite' || n.metadata?.action_type === 'file_share') &&
    n.metadata?.share_id != null;

  const isWorkspaceInvitation = (n: AppNotification) =>
    (n.type === 'workspace_invite' ||
      n.metadata?.action_type === 'workspace_invitation') &&
    n.metadata?.invitation_id != null;

  const handleAcceptWorkspaceInvitation = useCallback(
    async (n: AppNotification) => {
      const invitationId = n.metadata?.invitation_id;
      if (invitationId == null) return;
      const key = `accept_workspace_${n.id}`;
      setActionLoading((prev) => ({ ...prev, [key]: true }));
      try {
        await apiClient.acceptWorkspaceInvitation(invitationId);
        try {
          await apiClient.markNotificationRead(n.id);
        } catch {
          // Best-effort: home badge will refresh on next dashboard load
        }
        setActionTaken((prev) => ({ ...prev, [n.id]: 'accepted' }));
        setNotifications((prev) =>
          prev.map((n2) => (n2.id === n.id ? { ...n2, read: true } : n2))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n2) => n2.id !== n.id));
          setActionTaken((prev) => {
            const next = { ...prev };
            delete next[n.id];
            return next;
          });
        }, 800);
      } catch (err: any) {
        alert(err?.message || 'Failed to accept workspace invitation');
      } finally {
        setActionLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    []
  );

  const handleRejectWorkspaceInvitation = useCallback(
    async (n: AppNotification) => {
      const invitationId = n.metadata?.invitation_id;
      if (invitationId == null) return;
      const key = `reject_workspace_${n.id}`;
      setActionLoading((prev) => ({ ...prev, [key]: true }));
      try {
        await apiClient.rejectWorkspaceInvitation(invitationId);
        try {
          await apiClient.markNotificationRead(n.id);
        } catch {
          // Best-effort: home badge will refresh on next dashboard load
        }
        setActionTaken((prev) => ({ ...prev, [n.id]: 'rejected' }));
        setNotifications((prev) =>
          prev.map((n2) => (n2.id === n.id ? { ...n2, read: true } : n2))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n2) => n2.id !== n.id));
          setActionTaken((prev) => {
            const next = { ...prev };
            delete next[n.id];
            return next;
          });
        }, 800);
      } catch (err: any) {
        alert(err?.message || 'Failed to reject workspace invitation');
      } finally {
        setActionLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    []
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
                  {actionTaken[n.id] ? (
                    <Text
                      style={[
                        dynamicStyles.time,
                        {
                          marginTop: 4,
                          color: actionTaken[n.id] === 'accepted' ? '#34C759' : '#FF3B30',
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {actionTaken[n.id] === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
                    </Text>
                  ) : isDraftOrFileInvite(n) ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleAcceptFileInvite(n)}
                        disabled={actionLoading[`accept_file_invite_${n.id}`]}
                        style={[styles.actionBtn, { backgroundColor: '#34C759' }]}
                      >
                        {actionLoading[`accept_file_invite_${n.id}`] ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRejectFileInvite(n)}
                        disabled={actionLoading[`reject_file_invite_${n.id}`]}
                        style={[styles.actionBtn, { backgroundColor: '#FF3B30' }]}
                      >
                        {actionLoading[`reject_file_invite_${n.id}`] ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="close" size={18} color="#fff" />
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : isWorkspaceInvitation(n) ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleAcceptWorkspaceInvitation(n)}
                        disabled={actionLoading[`accept_workspace_${n.id}`]}
                        style={[styles.actionBtn, { backgroundColor: '#34C759' }]}
                      >
                        {actionLoading[`accept_workspace_${n.id}`] ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRejectWorkspaceInvitation(n)}
                        disabled={actionLoading[`reject_workspace_${n.id}`]}
                        style={[styles.actionBtn, { backgroundColor: '#FF3B30' }]}
                      >
                        {actionLoading[`reject_workspace_${n.id}`] ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="close" size={18} color="#fff" />
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null}
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
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
