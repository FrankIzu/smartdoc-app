// HMS package temporarily disabled for deployment
// All HMS functionality is handled via backend API calls

import { HMSAuthTokenRequest, hmsBackendService } from './hmsBackendService';

// HMS Configuration - Mobile app gets credentials from backend
// The actual HMS credentials are stored in manager-francis/.env and used by the backend
// Mobile app only needs to know the domain and room prefix for UI purposes
const HMS_CONFIG = {
  // These values are NOT used directly by mobile app
  // They are used by the backend (manager-francis/.env) when mobile calls these APIs:
  // - /api/v1/mobile/meetings/hms-token (uses HMS_APP_ID, HMS_APP_SECRET from manager-francis/.env)
  // - /api/v1/mobile/meetings/hms-room (uses HMS_TEMPLATE_ID_MOBILE from manager-francis/.env)
  APP_ID: 'Used by backend from manager-francis/.env',
  APP_SECRET: 'Used by backend from manager-francis/.env', 
  TEMPLATE_ID: 'Used by backend from manager-francis/.env HMS_TEMPLATE_ID_MOBILE',
  DOMAIN: 'prod.100ms.live', // Standard 100ms domain
  ROOM_PREFIX: 'grabdocs-mobile' // Mobile-specific room prefix
};

// Note: HMS credentials are managed by the backend (manager-francis/.env)
// Mobile app authenticates via backend API calls, not direct HMS credentials

export interface HMSMeetingConfig {
  roomCode: string;
  userName: string;
  userId?: string;
  role?: string;
  enableAudio?: boolean;
  enableVideo?: boolean;
}

export interface HMSMeetingState {
  isConnected: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  participants: any[];
  room: any | null; // Backend room data, not HMSRoom object
  error: string | null;
}

class HMSService {
  private room: any | null = null;
  private listeners: Map<string, Function> = new Map();
  private meetingState: HMSMeetingState = {
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
    participants: [],
    room: null,
    error: null
  };

  /**
   * Initialize HMS SDK
   */
  async initialize(): Promise<void> {
    try {
      // HMS package is temporarily disabled for deployment
      console.warn('⚠️ HMS native module not available - running in development mode');
      return;
    } catch (error) {
      console.error('Failed to initialize HMS Service:', error);
      throw error;
    }
  }

  /**
   * Join a meeting room via backend
   */
  async joinMeeting(config: HMSMeetingConfig): Promise<void> {
    try {
      // Call backend to create/join room (same as web)
      const roomData = await hmsBackendService.createOrJoinRoom({
        roomCode: config.roomCode,
        userName: config.userName,
        role: config.role || 'viewer',
        userId: config.userId
      });

      // Mobile only handles display - backend manages room creation/joining
      this.updateMeetingState({
        isConnected: true,
        room: roomData, // Backend returns room info
        error: null
      });

      console.log('Successfully joined HMS meeting via backend:', roomData.roomCode);
    } catch (error) {
      console.error('Failed to join HMS meeting:', error);
      this.updateMeetingState({
        error: error instanceof Error ? error.message : 'Failed to join meeting'
      });
      throw error;
    }
  }

  /**
   * Leave the current meeting via backend
   */
  async leaveMeeting(): Promise<void> {
    try {
      if (this.meetingState.room) {
        // Call backend to leave room (same as web)
        await hmsBackendService.leaveRoom(this.meetingState.room.roomCode);
        
        this.updateMeetingState({
          isConnected: false,
          room: null,
          participants: []
        });

        console.log('Successfully left HMS meeting via backend');
      }
    } catch (error) {
      console.error('Failed to leave HMS meeting:', error);
      throw error;
    }
  }

  /**
   * Toggle audio mute/unmute via backend
   */
  async toggleAudio(): Promise<void> {
    try {
      if (this.meetingState.room) {
        const newAudioState = !this.meetingState.isAudioEnabled;
        await hmsBackendService.toggleAudio(this.meetingState.room.roomCode, newAudioState);
        
        this.updateMeetingState({
          isAudioEnabled: newAudioState
        });
      }
    } catch (error) {
      console.error('Failed to toggle audio:', error);
      throw error;
    }
  }

  /**
   * Toggle video on/off via backend
   */
  async toggleVideo(): Promise<void> {
    try {
      if (this.meetingState.room) {
        const newVideoState = !this.meetingState.isVideoEnabled;
        await hmsBackendService.toggleVideo(this.meetingState.room.roomCode, newVideoState);
        
        this.updateMeetingState({
          isVideoEnabled: newVideoState
        });
      }
    } catch (error) {
      console.error('Failed to toggle video:', error);
      throw error;
    }
  }

  /**
   * Get current meeting state
   */
  getMeetingState(): HMSMeetingState {
    return { ...this.meetingState };
  }

  /**
   * Subscribe to meeting state changes
   */
  subscribeToStateChanges(callback: (state: HMSMeetingState) => void): string {
    const listenerId = Date.now().toString();
    this.listeners.set(listenerId, callback);
    return listenerId;
  }

  /**
   * Unsubscribe from meeting state changes
   */
  unsubscribeFromStateChanges(listenerId: string): void {
    this.listeners.delete(listenerId);
  }

  /**
   * Generate auth token for HMS using backend service
   */
  private async generateAuthToken(config: HMSMeetingConfig): Promise<string> {
    try {
      const tokenRequest: HMSAuthTokenRequest = {
        roomCode: config.roomCode,
        userName: config.userName,
        role: config.role || 'viewer',
        userId: config.userId
      };

      return await hmsBackendService.generateAuthToken(tokenRequest);
    } catch (error) {
      console.error('Failed to generate auth token:', error);
      throw new Error('Failed to generate authentication token. Please check your connection and try again.');
    }
  }

  /**
   * Generate a unique room code
   */
  private generateRoomCode(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${HMS_CONFIG.ROOM_PREFIX}-${timestamp}-${random}`;
  }

  /**
   * Generate a unique user ID
   */
  private generateUserId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Set up room event listeners - handled by backend
   */
  private setupRoomListeners(): void {
    // Event listeners are handled by backend webhooks
    // Mobile only receives updates via backend API calls
    console.log('Room listeners handled by backend webhooks');
  }

  /**
   * Update meeting state and notify listeners
   */
  private updateMeetingState(updates: Partial<HMSMeetingState>): void {
    this.meetingState = { ...this.meetingState, ...updates };
    
    // Notify all listeners
    this.listeners.forEach(callback => {
      try {
        callback(this.meetingState);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }
}

// Export singleton instance
export const hmsService = new HMSService();
export default hmsService;
