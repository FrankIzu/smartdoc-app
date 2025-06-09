import axios, { AxiosInstance, AxiosResponse } from 'axios';

const API_BASE_URL = 'http://localhost:5000';

// API client configuration
class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL: baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Include cookies for session management
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log('📡 API Request:', config.method?.toUpperCase(), config.url);
        return config;
      },
      (error) => {
        console.error('📡 Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log('✅ API Response:', response.status, response.config.url);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error('❌ API Error Response:', error.response.status, error.response.data);
        } else if (error.request) {
          console.error('❌ API Network Error:', error.message);
        } else {
          console.error('❌ API Setup Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  // Generic request method (publicly accessible)
  async makeRequest(endpoint: string, options: any = {}): Promise<any> {
    try {
      const { method = 'GET', data, ...axiosOptions } = options;
      const response = await this.client.request({
        url: endpoint,
        method,
        data,
        ...axiosOptions,
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(error.response.data?.message || `HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('Network error: Unable to reach the server');
      } else {
        throw new Error('Request setup error: ' + error.message);
      }
    }
  }

  // Authentication endpoints
  async login(credentials: { username: string; password: string }) {
    console.log('🔄 Attempting login with:', { username: credentials.username });
    console.log('📡 API URL:', `${this.client.defaults.baseURL}/api/login`);
    
    try {
      const response = await this.client.post('/api/login', credentials);
      console.log('✅ Login successful:', response.data);
      return response.data;
    } catch (error: any) {
      console.log('❌ Login error:', error);
      
      // Enhanced error handling for better UX
      if (error.response?.status === 500) {
        console.log('❌ Error response:', error.response?.data || 'No response data');
        console.log('❌ Error status:', error.response?.status);
        throw new Error('Server error occurred. Please try again later.');
      } else if (error.response?.status === 401) {
        throw new Error('Invalid username or password.');
      } else if (!error.response) {
        throw new Error('Network error. Please check your connection and try again.');
      }
      
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  }

  async signup(userData: {
    username: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) {
    try {
      const response = await this.client.post('/api/signup', userData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Signup failed');
    }
  }

  async logout() {
    try {
      const response = await this.client.post('/api/logout');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Logout failed');
    }
  }

  async checkAuth() {
    try {
      const response = await this.client.get('/api/auth-check');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Auth check failed');
    }
  }

  // Document endpoints
  async getDocuments(params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    file_type?: string;
  }) {
    try {
      const response = await this.client.get('/api/files', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch documents');
    }
  }

  async uploadFiles(files: File[], uploadLinkId?: string) {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    
    if (uploadLinkId) {
      formData.append('upload_link_id', uploadLinkId);
    }

    try {
      const response = await this.client.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Upload failed');
    }
  }

  async deleteFile(fileId: number) {
    try {
      const response = await this.client.delete(`/api/files/${fileId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Delete failed');
    }
  }

  async downloadFile(fileId: number) {
    const url = `${this.client.defaults.baseURL}/api/files/${fileId}/download`;
    window.open(url, '_blank');
  }

  // AI Chat endpoints
  async getChatHistory(fileIds?: number[]) {
    try {
      const params = fileIds && fileIds.length > 0 ? { file_ids: fileIds } : {};
      const response = await this.client.get('/api/chat/history', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch chat history');
    }
  }

  async sendChatMessage(message: string, fileIds?: number[]) {
    try {
      const response = await this.client.post('/api/chat', {
        message,
        file_ids: fileIds || [],
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to send message');
    }
  }

  // Forms endpoints
  async getForms() {
    try {
      const response = await this.client.get('/api/forms');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch forms');
    }
  }

  async createForm(formData: {
    name: string;
    description?: string;
    fields: any[];
    is_public?: boolean;
    category?: string;
  }) {
    try {
      const response = await this.client.post('/api/forms', formData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to create form');
    }
  }

  async updateForm(formId: number, formData: any) {
    try {
      const response = await this.client.put(`/api/forms/${formId}`, formData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update form');
    }
  }

  async deleteForm(formId: number) {
    try {
      const response = await this.client.delete(`/api/forms/${formId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete form');
    }
  }

  // User profile endpoints
  async getUserProfile() {
    try {
      const response = await this.client.get('/api/user');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch user profile');
    }
  }

  async updateUserProfile(profileData: {
    first_name?: string;
    last_name?: string;
    email?: string;
  }) {
    try {
      const response = await this.client.put('/api/user/profile', profileData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update profile');
    }
  }

  async updateUserTheme(theme: 'light' | 'dark' | 'system') {
    try {
      const response = await this.client.put('/api/user/theme', { theme });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update theme');
    }
  }

  // Analytics endpoints
  async getAnalytics() {
    try {
      const response = await this.client.get('/api/analytics');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch analytics');
    }
  }

  async getDashboardStats() {
    try {
      const response = await this.client.get('/api/dashboard/stats');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch dashboard stats');
    }
  }

  async getCategories() {
    try {
      const response = await this.client.get('/api/categories');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch categories');
    }
  }

  async categorizeReceipts(fileIds: number[], autoApply: boolean = false) {
    try {
      const response = await this.client.post('/api/receipts/categorize', {
        file_ids: fileIds,
        auto_apply: autoApply,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to categorize receipts');
    }
  }

  // Health check endpoint
  async healthCheck() {
    try {
      const response = await this.client.get('/api/health');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Health check failed');
    }
  }
}

// Create and export a singleton instance
export const apiClient = new ApiClient();

// Export types for better TypeScript support
export interface Document {
  id: number;
  original_filename: string;
  filename?: string;
  file_type: string;
  file_size: number;
  file_kind?: string;
  created_at: string;
  receipt_category?: string;
  json_data?: any;
  upload_link_id?: string;
}

export interface ChatMessage {
  id: string;
  message: string;
  response?: string;
  timestamp: string;
  file_ids?: number[];
  citations?: Array<{
    filename: string;
    confidence: number;
    page?: number;
  }>;
}

export interface FormField {
  id: string;
  type: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date';
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface Form {
  id: number;
  name: string;
  description?: string;
  fields: FormField[];
  is_public: boolean;
  category?: string;
  created_at: string;
  response_count?: number;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  theme_preference?: 'light' | 'dark' | 'system';
  created_at: string;
}

export default apiClient; 