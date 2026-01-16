import axios, { AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import EventSource from 'react-native-sse';
import { API_BASE_URL, API_ENDPOINTS, STORAGE_KEYS } from '../constants/Config';
import { secureStorage } from '../utils/storage';

// API response structure matching backend
interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  user?: any;
  response?: string;
  chat_id?: string;
  citations?: Array<{
    source_type: string;
    source_name: string;
    excerpt?: string;
    confidence?: number;
  }>;
  files?: any[];
  forms?: any[];
  requires_confirmation?: boolean;
  asset_count?: number;
  asset_details?: string[];
  warning?: string;
}

interface AuthResponse {
  success: boolean;
  message: string;
  user?: any;
  token?: string;
  session_info?: {
    user_id: number;
    session_id?: string;
    cookie_config?: any;
  };
}

// Mobile API endpoints with v1/mobile prefix
const MOBILE_ENDPOINTS = {
  // Authentication
  AUTH_CHECK: '/api/v1/mobile/auth-check',
  LOGIN: '/api/v1/mobile/login',
  LOGOUT: '/api/v1/mobile/logout',
  SIGNUP: '/api/v1/mobile/signup',
  FORGOT_PASSWORD: '/api/v1/mobile/forgot-password',
  
  // 2FA Authentication
  REQUEST_OTP: '/api/v1/mobile/auth/request-otp',
  VERIFY_OTP: '/api/v1/mobile/auth/verify-otp',
  LOGIN_WITH_PHONE: '/api/v1/mobile/auth/login-with-phone',
  CHECK_PHONE: '/api/v1/mobile/auth/check-phone',
  
  // User
  USER: '/api/v1/mobile/user',
  
  // Files (all operations go through backend encryption)
  FILES: '/api/v1/mobile/files',
  UPLOAD: '/api/v1/mobile/upload', // Backend encrypts on save
  FILE_BY_ID: (id: number) => `/api/v1/mobile/get-file/${id}`,
  FILE_DOWNLOAD: (id: number) => `/api/v1/mobile/file/${id}/download`, // Backend decrypts on download
  FILE_VIEW: (id: number) => `/api/v1/mobile/file/${id}/view`, // Backend decrypts for viewing
  FILE_DELETE: (id: number) => `/api/v1/mobile/file/${id}`,
  
  // Chat
  CHAT_HISTORY: '/api/v1/mobile/chat/history',
  CHAT_SEND: '/api/v1/mobile/chat/send',
  CHAT_SMART_STREAM: '/api/v1/mobile/chat/smart/stream',
  
  // Forms
  FORMS: '/api/v1/mobile/forms',
  FORM_BY_ID: (id: number) => `/api/v1/mobile/forms/${id}`,
  FORM_RESPONSES: (id: number) => `/api/v1/mobile/forms/${id}/responses`,
  
  // Analysis
  DASHBOARD: '/api/v1/mobile/analysis/dashboard',
  ANALYTICS: '/api/v1/mobile/analysis/analytics',
  ACTIVITY: '/api/v1/mobile/analysis/activity',
  COMPREHENSIVE: '/api/v1/mobile/analysis/comprehensive',
  
  // Documents
  DOCUMENTS: '/api/v1/mobile/documents',
  DOCUMENT_BY_ID: (id: number) => `/api/v1/mobile/document/${id}`,
  
  // Templates
  TEMPLATES: '/api/v1/mobile/templates',
  FORM_TEMPLATES: '/api/v1/mobile/form-templates',
  
  // Chat system (AI Chat)
  CHATS: '/api/v1/mobile/chats',
  CHAT_MESSAGES: (chatId: number) => `/api/v1/mobile/chat/messages/${chatId}`,
  CHAT_SEND_MESSAGE: '/api/v1/mobile/chat/send',
  
  // User Chat (Mobile-specific - separate from web user chat)
  USER_CHATS: '/api/v1/mobile/user-chat/chats',
  USER_CHAT_MESSAGES: (chatId: number) => `/api/v1/mobile/user-chat/chats/${chatId}/messages`,
  USER_CHAT_SEND: (chatId: number) => `/api/v1/mobile/user-chat/chats/${chatId}/send`,
  USER_CHAT_START: '/api/v1/mobile/user-chat/start-chat',
  USER_CHAT_SEARCH_USERS: '/api/v1/mobile/user-chat/search-users',
  
  // Bookmarks
  BOOKMARKS: '/api/v1/mobile/bookmarks',
  
  // Workspaces
  WORKSPACES: '/api/v1/mobile/workspaces',
  WORKSPACE_BY_ID: (id: number) => `/api/v1/mobile/workspaces/${id}`,
  WORKSPACE_MEMBERS: (id: number) => `/api/v1/mobile/workspaces/${id}/members`,
  WORKSPACE_MEMBER_BY_ID: (workspaceId: number, memberId: number) => `/api/v1/mobile/workspaces/${workspaceId}/members/${memberId}`,
  WORKSPACE_MEMBER_ROLE: (workspaceId: number, memberId: number) => `/api/v1/mobile/workspaces/${workspaceId}/members/${memberId}/role`,
  WORKSPACE_INVITATION_RESEND: (workspaceId: number, invitationId: number) => `/api/v1/mobile/workspaces/${workspaceId}/invitations/${invitationId}/resend`,
  WORKSPACE_INVITATION_BY_ID: (workspaceId: number, invitationId: number) => `/api/v1/mobile/workspaces/${workspaceId}/invitations/${invitationId}`,
  WORKSPACE_USERS: '/api/v1/mobile/workspace-users',
  
  // Upload Links
  UPLOAD_LINKS: '/api/v1/mobile/upload-links',
  UPLOAD_LINK_BY_ID: (id: number) => `/api/v1/mobile/upload-links/${id}`,
  UPLOAD_LINK_SHARE: (id: number) => `/api/v1/mobile/upload-links/${id}/share`,
  UPLOAD_LINK_FILES: (id: number) => `/api/v1/mobile/upload-links/${id}/files`,
  
  // Meeting Assets & Webhooks (using existing web endpoints)
  MEETING_ASSETS: '/api/v1/mobile/meeting-assets',
  MEETINGS: '/api/v1/mobile/meetings',
  MEETING_CREATE: '/api/v1/mobile/meetings/create',
  MEETING_JOIN: '/api/v1/mobile/meetings/join',
  MEETING_SCHEDULE: '/api/v1/mobile/meetings/schedule',
  MEETING_TRANSCRIPT: (meetingId: string) => `/api/v1/mobile/meetings/${meetingId}/transcript`,
  MEETING_SUMMARY: (meetingId: string) => `/api/v1/mobile/meetings/${meetingId}/summary`,
  MEETING_CHAT: (meetingId: string) => `/api/v1/mobile/meetings/${meetingId}/chat`,
  MEETING_REPORT: (meetingId: string) => `/api/v1/mobile/meetings/${meetingId}/report`,
  MEETING_DOWNLOAD: (meetingId: string, assetType: string) => `/api/v1/mobile/meetings/${meetingId}/download/${assetType}`,
  MEETING_DELETE_ASSETS: (meetingId: string) => `/api/v1/video/room/${meetingId}/delete-assets`,
  
  // Error Logging
  ERROR_LOG: '/api/v1/mobile/error-log',
  ERROR_LOGS: '/api/v1/mobile/error-logs', // GET endpoint to view error logs
  
  // Configuration
  // CONFIG: '/api/v1/mobile/config', // Not available on backend
} as const;

// Main API Service Class
class ApiService {
  public client: AxiosInstance;

