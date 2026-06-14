import { apiClient } from '../../services/api';

export interface HMSAuthTokenRequest {
  roomCode: string;
  userName: string;
  role?: string;
  userId?: string;
}

export interface HMSRoomRequest {
  roomCode?: string;
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
      console.log('📱 [HMS] Requesting token from backend:', {
        roomCode: request.roomCode,
        userName: request.userName,
        role: request.role
      });
      
      const response = await apiClient.client.post<HMSAuthTokenResponse>(
        '/api/v1/mobile/meetings/hms-token',
        request
      );

      console.log('📱 [HMS] Backend response:', {
        success: response.data.success,
        hasToken: !!response.data.token,
        tokenLength: response.data.token?.length || 0,
        roomCode: response.data.roomCode,
        message: response.data.message
      });

      if (response.data.success && response.data.token) {
        const token = response.data.token;
        console.log('📱 [HMS] Token received successfully, length:', token.length);
        console.log('📱 [HMS] Token preview:', token.substring(0, 50) + '...');
        return token;
      } else {
        console.error('📱 [HMS] Invalid response:', response.data);
        throw new Error(response.data.message || 'Failed to generate auth token');
      }
    } catch (error: any) {
      console.error('📱 [HMS] Failed to generate auth token:', error);
      console.error('📱 [HMS] Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status
      });
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
   * Join HMS room using existing meeting ID.
   * @deprecated Legacy single-shot path — active Prebuilt flow uses prepareVideoJoinById in hms-meeting-interface.
   */
  async createOrJoinRoom(request: HMSRoomRequest): Promise<any> {
    try {
      // Use the existing join endpoint instead of the non-existent create-or-join
      const response = await apiClient.client.post('/api/v1/mobile/meetings/join', {
        meetingId: request.roomCode,
        passcode: '' // No passcode for now
      });
      
      if (response.data.success) {
        // Return the meeting data in the expected format
        return {
          roomCode: request.roomCode,
          roomUrl: response.data.data?.roomUrl || `https://daily.co/room/${request.roomCode}`,
          title: response.data.data?.title || `Meeting ${request.roomCode}`,
          meetingId: request.roomCode
        };
      } else {
        throw new Error(response.data.message || 'Failed to join room');
      }
    } catch (error) {
      console.error('Failed to join HMS room:', error);
      throw error;
    }
  }

  /**
   * Leave HMS room (same as web)
   */
  async leaveRoom(roomCode: string): Promise<void> {
    try {
      await apiClient.client.post(`/api/v1/mobile/meetings/${roomCode}/leave`);
    } catch (error) {
      console.error('Failed to leave HMS room:', error);
      throw error;
    }
  }

  /**
   * Toggle audio via backend
   */
  async toggleAudio(roomCode: string, enabled: boolean): Promise<void> {
    try {
      await apiClient.client.post(`/api/v1/mobile/meetings/${roomCode}/audio`, { enabled });
    } catch (error) {
      console.error('Failed to toggle audio:', error);
      throw error;
    }
  }

  /**
   * Toggle video via backend
   */
  async toggleVideo(roomCode: string, enabled: boolean): Promise<void> {
    try {
      await apiClient.client.post(`/api/v1/mobile/meetings/${roomCode}/video`, { enabled });
    } catch (error) {
      console.error('Failed to toggle video:', error);
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
