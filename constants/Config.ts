// API Configuration
export const API_BASE_URL = 'http://192.168.1.4:5000'; // Updated to use correct IP address
export const ENVIRONMENT = process.env.EXPO_PUBLIC_ENVIRONMENT || 'development';

// OAuth Configuration - Platform-specific client IDs
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '';
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';

// Select the appropriate client ID based on platform and environment
export const GOOGLE_CLIENT_ID = (() => {
  // For Expo Go development, always use web client ID
  if (__DEV__) {
    return GOOGLE_CLIENT_ID_WEB;
  }
  
  // For production builds, use platform-specific client IDs
  if (process.env.EXPO_OS === 'android') {
    return GOOGLE_CLIENT_ID_ANDROID;
  } else if (process.env.EXPO_OS === 'ios') {
    return GOOGLE_CLIENT_ID_IOS;
  }
  
  // Fallback to web client ID
  return GOOGLE_CLIENT_ID_WEB;
})();
export const DROPBOX_CLIENT_ID = process.env.EXPO_PUBLIC_DROPBOX_APP_KEY || ''; // Dropbox App Key (same as Client ID)

// Expo Development Server URL
export const EXPO_DEV_URL = 'http://192.168.62.18:8081';

// App Configuration
export const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || 'GrabDocs Mobile';
export const APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION || '1.0.0';

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  LOGIN: '/api/login',
  LOGOUT: '/api/logout',
  SIGNUP: '/api/signup',
  AUTH_CHECK: '/api/auth-check',
  FORGOT_PASSWORD: '/api/forgot-password',
  RESET_PASSWORD: '/api/reset-password',
  
  // User
  USER: '/api/user',
  USER_UPDATE: '/api/user/update',
  USER_THEME: '/api/user/theme',
  
  // Files
  FILES: '/api/files',
  UPLOAD: '/api/upload',
  FILES_BY_ID: (id: number) => `/api/files/${id}`,
  DOWNLOAD_FILE: (id: number) => `/api/files/${id}/download`,
  VIEW_FILE: (id: number) => `/api/files/${id}/view`,
  CATEGORIZE_FILE: (id: number) => `/api/files/${id}/categorize`,
  AUTO_CATEGORIZE: (id: number) => `/api/files/${id}/auto-categorize`,
  BATCH_AUTO_CATEGORIZE: '/api/files/batch-auto-categorize',
  EDIT_FILE: (id: number) => `/api/files/${id}/edit`,
  
  // Chat
  SMART_CHAT: '/api/chat/smart',
  SMART_CHAT_STREAM: '/api/chat/smart/stream',
  CHAT_HISTORY: '/api/chat/history',
  CHAT_CONVERSATION: (id: number) => `/api/chat/history/${id}`,
  NEW_CHAT: '/api/chat/new',
  UPDATE_CHAT: (id: number) => `/api/chat/history/${id}`,
  DELETE_CHAT: (id: number) => `/api/chat/history/${id}`,
  
  // Forms
  FORMS: '/api/forms',
  FORMS_BY_ID: (id: number) => `/api/forms/${id}`,
  PUBLIC_FORM: (shareUrl: string) => `/api/forms/${shareUrl}/public`,
  SUBMIT_FORM: (shareUrl: string) => `/api/forms/${shareUrl}/submit`,
  FORM_RESPONSES: (id: number) => `/api/forms/${id}/responses`,
  DUPLICATE_FORM: (id: number) => `/api/forms/${id}/duplicate`,
  
  // Document Templates
  DOCUMENT_TEMPLATES: '/api/document-templates',
  UPLOAD_TEMPLATE: '/api/document-templates/upload',
  DELETE_TEMPLATE: (id: number) => `/api/document-templates/${id}`,
  DEACTIVATE_TEMPLATE: (id: number) => `/api/document-templates/${id}/deactivate`,
  CREATE_DOCUMENT: '/api/create-document',
  COMPLETED_DOCUMENTS: '/api/completed-documents',
  DOWNLOAD_COMPLETED_DOC: (id: number) => `/api/completed-documents/${id}/download`,
  
  // Analytics
  DASHBOARD_ANALYTICS: '/api/dashboard/analytics',
  ANALYTICS: '/api/analysis',
  ACTIVITY_ANALYTICS: '/api/analysis/activity',
  USER_ANALYTICS: '/api/analysis/users',
  RECEIPT_ANALYTICS: '/api/analysis/receipts',
  
  // Admin
  ALL_USERS: '/api/admin/users',
  UPDATE_USER_STATUS: (id: number) => `/api/admin/users/${id}/status`,
  DELETE_USER: (id: number) => `/api/admin/users/${id}`,
  UPDATE_USER_ADMIN: (id: number) => `/api/admin/users/${id}/admin`,
  
  // Upload Links
  UPLOAD_LINKS: '/api/upload-links',
  UPLOAD_LINK_BY_ID: (id: number) => `/api/upload-links/${id}`,
  REGENERATE_UPLOAD_LINK: (id: number) => `/api/upload-links/${id}/regenerate`,
  FILES_UPLOADED_VIA_LINKS: '/api/files/uploaded-via-links',
  PUBLIC_UPLOAD_INFO: (token: string) => `/api/upload-to/${token}`,
  PUBLIC_UPLOAD: (token: string) => `/api/upload-to/${token}`,
  
  // Notifications
  NOTIFICATIONS: '/api/notifications',
  MARK_NOTIFICATION_READ: (id: number) => `/api/notifications/${id}/read`,
  MARK_ALL_NOTIFICATIONS_READ: '/api/notifications/mark-all-read',
  
  // Workspaces
  WORKSPACES: '/api/workspaces',
  
  // Feedback
  FEEDBACK: '/api/feedback',
  
  // Health
  HEALTH: '/health',
  
  // Mobile OAuth
  MOBILE_GOOGLE_AUTH: '/api/v1/mobile/external-auth/googledrive',
  MOBILE_DROPBOX_AUTH: '/api/v1/mobile/external-auth/dropbox',
  MOBILE_DROPBOX_EXCHANGE: '/api/v1/mobile/external-auth/dropbox/exchange',
  MOBILE_GOOGLE_EXCHANGE: '/api/v1/mobile/external-auth/googledrive/exchange',
  
  // External Files
  EXTERNAL_DROPBOX_FILES: '/api/v1/mobile/external-files/dropbox',
  EXTERNAL_GOOGLE_FILES: '/api/v1/mobile/external-files/googledrive',
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  THEME: 'theme',
  SETTINGS: 'settings',
  OFFLINE_QUEUE: 'offline_queue',
} as const;

// File Upload Settings
export const FILE_UPLOAD = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ],
  ALLOWED_EXTENSIONS: [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', 
    '.ppt', '.pptx', '.txt', '.csv', 
    '.jpg', '.jpeg', '.png', '.gif', '.webp'
  ],
} as const;

// Theme Colors
export const COLORS = {
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primaryLight: '#dbeafe',
  secondary: '#64748b',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#0ea5e9',
  background: '#ffffff',
  backgroundDark: '#1f2937',
  surface: '#f8fafc',
  surfaceDark: '#374151',
  card: '#f8fafc',
  text: '#1f2937',
  textDark: '#f9fafb',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  borderDark: '#4b5563',
  white: '#ffffff',
  black: '#000000',
} as const;

// Layout Constants
export const LAYOUT = {
  HEADER_HEIGHT: 60,
  TAB_BAR_HEIGHT: 80,
  BORDER_RADIUS: 8,
  SPACING: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
} as const;

// Spacing Constants (separate export for convenience)
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

// Typography Constants
export const TYPOGRAPHY = {
  h1: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  h4: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
    fontWeight: 'normal' as const,
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: 'normal' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: 'normal' as const,
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 20,
  },
} as const;

// Animation Durations
export const ANIMATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const; 