  constructor() {
    // Determine the actual platform for the X-Platform header
    // For Expo Go (local testing), use 'android' to bypass iOS HTTPS requirements
    // For standalone apps, use the actual platform
    const isExpoGo = Constants.appOwnership === 'expo';
    const platformHeader = isExpoGo ? 'android' : // Use android in Expo Go to avoid HTTPS issues
                          Platform.OS === 'ios' ? 'ios' : 
                          Platform.OS === 'android' ? 'android' : 
                          'mobile'; // fallback for web or other platforms
    
    // CRITICAL: Ensure baseURL is always HTTPS for production
    // iOS requires HTTPS and backend enforces it
    let validatedBaseURL = API_BASE_URL;
    if (validatedBaseURL.includes('api.grabdocs.com') && !validatedBaseURL.startsWith('https://')) {
      console.error('🚨 CRITICAL: API_BASE_URL is not HTTPS! Forcing HTTPS:', validatedBaseURL);
      validatedBaseURL = validatedBaseURL.replace(/^http:\/\//, 'https://');
    }
    
    console.log('🔧 API Service Platform Config:', {
      platformOS: Platform.OS,
      isExpoGo,
      appOwnership: Constants.appOwnership,
      platformHeader,
      baseURL: validatedBaseURL,
      originalBaseURL: API_BASE_URL,
      isHTTPS: validatedBaseURL.startsWith('https://'),
    });
    
    // CRITICAL: Add X-Forwarded-Proto header for production HTTPS requests
    // This helps backend detect original HTTPS even if proxy forwards as HTTP
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Platform': platformHeader, // Send platform optimized for environment
    };
    
    // Always set X-Forwarded-Proto for production API to help backend detect HTTPS
    if (validatedBaseURL.startsWith('https://')) {
      defaultHeaders['X-Forwarded-Proto'] = 'https';
      defaultHeaders['X-Forwarded-Scheme'] = 'https';
    }
    
    this.client = axios.create({
      baseURL: validatedBaseURL,
      timeout: 30000,
      headers: defaultHeaders,
      withCredentials: true,
      // Enable cookie handling for session-based auth
      xsrfCookieName: 'XSRF-TOKEN',
      xsrfHeaderName: 'X-XSRF-TOKEN',
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      async (config) => {
        // CRITICAL: Ensure HTTPS is always used for production API
        // iOS requires HTTPS and backend enforces it
        if (config.url && config.baseURL) {
          const fullUrl = config.baseURL + config.url;
          if (fullUrl.includes('api.grabdocs.com') && !fullUrl.startsWith('https://')) {
            console.error('🚨 CRITICAL: HTTP detected for production API! Forcing HTTPS:', fullUrl);
            // Force HTTPS for production URLs
            if (config.baseURL.startsWith('http://')) {
              config.baseURL = config.baseURL.replace(/^http:\/\//, 'https://');
            }
            const correctedUrl = config.baseURL + config.url;
            console.log('✅ Corrected URL to HTTPS:', correctedUrl);
          }
        }
        
        try {
          const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log('🔐 Adding auth token to request:', token.substring(0, 20) + '...');
          } else {
            console.log('🔐 No auth token found in storage');
          }
          
          // Include device token for trusted device verification (especially for login requests)
          const deviceToken = await secureStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
          if (deviceToken) {
            config.headers['X-Device-Token'] = deviceToken;
            console.log('🔐 Adding device token to request');
          }
        } catch (error) {
          console.warn('Failed to get auth token:', error);
        }
        
        // CRITICAL: Ensure X-Forwarded-Proto header is set for production HTTPS requests
        // This is essential when proxy/load balancer forwards HTTP but original was HTTPS
        if (config.baseURL && config.baseURL.startsWith('https://')) {
          config.headers['X-Forwarded-Proto'] = 'https';
          config.headers['X-Forwarded-Scheme'] = 'https';
        }
        
        // Log request details for debugging - show full URL
        const fullRequestUrl = (config.baseURL || '') + (config.url || '');
        console.log('🌐 API Request:', {
          method: config.method?.toUpperCase(),
          url: fullRequestUrl,
          baseURL: config.baseURL,
          endpoint: config.url,
          isHTTPS: fullRequestUrl.startsWith('https://'),
          hasForwardedProto: !!config.headers['X-Forwarded-Proto'],
          forwardedProto: config.headers['X-Forwarded-Proto'],
        });
        
        // Log request details for debugging
        // console.log('📡 API Request:', {
        //   url: config.url,
        //   method: config.method,
        //   headers: {
        //     ...config.headers,
        //     Authorization: config.headers.Authorization ? 'Bearer [REDACTED]' : 'None'
        //   }
        // });
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        // console.log('📡 API Response:', {
        //   url: response.config.url,
        //   status: response.status,
        //   statusText: response.statusText
        // });
        return response;
      },
      async (error) => {
        // console.error('📡 API Error:', {
        //   url: error.config?.url,
        //   status: error.response?.status,
        //   statusText: error.response?.statusText,
        //   data: error.response?.data,
        //   message: error.message
        // });
        
        if (error.response?.status === 401) {
          console.log('🔐 Clearing auth data due to 401 error');
          await this.clearAuthData();
        }
        return Promise.reject(error);
      }
    );
  }

  private async clearAuthData() {
    try {
      await secureStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      await secureStorage.removeItem(STORAGE_KEYS.USER_DATA);
      await secureStorage.removeItem(STORAGE_KEYS.DEVICE_TOKEN); // Clear device token on logout
    } catch (error) {
      console.warn('Failed to clear auth data:', error);
    }
  }

  // ==================== MOBILE AUTHENTICATION ====================

  async login(credentials: { username: string; password: string }): Promise<AuthResponse> {
    try {
              console.log('🔄 Attempting mobile login with:', { username: credentials.username });
      
      const response = await this.client.post(MOBILE_ENDPOINTS.LOGIN, credentials);
      console.log('✅ Mobile login response:', response.status, response.data);
      
      const result = response.data;
      
      if (result.success) {
        // Check if 2FA is required (backend sends OTP and requires verification)
        if (result.requires2FA) {
          console.log('🔐 2FA required - OTP sent, returning requires2FA flag');
          return {
            success: false, // Set to false so UI knows login isn't complete yet
            requires2FA: true,
            message: result.message || 'Please verify the code sent to your ' + (result.preferredAuthMethod === 'phone' ? 'phone' : 'email'),
            user: result.user,
            preferredAuthMethod: result.preferredAuthMethod,
            identifier: result.user?.masked_phone_number || result.user?.email,
          };
        }
        
        // Login successful (no 2FA required)
        if (result.user) {
          await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(result.user));
          console.log('💾 Stored mobile user data');
        }
        
        // Store the authentication token
        if (result.token) {
          await secureStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, result.token);
          console.log('💾 Stored authentication token:', result.token.substring(0, 20) + '...');
        } else {
          // Fallback to session_token for development
          await secureStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'session_token');
          console.log('💾 Stored fallback session_token');
        }
        
        // Store device token if device is trusted
        if (result.deviceToken) {
          await secureStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, result.deviceToken);
          console.log('💾 Stored device token for trusted device');
        }
        
