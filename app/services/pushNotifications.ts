import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Lazy-load expo-notifications so we never import it in Expo Go (SDK 53+ removed push from Expo Go).
// Importing it at top level triggers "expo-notifications was removed from Expo Go" error.
let NotificationsModule: typeof import('expo-notifications') | null = null;
async function getNotifications(): Promise<typeof import('expo-notifications') | null> {
  if (Constants.appOwnership === 'expo') return null; // Expo Go: push not supported
  if (!NotificationsModule) {
    NotificationsModule = await import('expo-notifications');
  }
  return NotificationsModule;
}

export interface PushNotificationData {
  title: string;
  body: string;
  data?: Record<string, any>;
  categoryId?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface NotificationChannel {
  id: string;
  name: string;
  description: string;
  importance: number;
  sound?: string;
  vibrationPattern?: number[];
}

class PushNotificationService {
  private pushToken: string | null = null;
  private initialized = false;

  // Configure notification behavior
  async configure() {
    if (this.initialized) return;
    const Notifications = await getNotifications();
    if (!Notifications) return;
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const isChatMessage = data?.type === 'chat_message';
        return {
          shouldShowAlert: !isChatMessage,
          shouldPlaySound: !isChatMessage,
          shouldSetBadge: !isChatMessage,
        };
      },
    });
    this.initialized = true;
  }

  // Register for push notifications
  async registerForPushNotifications(): Promise<string | null> {
    const Notifications = await getNotifications();
    if (!Notifications) return null;
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      this.pushToken = token.data;
      console.log('Push token:', this.pushToken);

      if (Platform.OS === 'android') {
        await this.createNotificationChannels();
      }

      return this.pushToken;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  // Create notification channels for Android
  private async createNotificationChannels() {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    const channels: NotificationChannel[] = [
      {
        id: 'default',
        name: 'Default',
        description: 'Default notifications',
        importance: Notifications.AndroidImportance.HIGH,
      },
      {
        id: 'file_upload',
        name: 'File Uploads',
        description: 'Notifications about file upload status',
        importance: Notifications.AndroidImportance.HIGH,
      },
      {
        id: 'file_processing',
        name: 'File Processing',
        description: 'Notifications about file processing status',
        importance: Notifications.AndroidImportance.DEFAULT,
      },
      {
        id: 'form_responses',
        name: 'Form Responses',
        description: 'Notifications about new form responses',
        importance: Notifications.AndroidImportance.HIGH,
      },
      {
        id: 'team_chat',
        name: 'Team Chat',
        description: 'Notifications from team chat messages',
        importance: Notifications.AndroidImportance.HIGH,
      },
      {
        id: 'workspace_updates',
        name: 'Workspace Updates',
        description: 'Notifications about workspace changes',
        importance: Notifications.AndroidImportance.DEFAULT,
      },
      // Backend notification types (all 8)
      { id: 'file_request', name: 'File requests', description: 'Upload link requests', importance: Notifications.AndroidImportance.HIGH },
      { id: 'file_received', name: 'File received', description: 'Someone shared a file with you', importance: Notifications.AndroidImportance.HIGH },
      { id: 'draft_edited', name: 'Note edited', description: 'Collaborator started editing a note', importance: Notifications.AndroidImportance.HIGH },
      { id: 'calendar_invite', name: 'Calendar invite', description: 'Calendar event invitations', importance: Notifications.AndroidImportance.HIGH },
      { id: 'file_share_viewed', name: 'File share viewed', description: 'Someone viewed your shared file', importance: Notifications.AndroidImportance.DEFAULT },
      { id: 'join_request', name: 'Join request', description: 'Meeting join requests', importance: Notifications.AndroidImportance.HIGH },
      { id: 'transcript_ready', name: 'Transcript ready', description: 'Meeting transcript is ready', importance: Notifications.AndroidImportance.DEFAULT },
    ];

    for (const channel of channels) {
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        description: channel.description,
        importance: channel.importance,
        sound: channel.sound,
        vibrationPattern: channel.vibrationPattern,
      });
    }
  }

  // Schedule a local notification
  async scheduleLocalNotification(notification: PushNotificationData, delay: number = 0) {
    const Notifications = await getNotifications();
    if (!Notifications) return null;
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          categoryIdentifier: notification.categoryId,
          priority: await this.getPriorityValue(notification.priority),
        },
        trigger: delay > 0 ? { seconds: delay } : null,
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling local notification:', error);
      return null;
    }
  }

  // Send push notification via backend
  async sendPushNotification(
    userIds: string[],
    notification: PushNotificationData,
    scheduleFor?: Date
  ) {
    try {
      // This would typically call your backend API
      // which would then send the push notification via Expo's push service
      const response = await fetch('/api/v1/mobile/push-notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_ids: userIds,
          title: notification.title,
          body: notification.body,
          data: notification.data,
          channel_id: notification.categoryId || 'default',
          priority: notification.priority || 'normal',
          schedule_for: scheduleFor?.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error sending push notification:', error);
      throw error;
    }
  }

  // Handle notification received while app is in foreground
  async addNotificationReceivedListener(handler: (notification: import('expo-notifications').Notification) => void) {
    const Notifications = await getNotifications();
    if (!Notifications) return { remove: () => {} };
    return Notifications.addNotificationReceivedListener(handler);
  }

  // Handle notification tapped by user
  async addNotificationResponseReceivedListener(
    handler: (response: import('expo-notifications').NotificationResponse) => void
  ) {
    const Notifications = await getNotifications();
    if (!Notifications) return { remove: () => {} };
    return Notifications.addNotificationResponseReceivedListener(handler);
  }

  // Get badge count
  async getBadgeCount(): Promise<number> {
    const Notifications = await getNotifications();
    if (!Notifications) return 0;
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  // Set badge count
  async setBadgeCount(count: number) {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  // Clear all notifications
  async clearAllNotifications() {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  // Cancel scheduled notification
  async cancelNotification(notificationId: string) {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  // Get permission status
  async getPermissionStatus() {
    const Notifications = await getNotifications();
    if (!Notifications) return 'undetermined';
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status;
    } catch (error) {
      console.error('Error getting permission status:', error);
      return 'undetermined';
    }
  }

  // Helper methods
  private async getPriorityValue(priority?: string): Promise<import('expo-notifications').AndroidNotificationPriority> {
    const Notifications = await getNotifications();
    if (!Notifications) return 0 as import('expo-notifications').AndroidNotificationPriority;
    switch (priority) {
      case 'low':
        return Notifications.AndroidNotificationPriority.LOW;
      case 'high':
        return Notifications.AndroidNotificationPriority.HIGH;
      default:
        return Notifications.AndroidNotificationPriority.DEFAULT;
    }
  }

  getPushToken(): string | null {
    return this.pushToken;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Notification templates for different types
export const NotificationTemplates = {
  fileUploaded: (fileName: string): PushNotificationData => ({
    title: 'File Uploaded',
    body: `${fileName} has been uploaded successfully`,
    categoryId: 'file_upload',
    priority: 'normal',
    data: { type: 'file_upload', fileName },
  }),

  fileProcessed: (fileName: string): PushNotificationData => ({
    title: 'File Processed',
    body: `${fileName} has been processed and is ready to view`,
    categoryId: 'file_processing',
    priority: 'normal',
    data: { type: 'file_processing', fileName },
  }),

  formResponse: (formName: string): PushNotificationData => ({
    title: 'New Form Response',
    body: `You received a new response for ${formName}`,
    categoryId: 'form_responses',
    priority: 'high',
    data: { type: 'form_response', formName },
  }),

  chatMessage: (senderName: string, message: string): PushNotificationData => ({
    title: `Message from ${senderName}`,
    body: message.length > 50 ? `${message.substring(0, 50)}...` : message,
    categoryId: 'team_chat',
    priority: 'high',
    data: { type: 'chat_message', senderName },
  }),

  workspaceInvite: (workspaceName: string, inviterName: string): PushNotificationData => ({
    title: 'Workspace Invitation',
    body: `${inviterName} invited you to join ${workspaceName}`,
    categoryId: 'workspace_updates',
    priority: 'high',
    data: { type: 'workspace_invite', workspaceName, inviterName },
  }),

  workspaceUpdate: (workspaceName: string, updateType: string): PushNotificationData => ({
    title: 'Workspace Update',
    body: `${workspaceName} has been ${updateType}`,
    categoryId: 'workspace_updates',
    priority: 'normal',
    data: { type: 'workspace_update', workspaceName, updateType },
  }),

  uploadLinkExpiring: (linkName: string, hoursLeft: number): PushNotificationData => ({
    title: 'Upload Link Expiring',
    body: `${linkName} will expire in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`,
    categoryId: 'default',
    priority: 'normal',
    data: { type: 'upload_link_expiring', linkName, hoursLeft },
  }),

  storageLimit: (percentUsed: number): PushNotificationData => ({
    title: 'Storage Limit Warning',
    body: `You've used ${percentUsed}% of your storage quota`,
    categoryId: 'default',
    priority: 'normal',
    data: { type: 'storage_limit', percentUsed },
  }),
};

// Export singleton instance
export const pushNotificationService = new PushNotificationService();

// Helper function to initialize push notifications
export async function initializePushNotifications(): Promise<string | null> {
  await pushNotificationService.configure();
  return await pushNotificationService.registerForPushNotifications();
}

/** All 8 backend notification types that can trigger push + in-app notifications */
export const NOTIFICATION_TYPES = [
  'file_request',
  'chat_message',
  'file_received',
  'draft_edited',
  'calendar_invite',
  'file_share_viewed',
  'join_request',
  'transcript_ready',
] as const;

/**
 * Resolve app path for push/data payload (type + optional metadata).
 * Used when user taps a push or an in-app notification so we open the right screen.
 */
export function getNotificationScreen(data: Record<string, any>): string {
  const type = data?.type;
  const screen = data?.screen;
  if (screen && typeof screen === 'string' && screen.startsWith('/')) return screen;
  if (screen && typeof screen === 'string') return screen.startsWith('/') ? screen : `/${screen}`;

  switch (type) {
    case 'file_request':
      return '/upload-links';
    case 'chat_message':
      return data?.chat_id != null ? `/user-chat?chatId=${data.chat_id}` : '/(tabs)/chats';
    case 'file_received':
      return '/(tabs)/documents';
    case 'draft_edited':
      return data?.file_id != null ? `/drafts/edit/${data.file_id}` : '/(tabs)/documents';
    case 'calendar_invite': {
      const eid = data?.event_id ?? data?.calendar_event_id ?? data?.eventId;
      return eid != null ? `/calendar/${eid}` : '/calendar';
    }
    case 'file_share_viewed':
      return '/(tabs)/documents';
    case 'join_request':
      return data?.video_call_id != null ? `/quick-reach/meeting-call?roomId=${data.video_call_id}` : '/quick-reach/meeting-call';
    case 'join_request_approved':
      return data?.meeting_id != null ? `/join-meeting?meeting_id=${encodeURIComponent(String(data.meeting_id))}` : '/(tabs)';
    case 'transcript_ready':
      return data?.video_call_id != null ? `/quick-reach/meeting-details?roomId=${data.video_call_id}` : '/quick-reach/meeting-call';
    case 'file_upload':
    case 'file_processing':
      return '/(tabs)/documents';
    case 'form_response':
      return '/(tabs)/documents';
    case 'workspace_invite':
      // Navigate to notifications so user can Accept/Reject workspace invitation inline
      return '/notifications';
    case 'workspace_update':
      return '/workspaces';
    case 'draft_invite':
    case 'file_invite':
      // Navigate to notifications so user can Accept/Reject inline
      return '/notifications';
    case 'upload_link_expiring':
      return '/upload-links';
    case 'signature_request':
    case 'signature_invite':
    case 'signature_reminder':
    case 'signature_completed':
      if (data?.token) {
        return `/signatures/sign/token/${encodeURIComponent(String(data.token))}`;
      }
      if (data?.navigation_path && String(data.navigation_path).includes('signatures')) {
        return String(data.navigation_path).startsWith('/')
          ? String(data.navigation_path)
          : `/${data.navigation_path}`;
      }
      if (data?.envelope_id ?? data?.public_id) {
        const id = data.public_id ?? data.envelope_id;
        return data?.action === 'sign' ? `/signatures/sign/${id}` : `/signatures/${id}`;
      }
      return '/signatures';
    case 'meeting_minimized':
      // Tap "In meeting" notification -> open meeting screen
      if (data?.meetingId) {
        const params = new URLSearchParams({ meetingId: String(data.meetingId) });
        if (data?.title) params.set('title', String(data.title));
        if (data?.userName) params.set('userName', String(data.userName));
        return `/quick-reach/hms-meeting-interface?${params.toString()}`;
      }
      return '/quick-reach/hms-meeting-interface';
    default:
      return '/notifications';
  }
}

/**
 * Parse a path string (optionally with ?key=value) into pathname + params for Expo Router.
 * Expo Router expects router.push({ pathname, params }) for params; string with ? can fail and show error page.
 */
export function parseNotificationPath(path: string): { pathname: string; params?: Record<string, string> } {
  const i = path.indexOf('?');
  if (i < 0) return { pathname: path };
  const pathname = path.slice(0, i).trim() || path;
  const search = path.slice(i + 1).trim();
  if (!search) return { pathname };
  const params: Record<string, string> = {};
  for (const part of search.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    try {
      const key = decodeURIComponent(part.slice(0, eq).trim());
      const value = decodeURIComponent(part.slice(eq + 1));
      if (key) params[key] = value;
    } catch {
      // skip malformed segment
    }
  }
  return Object.keys(params).length ? { pathname, params } : { pathname };
}

// Helper function to handle navigation from notifications (for navigator-based usage)
export function handleNotificationNavigation(
  data: Record<string, any>,
  navigation: any
) {
  const path = getNotificationScreen(data);
  if (path === '/notifications') {
    navigation.navigate('(tabs)', { screen: 'index' });
    return;
  }
  if (path.startsWith('/(tabs)/')) {
    const screen = path.replace('/(tabs)/', '');
    navigation.navigate('(tabs)', { screen });
    return;
  }
  navigation.navigate(path as any);
}

export default pushNotificationService; 