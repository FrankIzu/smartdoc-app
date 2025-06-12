import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
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
  
  // User
  USER: '/api/v1/mobile/user',
  
  // Files
  FILES: '/api/v1/mobile/files',
  UPLOAD: '/api/v1/mobile/upload',
  FILE_BY_ID: (id: number) => `/api/v1/mobile/file/${id}`,
  FILE_DOWNLOAD: (id: number) => `/api/v1/mobile/file/${id}/download`,
  
  // Chat
  CHAT_HISTORY: '/api/v1/mobile/chat/history',
  CHAT_SEND: '/api/v1/mobile/chat/send',
  
  // Forms
  FORMS: '/api/v1/mobile/forms',
  
  // Analysis
  DASHBOARD: '/api/v1/mobile/analysis/dashboard',
  ANALYTICS: '/api/v1/mobile/analysis/analytics',
  ACTIVITY: '/api/v1/mobile/analysis/activity',
  
  // Documents
  DOCUMENTS: '/api/v1/mobile/documents',
  DOCUMENT_BY_ID: (id: number) => `/api/v1/mobile/document/${id}`,
  
  // Templates
  TEMPLATES: '/api/v1/mobile/templates',
} as const;

// Main API Service Class
class ApiService {
  private client: AxiosInstance;

  constructor() {
    // Determine the actual platform for the X-Platform header
    // For development, use 'android' to bypass iOS HTTPS requirements
    const isDevelopment = __DEV__ || process.env.NODE_ENV === 'development';
    const platformHeader = isDevelopment ? 'android' : // Use android in dev to avoid HTTPS issues
                          Platform.OS === 'ios' ? 'ios' : 
                          Platform.OS === 'android' ? 'android' : 
                          'mobile'; // fallback for web or other platforms
    
    console.log('🔧 API Service Platform Config:', {
      platformOS: Platform.OS,
      isDevelopment,
      platformHeader,
      baseURL: API_BASE_URL
    });
    
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': platformHeader, // Send platform optimized for environment
      },
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      async (config) => {
        try {
          const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        } catch (error) {
          console.warn('Failed to get auth token:', error);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
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
    } catch (error) {
      console.warn('Failed to clear auth data:', error);
    }
  }

  // ==================== MOBILE AUTHENTICATION ====================

  async login(credentials: { username: string; password: string }): Promise<AuthResponse> {
    try {
      console.log('🔄 Attempting mobile login with:', { username: credentials.username });
      console.log('📡 Mobile API URL:', `${API_BASE_URL}${MOBILE_ENDPOINTS.LOGIN}`);
      console.log('🔧 Platform header:', this.client.defaults.headers['X-Platform']);
      console.log('📱 Actual Platform.OS:', Platform.OS);
      
      const response = await this.client.post(MOBILE_ENDPOINTS.LOGIN, credentials);
      console.log('✅ Mobile login response:', response.status, response.data);
      
      const result = response.data;
      
      if (result.success) {
        if (result.user) {
          await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(result.user));
          console.log('💾 Stored mobile user data');
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
      console.error('❌ Mobile login error:', error);
      
      if (error.response) {
        console.error('❌ Error response:', error.response.data);
        console.error('❌ Error status:', error.response.status);
        
        if (error.response.status === 0) {
          throw new Error('Unable to reach the server. Please check your connection.');
        }
        
        if (error.response.status === 500) {
          throw new Error('Server error occurred. Please try again later.');
        }
        
        throw new Error(error.response.data?.message || 'Login failed');
      } else if (error.request) {
        console.error('❌ No response received:', error.request);
        throw new Error('No response from server. Please check your connection.');
      } else {
        console.error('❌ Error setting up request:', error.message);
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

  async getFiles(page = 1, perPage = 20, search?: string, category?: string): Promise<ApiResponse> {
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('perPage', perPage.toString());
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      
      const response = await this.client.get(`${MOBILE_ENDPOINTS.FILES}?${params}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch files');
    }
  }

  async uploadFile(file: FormData, onProgress?: (progress: number) => void): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.UPLOAD, file, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Upload failed');
    }
  }

  async deleteFile(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(MOBILE_ENDPOINTS.FILE_BY_ID(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Delete failed');
    }
  }

  async downloadFile(id: number): Promise<{ url: string; filename: string; blob?: Blob }> {
    try {
      console.log('🔄 Downloading file with ID:', id);
      
      // First get the file info
      const infoResponse = await this.client.get(MOBILE_ENDPOINTS.FILE_BY_ID(id));
      const fileInfo = infoResponse.data?.file;
      const filename = fileInfo?.name || `document_${id}`;
      
      // Get the download URL - we'll return it for external opening
      const downloadUrl = `${API_BASE_URL}${MOBILE_ENDPOINTS.FILE_DOWNLOAD(id)}`;
      
      console.log('📁 File download URL:', downloadUrl);
      console.log('📁 File name:', filename);
      
      return {
        url: downloadUrl,
        filename: filename
      };
      
    } catch (error: any) {
      console.error('❌ Download file error:', error);
      throw new Error(error.response?.data?.message || 'Download failed');
    }
  }

  // ==================== MOBILE CHAT ====================

  async sendChatMessage(message: string): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.CHAT_SEND, { message });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Chat failed');
    }
  }

  async getChatHistory(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.CHAT_HISTORY);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch chat history');
    }
  }

  // ==================== MOBILE FORMS ====================

  async getForms(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(MOBILE_ENDPOINTS.FORMS);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch forms');
    }
  }

  async createForm(form: any): Promise<ApiResponse> {
    try {
      const response = await this.client.post(MOBILE_ENDPOINTS.FORMS, form);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to create form');
    }
  }

  async updateForm(id: number, form: any): Promise<ApiResponse> {
    try {
      const response = await this.client.put(`${MOBILE_ENDPOINTS.FORMS}/${id}`, form);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update form');
    }
  }

  async deleteForm(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(`${MOBILE_ENDPOINTS.FORMS}/${id}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete form');
    }
  }

  async getFormResponses(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.get(`${MOBILE_ENDPOINTS.FORMS}/${id}/responses`);
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

  // ==================== MOBILE DOCUMENTS ====================

  async getDocuments(page = 1, perPage = 20, search?: string, category?: string): Promise<ApiResponse> {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      
      const response = await this.client.get(`${MOBILE_ENDPOINTS.DOCUMENTS}?${params}`);
      return response.data;
    } catch (error: any) {
      // For backward compatibility, return files if documents endpoint fails
      return this.getFiles(page, perPage, search, category);
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
}

// Create and export singleton instance
export const apiService = new ApiService();
export const apiClient = apiService; // For backward compatibility
export default apiService; 