        return {
          success: true,
          message: 'Login successful',
          user: result.user,
          token: result.token,
          session_info: result.session_info,
        };
      }
      
      return {
        success: false,
        message: result.message || 'Login failed',
      };
      
    } catch (error: any) {
      // console.error('❌ Mobile login error:', error);
      
      if (error.response) {
        // console.error('❌ Error response:', error.response.data);
        // console.error('❌ Error status:', error.response.status);
        
        if (error.response.status === 0) {
          throw new Error('Unable to reach the server. Please check your connection.');
        }
        
        if (error.response.status === 500) {
          throw new Error('Server error occurred. Please try again later.');
        }
        
        throw new Error(error.response.data?.message || 'Login failed');
      } else if (error.request) {
        // console.error('❌ No response received:', error.request);
        throw new Error('No response from server. Please check your connection.');
      } else {
        // console.error('❌ Error setting up request:', error.message);
        throw new Error('Error setting up request: ' + error.message);
      }
    }
  }

  async logout(): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.LOGOUT);
      await this.clearAuthData();
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Logout failed');
    }
  }

  async checkAuth(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.AUTH_CHECK);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Auth check failed');
    }
  }

  async testConnectivity(): Promise<ApiResponse> {
    try {
      const response = await this.client.get('/api/v1/mobile/health');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Connectivity test failed');
    }
  }

  async signup(data: any): Promise<AuthResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.SIGNUP, data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Signup failed');
    }
  }

  async forgotPassword(email: string): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.FORGOT_PASSWORD, { email });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Password reset failed');
    }
  }

  // ==================== MOBILE 2FA AUTHENTICATION ====================

  async requestOtp(phoneNumber: string, countryCode: string = 'US', purpose: string = 'verification'): Promise<ApiResponse> {
    try {
      console.log('🔄 Requesting OTP for:', { phoneNumber, countryCode, purpose });
      
      const response = await this.client.post(MOBILE_ENDPOINTS.REQUEST_OTP, {
        phoneNumber,
        countryCode,
        purpose
      });
      
      console.log('✅ OTP request response:', response.status, response.data);
      return response.data;
    } catch (error: any) {
      // console.error('❌ OTP request error:', error);
      throw new Error(error.response?.data?.message || 'Failed to send verification code');
    }
  }

  async verifyOtp(phoneNumber: string, otpCode: string): Promise<ApiResponse> {
    try {
      console.log('🔄 Verifying OTP for:', { phoneNumber, otpCode });
      
      const response = await this.client.post(MOBILE_ENDPOINTS.VERIFY_OTP, {
        phoneNumber,
        otpCode
      });
      
      console.log('✅ OTP verification response:', response.status, response.data);
      return response.data;
    } catch (error: any) {
      // console.error('❌ OTP verification error:', error);
      throw new Error(error.response?.data?.message || 'Invalid verification code');
    }
  }

  async loginWithPhone(phoneNumber: string, password: string): Promise<AuthResponse> {
    try {
      console.log('🔄 Attempting phone login for:', { phoneNumber });
      
      const response = await this.client.post(MOBILE_ENDPOINTS.LOGIN_WITH_PHONE, {
        phoneNumber,
        password
      });
      
      console.log('✅ Phone login response:', response.status, response.data);
      
      const result = response.data;
      
      if (result.success) {
        if (result.user) {
          await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(result.user));
          console.log('💾 Stored phone login user data');
        }
        
        return {
          success: true,
          message: 'Login successful',
          user: result.user,
          token: result.token,
          session_info: result.session_info,
        };
      }
      
      return {
        success: false,
        message: result.message || 'Phone login failed',
      };
      
    } catch (error: any) {
      // console.error('❌ Phone login error:', error);
      throw new Error(error.response?.data?.message || 'Phone login failed');
    }
  }

  async checkPhone(phoneNumber: string, countryCode: string = 'US'): Promise<ApiResponse> {
    try {
      console.log('🔄 Checking phone number:', { phoneNumber, countryCode });
      
      const response = await this.client.post(MOBILE_ENDPOINTS.CHECK_PHONE, {
        phoneNumber,
        countryCode
      });
      
      console.log('✅ Phone check response:', response.status, response.data);
      return response.data;
    } catch (error: any) {
      // console.error('❌ Phone check error:', error);
      throw new Error(error.response?.data?.message || 'Failed to check phone number');
    }
  }

  // ==================== MOBILE USER MANAGEMENT ====================

  async getUserProfile(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.USER);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch user profile');
    }
  }

  async updateUserProfile(data: any): Promise<ApiResponse> {
    try {
      const response = await this.client.put(MOBILE_ENDPOINTS.USER, data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update user profile');
    }
  }

  // ==================== MOBILE FILE MANAGEMENT ====================

  async getFiles(page = 1, perPage = 20, search?: string, category?: string, workspaceId?: number): Promise<ApiResponse> {
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('perPage', perPage.toString());
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      if (workspaceId) params.append('workspace_id', workspaceId.toString());
      
      const response = await this.client.get(`${MOBILE_ENDPOINTS.FILES}?${params}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch files');
    }
  }

  /**
   * Upload file - backend automatically encrypts files on save
   * All file operations go through backend encryption class
   */
  async uploadFile(file: FormData, onProgress?: (progress: number) => void): Promise<ApiResponse> {
    try {
      console.log('🔄 Attempting file upload...');
      console.log('🔐 File will be encrypted by backend encryption class on save');
      const response = await this.client.post(MOBILE_ENDPOINTS.UPLOAD, file, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // Increase timeout to 2 minutes for large files
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`📡 Upload progress event: ${progressEvent.loaded}/${progressEvent.total} = ${progress}%`);
            onProgress(progress);
          } else {
            console.log(`📡 Upload progress event ignored: onProgress=${!!onProgress}, total=${progressEvent.total}`);
          }
        },
      });
      console.log('✅ Upload successful');
      console.log('🔐 File encrypted and saved by backend');
      console.log('📡 Upload response:', response.data);
      return response.data;
    } catch (error: any) {
      // console.error('❌ Upload failed:', error);
      // console.error('❌ Upload error response:', error.response?.data);
      throw new Error(error.response?.data?.message || 'Upload failed');
    }
  }

  async getUploadProgress(taskId: string): Promise<ApiResponse> {
    try {
      console.log(`🔄 Checking upload progress for task: ${taskId}`);
      const response = await this.client.get(`/api/v1/mobile/progress/${taskId}`, {
        timeout: 10000 // 10 second timeout for progress requests
      });
      console.log(`📊 Progress response for ${taskId}:`, response.data);
      return response.data;
    } catch (error: any) {
      // console.error('❌ Failed to get upload progress:', error);
      // console.error('❌ Error details:', {
      //   status: error.response?.status,
      //   statusText: error.response?.statusText,
      //   data: error.response?.data,
      //   message: error.message
      // });
      throw new Error(error.response?.data?.message || 'Failed to get upload progress');
    }
  }

  async uploadFileWithProgressPolling(
    file: FormData, 
    onProgress?: (progress: number, message?: string, phase?: string) => void
  ): Promise<ApiResponse> {
    try {
      console.log('🔄 Starting upload with progress polling...');
      
      // Step 1: Upload the file (network progress)
      const uploadResponse = await this.uploadFile(file, (networkProgress) => {
        // Show network upload progress (0-20%)
        const adjustedProgress = Math.round(networkProgress * 0.2);
        onProgress?.(adjustedProgress, 'Uploading file...', 'upload');
      });

      // Step 2: Get task_id from response
      const taskId = (uploadResponse as any).task_id;
      if (!taskId) {
        console.warn('⚠️ No task_id in upload response, cannot poll progress');
        onProgress?.(100, 'Upload completed', 'completed');
        return uploadResponse;
      }

      console.log(`📋 Got task_id: ${taskId}, starting progress polling...`);
      console.log(`📋 Upload response:`, uploadResponse);
      console.log(`📋 About to start progress polling with onProgress:`, onProgress);

      // Step 3: Poll for processing progress and wait for completion
      return new Promise((resolve, reject) => {
        const pollInterval = 200; // Poll every 200ms for very responsive updates
        const maxPollTime = 300000; // Max 5 minutes for processing
        const startTime = Date.now();

        const pollProgress = async (): Promise<void> => {
          try {
            console.log(`🔄 Polling progress for task: ${taskId} (attempt ${Math.floor((Date.now() - startTime) / pollInterval) + 1})`);
            const progressResponse = await this.getUploadProgress(taskId);
            console.log(`📊 Raw progress response:`, progressResponse);
            
            if (progressResponse.success && progressResponse.data) {
              const { progress, status, message, phase } = progressResponse.data;
              
              // Use actual progress from backend (0-100%)
              const adjustedProgress = Math.min(100, Math.max(0, progress));
              
              console.log(`📊 Progress update: ${adjustedProgress}% - ${message} (${phase})`);
              console.log(`📊 Calling onProgress callback with: ${adjustedProgress}%, "${message}", "${phase}"`);
              
              onProgress?.(adjustedProgress, message, phase);
              
              // Check if processing is complete
              if (status === 'completed' || status === 'error' || adjustedProgress >= 100) {
                console.log(`✅ Processing complete: ${status}`);
                onProgress?.(100, 'Processing complete', 'completed');
                resolve(uploadResponse);
                return;
              }
              
              // Continue polling if not complete and within time limit
              if (Date.now() - startTime < maxPollTime) {
                setTimeout(pollProgress, pollInterval);
              } else {
                console.warn('⚠️ Progress polling timeout reached');
                onProgress?.(100, 'Processing timeout', 'timeout');
                resolve(uploadResponse); // Still resolve with the upload response
              }
            } else {
              console.warn('⚠️ Invalid progress response:', progressResponse);
              console.warn('⚠️ Response success:', progressResponse.success);
              console.warn('⚠️ Response data:', progressResponse.data);
              
              // If progress not found, show a default progress
              if (!progressResponse.success && progressResponse.message?.includes('not found')) {
                onProgress?.(25, 'Processing started...', 'processing');
              }
              
              // Continue polling on invalid response
              if (Date.now() - startTime < maxPollTime) {
                setTimeout(pollProgress, pollInterval);
              } else {
                console.warn('⚠️ Progress polling timeout on invalid response');
                resolve(uploadResponse);
              }
            }
          } catch (error) {
            // console.error('❌ Progress polling error:', error);
            // console.error('❌ Error type:', typeof error);
            // console.error('❌ Error message:', (error as any).message);
            // Continue polling on error
            if (Date.now() - startTime < maxPollTime) {
              setTimeout(pollProgress, pollInterval);
            } else {
              console.warn('⚠️ Progress polling timeout on error');
              resolve(uploadResponse);
            }
          }
        };

        // Start polling with a small delay to give backend time to initialize
        console.log(`🔄 Starting progress polling for task: ${taskId}`);
        console.log(`🔄 Polling will start in 200ms, then every ${pollInterval}ms for max ${maxPollTime}ms`);
        setTimeout(() => {
          console.log(`🔄 Starting first progress poll now...`);
          pollProgress();
        }, 200);
      });
    } catch (error: any) {
      // console.error('❌ Upload with progress polling failed:', error);
      throw error;
    }
  }

  async deleteFile(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(MOBILE_ENDPOINTS.FILE_DELETE(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Delete failed');
    }
  }

  async getFileById(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.FILE_BY_ID(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to get file');
    }
  }

  /**
   * Download file - backend automatically decrypts encrypted files
   * All file operations go through backend encryption class
   */
  async downloadFile(id: number): Promise<{ url: string; filename: string; blob?: Blob }> {
    try {
      console.log('🔄 Downloading file with ID:', id);
      console.log('🔐 File will be decrypted by backend encryption class');
      
      // First get the file info
      const infoResponse = await this.client.get(MOBILE_ENDPOINTS.FILE_BY_ID(id));
      const fileInfo = infoResponse.data?.file;
      const filename = fileInfo?.name || `document_${id}`;
      
      // Get the download URL - backend handles decryption automatically
      const downloadUrl = `${API_BASE_URL}${MOBILE_ENDPOINTS.FILE_DOWNLOAD(id)}`;
      
      console.log('📁 File download URL:', downloadUrl);
      console.log('📁 File name:', filename);
      console.log('🔐 Backend will decrypt file before serving');
      
      return {
        url: downloadUrl,
        filename: filename
      };
      
    } catch (error: any) {
      // console.error('❌ Download file error:', error);
      throw new Error(error.response?.data?.message || 'Download failed');
    }
  }

  /**
   * View file - backend automatically decrypts encrypted files for viewing
   * All file operations go through backend encryption class
   */
  async viewFile(id: number): Promise<{ url: string; filename: string }> {
    try {
      console.log('🔄 Viewing file with ID:', id);
      console.log('🔐 File will be decrypted by backend encryption class');
      
      // First get the file info
      const infoResponse = await this.client.get(MOBILE_ENDPOINTS.FILE_BY_ID(id));
      const fileInfo = infoResponse.data?.file;
      const filename = fileInfo?.name || `document_${id}`;
      
      // Use view endpoint if available, otherwise fallback to download
      // Backend handles decryption automatically
      const viewUrl = `${API_BASE_URL}${MOBILE_ENDPOINTS.FILE_VIEW(id)}`;
      
      console.log('📁 File view URL:', viewUrl);
      console.log('📁 File name:', filename);
      console.log('🔐 Backend will decrypt file before serving');
      
      return {
        url: viewUrl,
        filename: filename
      };
      
    } catch (error: any) {
      // Fallback to download endpoint if view endpoint doesn't exist
      console.log('⚠️ View endpoint not available, falling back to download endpoint');
      return this.downloadFile(id);
    }
  }

  // ==================== MOBILE CHAT ====================
  // All chat communication and responses are encrypted by backend

  /**
   * Send chat message - backend automatically encrypts messages and responses
   * All chat operations go through backend encryption class
   */
  async sendChatMessage(message: string, filters?: any, signal?: AbortSignal): Promise<ApiResponse> {
    try {
      console.log('💬 Sending chat message');
      console.log('🔐 Message and response will be encrypted by backend encryption class');
      const payload: any = { 
        message,
        response_mode: 'flexible' // Use same response mode as web
      };
      
      // Map filters to the same format as web
      if (filters) {
        if (filters.context_file_ids) {
          payload.context_file_ids = filters.context_file_ids;
        }
        if (filters.context_bookmark_ids) {
          payload.context_bookmark_ids = filters.context_bookmark_ids;
        }
        if (filters.context_transcript_ids) {
          payload.context_transcript_ids = filters.context_transcript_ids;
        }
        if (filters.search_type) {
          payload.search_type = filters.search_type;
        }
        if (filters.chat_history_id) {
          payload.chat_history_id = filters.chat_history_id;
        }
        // Map other filter properties
        Object.keys(filters).forEach(key => {
          if (!['context_file_ids', 'context_bookmark_ids', 'context_transcript_ids', 'search_type', 'chat_history_id'].includes(key)) {
            payload[key] = filters[key];
          }
        });
      }
      
      // Use the new streaming endpoint that calls smart_chat_stream()
      const response = await this.client.post(MOBILE_ENDPOINTS.CHAT_SMART_STREAM, payload, {
        signal
      });
      return response.data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error; // Re-throw abort errors to be handled by caller
      }
      throw new Error(error.response?.data?.message || 'Chat failed');
    }
  }

  /**
   * SSE Streaming chat message - backend automatically encrypts messages and responses
   * All chat operations go through backend encryption class
   */
  async sendChatMessageStream(
    message: string, 
    filters?: any, 
    signal?: AbortSignal,
    onChunk?: (type: string, data: any) => void
  ): Promise<void> {
    // MOBILE: Use EventSource for SSE streaming (React Native doesn't support fetch streaming)
    // WEB: Would use fetch with response.body.getReader() - but this is mobile-only code
    
    const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
    let eventSource: EventSource | null = null;
    
    try {
      console.log('💬 [MOBILE] Sending chat message via SSE streaming');
      console.log('🔐 Message and response will be encrypted by backend encryption class');
      
      const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      // Build payload
      const payload: any = { 
        message,
        response_mode: 'flexible',
        stream: true, // Enable streaming (SSE)
        preview_mode: true  // CRITICAL: Enable preview mode to match web behavior (same search logic)
      };
      
      // Map filters
      if (filters) {
        if (filters.context_file_ids) {
          payload.context_file_ids = filters.context_file_ids;
        }
        if (filters.context_bookmark_ids) {
          payload.context_bookmark_ids = filters.context_bookmark_ids;
        }
        if (filters.context_transcript_ids) {
          payload.context_transcript_ids = filters.context_transcript_ids;
        }
        if (filters.search_type) {
          payload.search_type = filters.search_type;
        }
        if (filters.chat_history_id) {
          payload.chat_history_id = filters.chat_history_id;
        }
        Object.keys(filters).forEach(key => {
          if (!['context_file_ids', 'context_bookmark_ids', 'context_transcript_ids', 'search_type', 'chat_history_id'].includes(key)) {
            payload[key] = filters[key];
          }
        });
      }
      
      // Get base URL
      const baseURL = this.client.defaults.baseURL || '';
      const streamURL = `${baseURL}${MOBILE_ENDPOINTS.CHAT_SMART_STREAM}`;
      
      console.log('📱 [MOBILE] Connecting to SSE stream with EventSource:', streamURL);
      
      // MOBILE: Use fetch with manual SSE parsing (EventSource doesn't support POST)
      if (isMobile) {
        console.log('📱 [MOBILE] Using fetch with manual SSE parsing for POST request');
        console.log('📱 [MOBILE] Payload:', JSON.stringify(payload).substring(0, 100));
        
        // Use fetch for POST request (EventSource only supports GET)
        const response = await fetch(streamURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(payload),
          signal,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        console.log('✅ [MOBILE] Fetch response received, status:', response.status);
        
        // Parse SSE stream manually using response.text() which works in React Native
        const reader = response.body?.getReader();
        if (!reader) {
          // Fallback: Read entire response as text (React Native limitation)
          console.warn('⚠️ [MOBILE] response.body.getReader() not available, reading as text');
          const text = await response.text();
          console.log('📱 [MOBILE] Full response text length:', text.length);
          
          // Parse SSE format manually
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim();
              if (dataStr) {
                try {
                  const data = JSON.parse(dataStr);
                  console.log('📱 [MOBILE] Parsed SSE message:', data.type);
                  
                  if (data.type === 'status' && onChunk) {
                    onChunk('status', data);
                  } else if ((data.type === 'preview_chunk' || data.type === 'chunk' || data.type === 'refinement_chunk') && onChunk) {
                    onChunk('chunk', {
                      type: 'chunk',
                      content: data.content,
                      chunk_index: data.chunk_index,
                      total_chunks: data.total_chunks,
                      progress: data.progress,
                      phase: data.phase || (data.type === 'preview_chunk' ? 'preview' : 'final')
                    });
                  } else if (data.type === 'complete' && onChunk) {
                    console.log('📱 [MOBILE] Received complete event');
                    onChunk('complete', {
                      type: 'complete',
                      response: data.response || '',
                      citations: data.citations || [],
                      chat_history_id: data.chat_history_id,
                      metadata: data.metadata
                    });
                    return;
                  } else if (data.type === 'error') {
                    throw new Error(data.message || 'Chat processing error');
                  }
                } catch (parseError) {
                  console.error('❌ [MOBILE] Error parsing SSE message:', parseError);
                }
              }
            }
          }
          return;
        }
        
        // Use ReadableStream if available
        console.log('✅ [MOBILE] Using ReadableStream for SSE parsing');
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('📱 [MOBILE] Stream completed');
            break;
          }
          
          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE messages (lines ending with \n\n)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim(); // Remove 'data: ' prefix
              if (dataStr) {
                try {
                  const data = JSON.parse(dataStr);
                  console.log('📱 [MOBILE] Received SSE message:', data.type);
                  
                  if (data.type === 'status' && onChunk) {
                    onChunk('status', data);
                  } else if ((data.type === 'preview_chunk' || data.type === 'chunk' || data.type === 'refinement_chunk') && onChunk) {
                    onChunk('chunk', {
                      type: 'chunk',
                      content: data.content,
                      chunk_index: data.chunk_index,
                      total_chunks: data.total_chunks,
                      progress: data.progress,
                      phase: data.phase || (data.type === 'preview_chunk' ? 'preview' : 'final')
                    });
                  } else if (data.type === 'complete' && onChunk) {
                    console.log('📱 [MOBILE] Received complete event');
                    onChunk('complete', {
                      type: 'complete',
                      response: data.response || '',
                      citations: data.citations || [],
                      chat_history_id: data.chat_history_id,
                      metadata: data.metadata
                    });
                    return; // Exit function
                  } else if (data.type === 'error') {
                    console.error('❌ [MOBILE] Received error event:', data);
                    if (onChunk) {
                      onChunk('error', {
                        type: 'error',
                        message: data.message || 'Chat processing error',
                        error: data.error
                      });
                    }
                    throw new Error(data.message || 'Chat processing error');
                  }
                } catch (parseError) {
                  console.error('❌ [MOBILE] Error parsing SSE message:', parseError);
                }
              }
            }
          }
        }
        
        return;
      } else {
        // WEB: Use fetch with response.body.getReader() (not implemented here, web has its own code)
        throw new Error('Web streaming not implemented in this function - use web-specific code');
      }

    } catch (error: any) {
      // Error handling
      console.error('❌ [MOBILE] Chat stream error:', error);
      
      if (error.name === 'AbortError') {
        throw error; // Re-throw abort errors to be handled by caller
      }
      
      console.error('❌ [MOBILE] Chat stream failed:', error);
      
      // Determine user-friendly error message
      let userFriendlyMessage = 'Sorry, there was an issue processing your request.';
      
      if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
        userFriendlyMessage = 'Connection timed out. Please check your internet connection and try again.';
      } else if (error.message?.includes('Network Error') || error.message?.includes('ERR_NETWORK')) {
        userFriendlyMessage = 'Unable to connect to the server. Please check your internet connection.';
      }
      
      if (onChunk) {
        onChunk('error', {
          type: 'error',
          message: userFriendlyMessage,
          error: error.message
        });
      }
      
      throw new Error(error.message || 'Chat stream failed');
    } finally {
      // Cleanup EventSource
      if (eventSource) {
        try {
          eventSource.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    }
  }

  async getChatHistory(limit: number = 50, offset: number = 0): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.CHAT_HISTORY, {
        params: { limit, offset }
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch chat history');
    }
  }

  // ==================== MOBILE FORMS ====================

  async getForms(): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.get(MOBILE_ENDPOINTS.FORMS);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch forms');
    }
  }

  async createForm(form: any): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.post(MOBILE_ENDPOINTS.FORMS, form);
      return response.data;
    } catch (error: any) {
      console.error('Create form error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create form');
    }
  }

  async updateForm(id: number, form: any): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.put(MOBILE_ENDPOINTS.FORM_BY_ID(id), form);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update form');
    }
  }

  async deleteForm(id: number): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.delete(MOBILE_ENDPOINTS.FORM_BY_ID(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete form');
    }
  }

  async getFormById(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.FORM_BY_ID(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to get form');
    }
  }

  async getFormResponses(id: number): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.get(MOBILE_ENDPOINTS.FORM_RESPONSES(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch form responses');
    }
  }

  // ==================== MOBILE ANALYTICS ====================

  async getDashboardStats(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.DASHBOARD);
      return response.data;
    } catch (error: any) {
      // Return mock data on failure for development
      return {
        success: true,
        data: {
          stats: {
            totalDocuments: 0,
            totalForms: 0,
            totalFiles: 0,
            totalChats: 0,
          },
          recentActivity: []
        }
      };
    }
  }

  async getAnalytics(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.ANALYTICS);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch analytics');
    }
  }

  async getRecentActivities(days = 7, limit = 10): Promise<ApiResponse> {
    try {
      console.log(`📊 Getting recent activities (${days} days, ${limit} limit)`);
      const response = await this.client.get(MOBILE_ENDPOINTS.ACTIVITY, {
        params: { days, limit }
      });
      console.log('✅ Recent activities loaded');
      return response.data;
    } catch (error: any) {
      // console.error('❌ Failed to get recent activities:', error);
      throw new Error(error.response?.data?.message || 'Failed to get recent activities');
    }
  }

  async getComprehensiveAnalytics(days = 30): Promise<ApiResponse> {
    try {
      console.log(`📊 Getting comprehensive analytics (${days} days)`);
      const response = await this.client.get(MOBILE_ENDPOINTS.COMPREHENSIVE, {
        params: { days }
      });
      console.log('✅ Comprehensive analytics loaded');
      return response.data;
    } catch (error: any) {
      // console.error('❌ Failed to get comprehensive analytics:', error);
      throw new Error(error.response?.data?.message || 'Failed to get comprehensive analytics');
    }
  }

  async getReceiptAnalytics(days = 30): Promise<ApiResponse> {
    try {
      console.log(`📊 Getting receipt analytics (${days} days)`);
      // Try the dashboard analytics endpoint that has receipt data
      const response = await this.client.get('/api/dashboard/analytics', {
        params: { days }
      });
      console.log('✅ Receipt analytics loaded');
      return response.data;
    } catch (error: any) {
      console.log('❌ Receipt analytics failed, trying comprehensive analytics');
      // Fallback to comprehensive analytics
      return this.getComprehensiveAnalytics(days);
    }
  }

  // ==================== MOBILE DOCUMENTS ====================

  async getDocuments(page = 1, perPage = 20, search?: string, category?: string, workspaceId?: number): Promise<ApiResponse> {
    try {
      // If workspaceId is provided, use the dedicated workspace files endpoint
      // This endpoint properly filters files using FileWorkspaceVisibility
      if (workspaceId) {
        console.log('📁 API: Using workspace files endpoint for workspaceId:', workspaceId);
        const url = `/api/v1/web/workspaces/${workspaceId}/files`;
        console.log('📁 API: Requesting workspace files from:', url);
        const response = await this.client.get(url);
        console.log('📁 API: Workspace files response success:', response.data?.success, 'Files count:', response.data?.files?.length || 0);
        
        // Transform workspace files response format to match expected format
        if (response.data?.success && response.data?.files) {
          // Apply search and category filters client-side if needed
          let filteredFiles = response.data.files;
          if (search) {
            filteredFiles = filteredFiles.filter((file: any) => 
              (file.original_filename || file.filename || '').toLowerCase().includes(search.toLowerCase())
            );
          }
          if (category) {
            filteredFiles = filteredFiles.filter((file: any) => 
              (file.file_kind || '').toLowerCase() === category.toLowerCase()
            );
          }
          
          return {
            success: true,
            data: filteredFiles,
            files: filteredFiles,
            pagination: {
              page: 1,
              per_page: filteredFiles.length,
              total: filteredFiles.length,
              has_more: false
            }
          };
        }
        return response.data;
      }
      
      // For non-workspace requests, use the regular web files endpoint
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('perPage', perPage.toString());
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      
      const url = `/api/v1/web/files?${params}`;
      console.log('📁 API: Requesting files from web endpoint:', url);
      const response = await this.client.get(url);
      console.log('📁 API: Files response success:', response.data?.success, 'Files count:', response.data?.files?.length || 0);
      
      // Transform web response format to match expected format
      if (response.data?.success && response.data?.files) {
        return {
          success: true,
          data: response.data.files,
          files: response.data.files,
          pagination: response.data.pagination
        };
      }
      return response.data;
    } catch (error: any) {
      console.warn('📁 API: Web files endpoint failed, falling back to getFiles:', error.message);
      // For backward compatibility, return files if web endpoint fails
      return this.getFiles(page, perPage, search, category, workspaceId);
    }
  }

  // ==================== MOBILE TEMPLATES ====================

  async getTemplates(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.TEMPLATES);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch templates');
    }
  }

  async getFormTemplates(): Promise<ApiResponse> {
    try {
      console.log('🔄 Attempting to fetch form templates...');
      
      // Use proper mobile endpoint that exists in backend
      const response = await this.client.get(MOBILE_ENDPOINTS.FORM_TEMPLATES);
      console.log('✅ Form templates loaded from mobile endpoint');
      return response.data;
      
    } catch (error: any) {
      console.error('Get form templates error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch form templates');
    }
  }

  // ==================== USER CHAT SYSTEM (Mobile-specific endpoints) ====================
  // These endpoints handle ONLY user-to-user and workspace chats (NOT AI chats)
  // Mobile endpoints are SEPARATE from web endpoints to avoid 403 errors
  // Web uses: /api/v1/web/user-chat/*
  // Mobile uses: /api/v1/mobile/user-chat/*
  
  /**
   * Get all user chats - Mobile-specific endpoint
   * Returns direct messages and workspace chats only
   */
  async getChats(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.USER_CHATS);
      return response.data;
    } catch (error: any) {
      console.error('Get chats error:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to fetch chats';
      throw new Error(errorMessage);
    }
  }

  /**
   * Get messages for a specific chat - Mobile-specific endpoint
   */
  async getChatMessages(chatId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.USER_CHAT_MESSAGES(chatId));
      return response.data;
    } catch (error: any) {
      console.error('Get chat messages error:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        chatId: chatId
      });
      
      let errorMessage = 'Failed to fetch chat messages';
      
      if (error.response?.status === 404) {
        errorMessage = 'Chat not found. The chat may have been deleted or you may not have access.';
      } else if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to view messages in this chat.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Send a message to a chat - Mobile-specific endpoint
   */
  async sendChatMessageToChat(message: string, chatId: number, metadata?: any): Promise<ApiResponse> {
    try {
      const payload: any = {
        content: message,
        type: 'text'
      };
      
      if (metadata) {
        payload.metadata = metadata;
      }
      
      const response = await this.client.post(MOBILE_ENDPOINTS.USER_CHAT_SEND(chatId), payload);
      return response.data;
    } catch (error: any) {
      console.error('Send chat message error:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      let errorMessage = 'Failed to send message';
      
      if (error.response?.status === 500) {
        errorMessage = error.response?.data?.error || 
                      error.response?.data?.message || 
                      'Server error. Please try again later.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Chat not found. Please refresh and try again.';
      } else if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to send messages in this chat.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Start a new user chat (direct or workspace) - Mobile-specific endpoint
   */
  async startUserChat(data: { 
    type: 'direct' | 'workspace';
    user_id?: number;
    workspace_id?: number;
  }): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.USER_CHAT_START, data);
      return response.data;
    } catch (error: any) {
      console.error('Start chat error:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to start chat';
      throw new Error(errorMessage);
    }
  }

  /**
   * Search for users and workspaces to start chats - Mobile-specific endpoint
   */
  async searchUsersForChat(query: string): Promise<ApiResponse> {
    try {
      const response = await this.client.get(`${MOBILE_ENDPOINTS.USER_CHAT_SEARCH_USERS}?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error: any) {
      console.error('Search users error:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to search users';
      throw new Error(errorMessage);
    }
  }

  // ==================== MOBILE BOOKMARKS ====================
  
  async getBookmarks(limit: number = 50, offset: number = 0): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.BOOKMARKS, {
        params: { limit, offset }
      });
      return response.data;
    } catch (error: any) {
      console.error('Get bookmarks error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch bookmarks');
    }
  }

  async addFileToBookmark(bookmarkId: number, fileId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.post(`${MOBILE_ENDPOINTS.BOOKMARKS}/${bookmarkId}/files/${fileId}`);
      return response.data;
    } catch (error: any) {
      console.error('Add file to bookmark error:', error);
      throw new Error(error.response?.data?.message || 'Failed to add file to bookmark');
    }
  }

  async addFilesToBookmark(bookmarkId: number, fileIds: number[]): Promise<ApiResponse> {
    try {
      const response = await this.client.post(`${MOBILE_ENDPOINTS.BOOKMARKS}/${bookmarkId}/files/bulk`, { file_ids: fileIds });
      return response.data;
    } catch (error: any) {
      console.error('Add files to bookmark error:', error);
      throw new Error(error.response?.data?.message || 'Failed to add files to bookmark');
    }
  }

  async getBookmarkFiles(bookmarkId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.get(`${MOBILE_ENDPOINTS.BOOKMARKS}/${bookmarkId}/files`);
      return response.data;
    } catch (error: any) {
      console.error('Get bookmark files error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch bookmark files');
    }
  }

  async removeFileFromBookmark(bookmarkId: number, fileId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(`${MOBILE_ENDPOINTS.BOOKMARKS}/${bookmarkId}/files/${fileId}`);
      return response.data;
    } catch (error: any) {
      console.error('Remove file from bookmark error:', error);
      throw new Error(error.response?.data?.message || 'Failed to remove file from bookmark');
    }
  }

  async updateBookmark(bookmarkId: number, data: { name?: string; description?: string; color?: string }): Promise<ApiResponse> {
    try {
      const response = await this.client.put(`${MOBILE_ENDPOINTS.BOOKMARKS}/${bookmarkId}`, data);
      return response.data;
    } catch (error: any) {
      console.error('Update bookmark error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update bookmark');
    }
  }

  async deleteBookmark(bookmarkId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(`${MOBILE_ENDPOINTS.BOOKMARKS}/${bookmarkId}`);
      return response.data;
    } catch (error: any) {
      console.error('Delete bookmark error:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete bookmark');
    }
  }

  async createBookmark(bookmarkData: { name: string; description?: string; color: string }): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.BOOKMARKS, bookmarkData);
      return response.data;
    } catch (error: any) {
      console.error('Create bookmark error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create bookmark');
    }
  }

  // ==================== MOBILE WORKSPACES ====================
  
  async getMobileWorkspaces(limit: number = 50, offset: number = 0): Promise<ApiResponse> {
    try {
      console.log('🔄 Loading workspaces from:', MOBILE_ENDPOINTS.WORKSPACES);
      // Use proper mobile endpoint with pagination
      const response = await this.client.get(MOBILE_ENDPOINTS.WORKSPACES, {
        params: { limit, offset }
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Get mobile workspaces error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch workspaces';
      throw new Error(errorMessage);
    }
  }

  async createWorkspace(data: {
    name: string;
    description?: string;
    slug?: string;
  }): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.post(MOBILE_ENDPOINTS.WORKSPACES, data);
      return response.data;
    } catch (error: any) {
      console.error('Create workspace error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create workspace');
    }
  }

  async getWorkspace(id: number): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.get(MOBILE_ENDPOINTS.WORKSPACE_BY_ID(id));
      return response.data;
    } catch (error: any) {
      console.error('Get workspace error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch workspace');
    }
  }

  async updateWorkspace(id: number, data: {
    name?: string;
    description?: string;
    is_active?: boolean;
  }): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.put(MOBILE_ENDPOINTS.WORKSPACE_BY_ID(id), data);
      return response.data;
    } catch (error: any) {
      console.error('Update workspace error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update workspace');
    }
  }

  async deleteWorkspace(id: number): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.delete(MOBILE_ENDPOINTS.WORKSPACE_BY_ID(id));
      return response.data;
    } catch (error: any) {
      console.error('Delete workspace error:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete workspace');
    }
  }

  async getWorkspaceMembers(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.WORKSPACE_MEMBERS(id));
      return response.data;
    } catch (error: any) {
      console.error('Get workspace members error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch workspace members');
    }
  }

  async addWorkspaceMember(workspaceId: number, data: {
    email: string;
    role: 'admin' | 'member' | 'viewer';
  }): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.WORKSPACE_MEMBERS(workspaceId), data);
      return response.data;
    } catch (error: any) {
      console.error('Add workspace member error:', error);
      throw new Error(error.response?.data?.message || 'Failed to add workspace member');
    }
  }

  async updateWorkspaceMember(workspaceId: number, memberId: number, data: {
    role: 'admin' | 'member' | 'viewer';
  }): Promise<ApiResponse> {
    try {
      const response = await this.client.put(MOBILE_ENDPOINTS.WORKSPACE_MEMBER_BY_ID(workspaceId, memberId), data);
      return response.data;
    } catch (error: any) {
      console.error('Update workspace member error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update workspace member');
    }
  }

  async removeWorkspaceMember(workspaceId: number, memberId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(MOBILE_ENDPOINTS.WORKSPACE_MEMBER_BY_ID(workspaceId, memberId));
      return response.data;
    } catch (error: any) {
      console.error('Remove workspace member error:', error);
      throw new Error(error.response?.data?.message || 'Failed to remove workspace member');
    }
  }

  async updateWorkspaceMemberRole(workspaceId: number, memberId: number, role: 'owner' | 'admin' | 'member' | 'viewer'): Promise<ApiResponse> {
    try {
      const response = await this.client.put(MOBILE_ENDPOINTS.WORKSPACE_MEMBER_ROLE(workspaceId, memberId), { role });
      return response.data;
    } catch (error: any) {
      console.error('Update workspace member role error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update member role');
    }
  }

  async resendWorkspaceInvitation(workspaceId: number, invitationId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.WORKSPACE_INVITATION_RESEND(workspaceId, invitationId));
      return response.data;
    } catch (error: any) {
      console.error('Resend workspace invitation error:', error);
      throw new Error(error.response?.data?.message || 'Failed to resend invitation');
    }
  }

  async cancelWorkspaceInvitation(workspaceId: number, invitationId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(MOBILE_ENDPOINTS.WORKSPACE_INVITATION_BY_ID(workspaceId, invitationId));
      return response.data;
    } catch (error: any) {
      console.error('Cancel workspace invitation error:', error);
      throw new Error(error.response?.data?.message || 'Failed to cancel invitation');
    }
  }

  async getWorkspaceUsers(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.WORKSPACE_USERS);
      return response.data;
    } catch (error: any) {
      console.error('Get workspace users error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch workspace users');
    }
  }

  async inviteToWorkspace(workspaceId: number, email: string, role: string = 'member'): Promise<ApiResponse> {
    try {
      const response = await this.client.post(`/api/v1/mobile/workspaces/${workspaceId}/invite`, {
        email,
        role
      });
      return response.data;
    } catch (error: any) {
      console.error('Invite to workspace error:', error);
      throw new Error(error.response?.data?.message || 'Failed to invite user to workspace');
    }
  }

  async getWorkspaceFiles(workspaceId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.get(`/api/v1/mobile/workspaces/${workspaceId}/files`);
      return response.data;
    } catch (error: any) {
      console.error('Get workspace files error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch workspace files');
    }
  }

  // ==================== MOBILE UPLOAD LINKS ====================

  async getUploadLinks(): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.get(MOBILE_ENDPOINTS.UPLOAD_LINKS);
      return response.data;
    } catch (error: any) {
      console.error('Get upload links error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch upload links');
    }
  }

  async createUploadLink(data: {
    name: string;
    description?: string;
    expires_in_days?: number;
    max_uploads?: number;
  }): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.post(MOBILE_ENDPOINTS.UPLOAD_LINKS, data);
      return response.data;
    } catch (error: any) {
      console.error('Create upload link error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create upload link');
    }
  }

  async getUploadLink(id: number): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.get(MOBILE_ENDPOINTS.UPLOAD_LINK_BY_ID(id));
      return response.data;
    } catch (error: any) {
      console.error('Get upload link error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch upload link');
    }
  }

  async updateUploadLink(id: number, data: any): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.put(MOBILE_ENDPOINTS.UPLOAD_LINK_BY_ID(id), data);
      return response.data;
    } catch (error: any) {
      console.error('Update upload link error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update upload link');
    }
  }

  async deleteUploadLink(id: number): Promise<ApiResponse> {
    try {
      // Use proper mobile endpoint
      const response = await this.client.delete(MOBILE_ENDPOINTS.UPLOAD_LINK_BY_ID(id));
      return response.data;
    } catch (error: any) {
      console.error('Delete upload link error:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete upload link');
    }
  }

  async shareUploadLink(id: number, data: {
    emails: string[];
    message?: string;
  }): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.UPLOAD_LINK_SHARE(id), data);
      return response.data;
    } catch (error: any) {
      console.error('Share upload link error:', error);
      throw new Error(error.response?.data?.message || 'Failed to share upload link');
    }
  }

  async shareFile(fileId: number): Promise<ApiResponse> {
    try {
      const response = await this.client.post(`/api/v1/mobile/file/${fileId}/share`);
      return response.data;
    } catch (error: any) {
      console.error('Share file error:', error);
      throw new Error(error.response?.data?.message || 'Failed to share file');
    }
  }

  async downloadFormResponsesCSV(formId: number): Promise<string> {
    try {
      const response = await this.client.get(`/api/v1/mobile/forms/${formId}/responses/download`, {
        responseType: 'text' // Changed from 'blob' to 'text' to get string directly
      });
      return response.data;
    } catch (error: any) {
      console.error('Download form responses CSV error:', error);
      throw new Error(error.response?.data?.message || 'Failed to download CSV');
    }
  }

  async getUploadLinkFiles(id: number, page = 1, perPage = 20): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.UPLOAD_LINK_FILES(id), {
        params: { page, perPage }
      });
      return response.data;
    } catch (error: any) {
      console.error('Get upload link files error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch upload link files');
    }
  }

  // ==================== LEGACY WEB COMPATIBILITY ====================
  
  // Keep existing methods for backward compatibility with web endpoints
  async getWorkspaces(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.WORKSPACES);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch workspaces');
    }
  }

  async healthCheck(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.HEALTH);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Health check failed');
    }
  }

  // ==================== DEVICE MANAGEMENT ====================

  async getRegisteredDevices(): Promise<ApiResponse> {
    try {
      const response = await this.client.get('/api/v1/mobile/devices');
      return response.data;
    } catch (error: any) {
      console.error('Get devices failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch devices');
    }
  }

  async revokeDevice(deviceId: string): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(`/api/v1/mobile/devices/${deviceId}`);
      return response.data;
    } catch (error: any) {
      console.error('Revoke device failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to revoke device');
    }
  }

  async revokeAllDevices(): Promise<ApiResponse> {
    try {
      console.log('🔄 Revoking all devices...');
      const response = await this.client.post('/api/v1/mobile/devices/revoke-all');
      console.log('✅ Revoke all devices response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Revoke all devices failed:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      throw new Error(error.response?.data?.message || 'Failed to revoke all devices');
    }
  }

  // ==================== MEETING MANAGEMENT ====================

  async getMeetings(): Promise<ApiResponse> {
    try {
      const response = await this.client.get('/api/v1/mobile/meetings');
      return response.data;
    } catch (error: any) {
      console.error('Get meetings failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch meetings');
    }
  }

  async joinMeeting(data: { meetingId: string; passcode?: string }): Promise<ApiResponse> {
    try {
      const response = await this.client.post('/api/v1/mobile/meetings/join', data);
      return response.data;
    } catch (error: any) {
      console.error('Join meeting failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to join meeting');
    }
  }

  async endMeeting(meetingId: string): Promise<ApiResponse> {
    try {
      console.log('Attempting to end meeting with ID:', meetingId);
      console.log('Using endpoint: /api/v1/video/room/' + meetingId + '/end');
      
      // Use string ID as confirmed by web backend logs
      const response = await this.client.post(`/api/v1/video/room/${meetingId}/end`);
      console.log('End meeting response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('End meeting failed:', error);
      console.error('Meeting ID was:', meetingId);
      console.error('Full error response:', error.response?.data);
      
      // If room not found, return success anyway since the meeting is effectively ended
      if (error.response?.status === 404) {
        console.log('Room not found - treating as success since meeting is effectively ended');
        return { 
          success: true, 
          message: 'Meeting ended successfully (room was not found in backend)',
          data: { meetingId }
        };
      }
      
      throw new Error(error.response?.data?.message || 'Failed to end meeting');
    }
  }

  async deleteMeeting(meetingId: string, forceDelete: boolean = false): Promise<ApiResponse> {
    try {
      console.log('🗑️ Attempting to delete meeting:', meetingId);
      console.log('🔍 Meeting ID type:', typeof meetingId, 'Value:', meetingId);
      console.log('🔍 Force delete:', forceDelete);
      
      // Use the correct endpoint that deletes the meeting record
      // Use delete-confirmed endpoint when user has already confirmed
      const url = forceDelete 
        ? `/api/v1/video/room/${meetingId}/delete-confirmed`
        : `/api/v1/video/room/${meetingId}/delete`;
      const response = await this.client.delete(url);
      console.log('✅ Meeting delete response:', response.data);
      
      // Check if confirmation is required
      if (response.data.requires_confirmation && !forceDelete) {
        console.log('⚠️ Confirmation required for meeting with assets');
        return {
          success: false,
          requires_confirmation: true,
          message: response.data.message,
          asset_count: response.data.asset_count,
          asset_details: response.data.asset_details,
          warning: response.data.warning
        };
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Delete meeting failed:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      // Handle specific errors
      if (error.response?.status === 404) {
        throw new Error('Meeting not found. The meeting may have already been deleted or the ID is incorrect.');
      } else if (error.response?.status === 403) {
        throw new Error('You are not authorized to delete this meeting. Only the meeting creator can delete it.');
      }
      
      throw new Error(error.response?.data?.message || 'Failed to delete meeting');
    }
  }

  async sendMeetingInvite(meetingId: string, data: { email: string; message?: string }): Promise<ApiResponse> {
    try {
      const response = await this.client.post(`/api/v1/mobile/meetings/${meetingId}/invite`, data);
      return response.data;
    } catch (error: any) {
      console.error('Send meeting invite failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to send meeting invite');
    }
  }

  // ==================== MEETING ASSETS & WEBHOOKS ====================

  async getMeetingAssets(): Promise<ApiResponse> {
    try {
      console.log('📁 Loading meeting assets with local file paths...');
      const response = await this.client.get(MOBILE_ENDPOINTS.MEETING_ASSETS);
      console.log('📁 Meeting assets response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Get meeting assets failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch meeting assets');
    }
  }

  async deleteMeetingAssets(meetingId: string): Promise<ApiResponse> {
    try {
      console.log('🗑️ Deleting all assets for meeting:', meetingId);
      const response = await this.client.delete(MOBILE_ENDPOINTS.MEETING_DELETE_ASSETS(meetingId));
      console.log('✅ Delete meeting assets response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Delete meeting assets failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete meeting assets');
    }
  }

  async getMeetingTranscript(meetingId: string): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.MEETING_TRANSCRIPT(meetingId));
      return response.data;
    } catch (error: any) {
      console.error('Get meeting transcript failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch meeting transcript');
    }
  }

  async getMeetingSummary(meetingId: string): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.MEETING_SUMMARY(meetingId));
      return response.data;
    } catch (error: any) {
      console.error('Get meeting summary failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch meeting summary');
    }
  }

  async getMeetingChat(meetingId: string): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.MEETING_CHAT(meetingId));
      return response.data;
    } catch (error: any) {
      console.error('Get meeting chat failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch meeting chat');
    }
  }

  async getMeetingReport(meetingId: string): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.MEETING_REPORT(meetingId));
      return response.data;
    } catch (error: any) {
      console.error('Get meeting report failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch meeting report');
    }
  }

  async downloadMeetingAsset(meetingId: string, assetType: string): Promise<{ url: string; filename: string }> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.MEETING_DOWNLOAD(meetingId, assetType));
      return {
        url: response.data.downloadUrl || response.data.url,
        filename: response.data.filename || `${meetingId}_${assetType}`
      };
    } catch (error: any) {
      console.error('Download meeting asset failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to download meeting asset');
    }
  }

  // ==================== CONFIGURATION ====================
  // Configuration endpoint not available on backend
}

// Create and export singleton instance
export const apiService = new ApiService();
export const apiClient = apiService; // For backward compatibility
export default apiService; 