import { apiClient } from './api';

export interface HMSAuthTokenRequest {
  roomCode: string;
  userName: string;
  role?: string;
  userId?: string;
}

export interface HMSAuthTokenResponse {
  success: boolean;
  token?: string;
  roomCode?: string;
  message?: string;
}

class HMSBackendService {
  /**
   * Generate HMS auth token from backend
   */
  async generateAuthToken(request: HMSAuthTokenRequest): Promise<string> {
    try {
      const response = await apiClient.client.post<HMSAuthTokenResponse>(
        '/api/v1/mobile/meetings/hms-token',
        request
      );

      if (response.data.success && response.data.token) {
        return response.data.token;
      } else {
        throw new Error(response.data.message || 'Failed to generate auth token');
      }
    } catch (error) {
      console.error('Failed to generate HMS auth token:', error);
      throw error;
    }
  }

  /**
   * Create a new HMS room
   */
  async createHMSRoom(roomName: string, templateId?: string): Promise<{ roomCode: string; roomId: string }> {
    try {
      const response = await apiClient.client.post('/api/v1/mobile/meetings/hms-room', {
        roomName,
        templateId: templateId || 'HMS_TEMPLATE_ID_MOBILE' // Use mobile-specific template ID
      });

      if (response.data.success) {
        return {
          roomCode: response.data.roomCode,
          roomId: response.data.roomId
        };
      } else {
        throw new Error(response.data.message || 'Failed to create HMS room');
      }
    } catch (error) {
      console.error('Failed to create HMS room:', error);
      throw error;
    }
  }

  /**
   * Get HMS room details
   */
  async getHMSRoomDetails(roomCode: string): Promise<any> {
    try {
      const response = await apiClient.client.get(`/api/v1/mobile/meetings/hms-room/${roomCode}`);

      if (response.data.success) {
        return response.data.room;
      } else {
        throw new Error(response.data.message || 'Failed to get room details');
      }
    } catch (error) {
      console.error('Failed to get HMS room details:', error);
      throw error;
    }
  }

  /**
   * End HMS room
   */
  async endHMSRoom(roomCode: string): Promise<void> {
    try {
      await apiClient.client.post(`/api/v1/mobile/meetings/hms-room/${roomCode}/end`);
    } catch (error) {
      console.error('Failed to end HMS room:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const hmsBackendService = new HMSBackendService();
export default hmsBackendService;
