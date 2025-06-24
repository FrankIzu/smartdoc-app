import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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
  configure() {
    if (this.initialized) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    this.initialized = true;
  }

  // Register for push notifications
  async registerForPushNotifications(): Promise<string | null> {
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
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          categoryIdentifier: notification.categoryId,
          priority: this.getPriorityValue(notification.priority),
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
  addNotificationReceivedListener(handler: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(handler);
  }

  // Handle notification tapped by user
  addNotificationResponseReceivedListener(
    handler: (response: Notifications.NotificationResponse) => void
  ) {
    return Notifications.addNotificationResponseReceivedListener(handler);
  }

  // Get badge count
  async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  // Set badge count
  async setBadgeCount(count: number) {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  // Clear all notifications
  async clearAllNotifications() {
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  // Cancel scheduled notification
  async cancelNotification(notificationId: string) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  // Get permission status
  async getPermissionStatus() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status;
    } catch (error) {
      console.error('Error getting permission status:', error);
      return 'undetermined';
    }
  }

  // Helper methods
  private getPriorityValue(priority?: string): Notifications.AndroidNotificationPriority {
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
  pushNotificationService.configure();
  return await pushNotificationService.registerForPushNotifications();
}

// Helper function to handle navigation from notifications
export function handleNotificationNavigation(
  data: Record<string, any>,
  navigation: any
) {
  const { type } = data;

  switch (type) {
    case 'file_upload':
    case 'file_processing':
      navigation.navigate('(tabs)', { screen: 'documents' });
      break;
    
    case 'form_response':
      navigation.navigate('(tabs)', { screen: 'forms' });
      break;
    
    case 'chat_message':
      navigation.navigate('(tabs)', { screen: 'chats' });
      break;
    
    case 'workspace_invite':
    case 'workspace_update':
      navigation.navigate('(tabs)', { screen: 'workspaces' });
      break;
    
    case 'upload_link_expiring':
      // Navigate to upload links management
      navigation.navigate('(tabs)', { screen: 'settings' });
      break;
    
    default:
      navigation.navigate('(tabs)', { screen: 'index' });
      break;
  }
}

export default pushNotificationService; 