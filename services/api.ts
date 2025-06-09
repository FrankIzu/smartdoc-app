import axios, { AxiosInstance } from 'axios';
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

// Main API Service Class
class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
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

  // Authentication
  async login(credentials: { username: string; password: string }): Promise<AuthResponse> {
    try {
      console.log('🔄 Attempting login with:', { username: credentials.username });
      console.log('📡 API URL:', `${API_BASE_URL}${API_ENDPOINTS.LOGIN}`);
      
      const response = await this.client.post(API_ENDPOINTS.LOGIN, credentials);
      console.log('✅ Login response:', response.status, response.data);
      console.log('🔍 Response structure:', JSON.stringify(response.data, null, 2));
      
      const result = response.data;
      
      if (result.success) {
        // Check for user data in response
        if (result.user) {
          await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(result.user));
          console.log('💾 Stored user data');
          
          return {
            success: true,
            message: 'Login successful',
            user: result.user,
            token: result.token,
          };
        }
        
        // Handle session_info response format (newer backend)
        if (result.session_info && result.session_info.user_id) {
          console.log('🔍 Backend returned session_info format, fetching user data...');
          
          // Try to fetch user data from /api/user endpoint
          try {
            const userResponse = await this.client.get('/api/user');
            if (userResponse.data && userResponse.data.success && userResponse.data.user) {
              const userData = userResponse.data.user;
              await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
              console.log('💾 Stored user data from /api/user');
              
              return {
                success: true,
                message: 'Login successful',
                user: userData,
                token: result.token,
              };
            }
          } catch (userError) {
            console.warn('⚠️ Failed to fetch user data from /api/user:', userError);
          }
          
          // Fallback: create minimal user from session_info
          console.log('🔄 Using session_info fallback for user data');
          const minimalUser = {
            id: result.session_info.user_id,
            username: credentials.username, // Use the username they logged in with
            email: '', // Will be empty until we can fetch it
            first_name: '',
            last_name: '',
          };
          
          await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(minimalUser));
          console.log('💾 Stored minimal user data from session_info');
          
          return {
            success: true,
            message: 'Login successful',
            user: minimalUser,
            token: result.token,
          };
        }
      }
      
      return {
        success: false,
        message: result.message || 'Login failed',
        user: null,
      };
      
    } catch (error: any) {
      console.error('❌ Login error:', error);
      
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
      const response = await this.client.post(API_ENDPOINTS.LOGOUT);
      await this.clearAuthData();
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Logout failed');
    }
  }

  async checkAuth(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.AUTH_CHECK);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Auth check failed');
    }
  }

  async signup(data: any): Promise<AuthResponse> {
    try {
      const response = await this.client.post(API_ENDPOINTS.SIGNUP, data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Signup failed');
    }
  }

  // Files/Documents
  async getFiles(page = 1, perPage = 20, search?: string, category?: string): Promise<ApiResponse> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
        ...(search && { search }),
        ...(category && { category }),
      });
      
      const response = await this.client.get(`${API_ENDPOINTS.FILES}?${params}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch files');
    }
  }

  async uploadFile(file: FormData, onProgress?: (progress: number) => void): Promise<ApiResponse> {
    try {
      const response = await this.client.post(API_ENDPOINTS.UPLOAD, file, {
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
      const response = await this.client.delete(API_ENDPOINTS.FILES_BY_ID(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Delete failed');
    }
  }

  // Chat
  async sendChatMessage(message: string): Promise<ApiResponse> {
    try {
      const response = await this.client.post(API_ENDPOINTS.SMART_CHAT, { 
        message,
        include_citations: true 
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Chat failed');
    }
  }

  async getChatHistory(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.CHAT_HISTORY);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch chat history');
    }
  }

  // Forms
  async getForms(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.FORMS);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch forms');
    }
  }

  async createForm(form: any): Promise<ApiResponse> {
    try {
      const response = await this.client.post(API_ENDPOINTS.FORMS, form);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to create form');
    }
  }

  async updateForm(id: number, form: any): Promise<ApiResponse> {
    try {
      const response = await this.client.put(API_ENDPOINTS.FORMS_BY_ID(id), form);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update form');
    }
  }

  async deleteForm(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(API_ENDPOINTS.FORMS_BY_ID(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete form');
    }
  }

  async getFormResponses(id: number): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.FORM_RESPONSES(id));
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch form responses');
    }
  }

  // Documents (alias for files for consistency with web app)
  async getDocuments(page = 1, perPage = 20, search?: string, category?: string): Promise<ApiResponse> {
    return this.getFiles(page, perPage, search, category);
  }

  // Dashboard Stats
  async getDashboardStats(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.DASHBOARD_ANALYTICS);
      return response.data;
    } catch (error: any) {
      // Return mock data on failure for development
      return {
        success: true,
        data: {
          totalDocuments: 0,
          totalForms: 0,
          recentUploads: 0,
          formResponses: 0,
          chatSessions: 0,
          processingFiles: 0,
        }
      };
    }
  }

  // User Profile
  async getUserProfile(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.USER);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch user profile');
    }
  }

  async updateUserProfile(data: any): Promise<ApiResponse> {
    try {
      const response = await this.client.put(API_ENDPOINTS.USER_UPDATE, data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update user profile');
    }
  }

  // Analytics
  async getAnalytics(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.ANALYTICS);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch analytics');
    }
  }

  // Workspaces
  async getWorkspaces(): Promise<ApiResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.WORKSPACES);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch workspaces');
    }
  }

  // Health check
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