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
import { useScrollRestoresHeaderProps } from '../../contexts/HeaderVisibilityContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { resolveSignatureRoute } from '../../utils/signatureRouteResolver';
import { useAuth } from '../context/auth';
import { getNotificationScreen, parseNotificationPath } from '../services/pushNotifications';
import { AnimatedHeaderContainer } from './AnimatedHeaderContainer';

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

export type NotificationsInboxVariant = 'screen' | 'modal';

export interface NotificationsInboxContentProps {
  variant: NotificationsInboxVariant;
  /** Close button / secondary dismiss (modal only) */
  onDismiss?: () => void;
  /** Home badge / parent refresh after list changes */
  onListMutated?: () => void;
}

export function NotificationsInboxContent({
  variant,
  onDismiss,
  onListMutated,
}: NotificationsInboxContentProps) {
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
  const inboxHeaderScrollRestore = useScrollRestoresHeaderProps();

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await apiClient.getNotifications();
      if (res?.success && res?.data) {
        const list = res.data.notifications ?? [];
        const withoutChat = list.filter((n: AppNotification) => n.type !== 'chat_message');
        const count = withoutChat.filter((n: AppNotification) => !n.read).length;
        setNotifications(withoutChat);
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

  const markAsRead = useCallback(
    async (id: number) => {
      setMarkingId(id);
      try {
        await apiClient.markNotificationRead(id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        onListMutated?.();
      } finally {
        setMarkingId(null);
      }
    },
    [onListMutated]
  );

  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    try {
      await apiClient.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      onListMutated?.();
    } catch {
      // ignore
    }
  }, [unreadCount, onListMutated]);

  const clearAll = useCallback(async () => {
    if (notifications.length === 0) return;
    try {
      await apiClient.clearAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
      onListMutated?.();
    } catch {
      // ignore
    }
  }, [notifications.length, onListMutated]);

  const handleNotificationPress = useCallback(
    (n: AppNotification) => {
      if (n.metadata?.has_actions) return;
      if (!n.read) markAsRead(n.id);
      let path =
        n.metadata?.navigation_path
          ? (n.metadata.navigation_path as string).startsWith('/')
            ? (n.metadata.navigation_path as string)
            : `/${n.metadata.navigation_path}`
          : getNotificationScreen({ type: n.type, ...(n.metadata || {}) });
      if (path.startsWith('/calendar/event/')) {
        path = path.replace('/calendar/event/', '/calendar/');
      }
      if (path !== '/notifications') {
        if (variant === 'modal') onDismiss?.();
        try {
          if (path.includes('signatures') || n.type.startsWith('signature_')) {
            router.push(
              resolveSignatureRoute({
                navigation_path: path,
                envelopeId: n.metadata?.envelope_id as string | undefined,
                public_id: n.metadata?.public_id as string | undefined,
                token: n.metadata?.token as string | undefined,
                type: n.metadata?.action as string | undefined,
              }) as any,
            );
            return;
          }
          const { pathname, params } = parseNotificationPath(path);
          if (params && Object.keys(params).length > 0) {
            router.push({ pathname, params } as any);
          } else {
            router.push(pathname as any);
          }
        } catch {
          router.push('/notifications' as any);
        }
      }
    },
    [markAsRead, router, variant, onDismiss]
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
        onListMutated?.();
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n2) => n2.id !== n.id));
          setActionTaken((prev) => {
            const next = { ...prev };
            delete next[n.id];
            return next;
          });
          if (variant === 'modal') onDismiss?.();
          router.navigate('/(tabs)/documents');
        }, 800);
      } catch (err: any) {
        alert(err?.message || 'Failed to accept invite');
      } finally {
        setActionLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [router, variant, onDismiss, onListMutated]
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
          // Best-effort
        }
        setActionTaken((prev) => ({ ...prev, [n.id]: 'rejected' }));
        setNotifications((prev) =>
          prev.map((n2) => (n2.id === n.id ? { ...n2, read: true } : n2))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        onListMutated?.();
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
    [onListMutated]
  );

  const isDraftOrFileInvite = (n: AppNotification) =>
    (n.type === 'draft_invite' ||
      n.type === 'file_invite' ||
      n.type === 'file_received' ||
      n.type === 'file_share' ||
      n.metadata?.action_type === 'draft_invite' ||
      n.metadata?.action_type === 'file_invite' ||
      n.metadata?.action_type === 'file_share') &&
    n.metadata?.share_id != null;

  const isWorkspaceInvitation = (n: AppNotification) =>
    (n.type === 'workspace_invite' ||
      n.type === 'workspace_invitation' ||
      n.metadata?.action_type === 'workspace_invite' ||
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
          // Best-effort
        }
        setActionTaken((prev) => ({ ...prev, [n.id]: 'accepted' }));
        setNotifications((prev) =>
          prev.map((n2) => (n2.id === n.id ? { ...n2, read: true } : n2))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        onListMutated?.();
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
    [onListMutated]
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
          // Best-effort
        }
        setActionTaken((prev) => ({ ...prev, [n.id]: 'rejected' }));
        setNotifications((prev) =>
          prev.map((n2) => (n2.id === n.id ? { ...n2, read: true } : n2))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        onListMutated?.();
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
    [onListMutated]
  );

  const dynamicStyles = StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: variant === 'modal' ? 12 : 16,
      paddingVertical: variant === 'modal' ? 10 : 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      // Modal sheet wrapper uses `colors.card`; match it so the header is not a different plane than the rest of the popup.
      backgroundColor: variant === 'modal' ? colors.card : colors.background,
    },
    headerTitle: {
      fontSize: variant === 'modal' ? 17 : 18,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: 8,
    },
    markAll: { color: '#007AFF', fontSize: variant === 'modal' ? 14 : 16 },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: variant === 'modal' ? 36 : 48,
      paddingHorizontal: 16,
    },
    emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: variant === 'modal' ? 12 : 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: variant === 'modal' ? colors.card : colors.background,
    },
    // Full screen: unread uses elevated card. Modal: same card base, surface tint for unread so rows stay aligned with the sheet.
    rowUnread: {
      backgroundColor: variant === 'modal' ? colors.surface : colors.card,
    },
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

  const headerLeft = (
    <TouchableOpacity
      onPress={() => (variant === 'modal' ? onDismiss?.() : router.back())}
      style={{ padding: 8 }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons
        name={variant === 'modal' ? 'close' : 'arrow-back'}
        size={24}
        color={colors.text}
      />
    </TouchableOpacity>
  );

  const headerActions = (
    <View style={{ flexDirection: 'row', gap: variant === 'modal' ? 10 : 16, alignItems: 'center' }}>
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
      {notifications.length === 0 && unreadCount === 0 && <View style={{ width: variant === 'modal' ? 24 : 80 }} />}
    </View>
  );

  const headerRow = (
    <View style={dynamicStyles.header}>
      {headerLeft}
      <Text style={dynamicStyles.headerTitle} numberOfLines={1}>
        Notifications
      </Text>
      {headerActions}
    </View>
  );

  const listBody =
    loading ? (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    ) : (
      <ScrollView
        style={variant === 'modal' ? styles.listModal : styles.list}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        onScrollEndDrag={inboxHeaderScrollRestore.onScrollEndDrag}
        onMomentumScrollEnd={inboxHeaderScrollRestore.onMomentumScrollEnd}
      >
        {notifications.length === 0 ? (
          <View style={dynamicStyles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary} />
            <Text style={[dynamicStyles.emptyText, { marginTop: 12 }]}>No notifications yet.</Text>
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
    );

  if (variant === 'screen') {
    return (
      <>
        <AnimatedHeaderContainer>{headerRow}</AnimatedHeaderContainer>
        {listBody}
      </>
    );
  }

  return <View style={styles.modalRoot}>{headerRow}{listBody}</View>;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  list: { flex: 1 },
  listModal: { flexGrow: 1, flexShrink: 1, minHeight: 200 },
  emptyContainer: { flexGrow: 1, minHeight: 200 },
  centered: {
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
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
