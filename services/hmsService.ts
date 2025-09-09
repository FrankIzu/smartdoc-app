import { HMSConfig, HMSRoom, HMSUpdateListenerActions } from '@100mslive/react-native-hms';
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
console.log('📱 HMS Service: Credentials managed by backend (manager-francis/.env)');

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
  room: HMSRoom | null;
  error: string | null;
}

class HMSService {
  private room: HMSRoom | null = null;
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
      // HMS SDK initialization is handled automatically when creating a room
      console.log('HMS Service initialized');
    } catch (error) {
      console.error('Failed to initialize HMS Service:', error);
      throw error;
    }
  }

  /**
   * Join a meeting room
   */
  async joinMeeting(config: HMSMeetingConfig): Promise<void> {
    try {
      // Create room code if not provided
      const roomCode = config.roomCode || this.generateRoomCode();
      
      // Create HMS configuration
      const hmsConfig: HMSConfig = {
        authToken: await this.generateAuthToken(config),
        username: config.userName,
        roomCode: roomCode,
        enableAudio: config.enableAudio !== false,
        enableVideo: config.enableVideo !== false,
        role: config.role || 'viewer'
      };

      // Create and join room
      this.room = new HMSRoom();
      
      // Set up room listeners
      this.setupRoomListeners();

      // Join the room
      await this.room.join(hmsConfig);
      
      this.updateMeetingState({
        isConnected: true,
        room: this.room,
        error: null
      });

      console.log('Successfully joined HMS meeting:', roomCode);
    } catch (error) {
      console.error('Failed to join HMS meeting:', error);
      this.updateMeetingState({
        error: error instanceof Error ? error.message : 'Failed to join meeting'
      });
      throw error;
    }
  }

  /**
   * Leave the current meeting
   */
  async leaveMeeting(): Promise<void> {
    try {
      if (this.room) {
        await this.room.leave();
        this.room = null;
        
        this.updateMeetingState({
          isConnected: false,
          room: null,
          participants: []
        });

        console.log('Successfully left HMS meeting');
      }
    } catch (error) {
      console.error('Failed to leave HMS meeting:', error);
      throw error;
    }
  }

  /**
   * Toggle audio mute/unmute
   */
  async toggleAudio(): Promise<void> {
    try {
      if (this.room && this.room.localPeer) {
        const newAudioState = !this.meetingState.isAudioEnabled;
        await this.room.localPeer.audioTrack?.setMute(!newAudioState);
        
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
   * Toggle video on/off
   */
  async toggleVideo(): Promise<void> {
    try {
      if (this.room && this.room.localPeer) {
        const newVideoState = !this.meetingState.isVideoEnabled;
        await this.room.localPeer.videoTrack?.setMute(!newVideoState);
        
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
   * Set up room event listeners
   */
  private setupRoomListeners(): void {
    if (!this.room) return;

    // Room joined
    this.room.addEventListener(HMSUpdateListenerActions.ON_JOIN, (data: any) => {
      console.log('Joined room:', data);
      this.updateMeetingState({
        isConnected: true,
        participants: data.peers || []
      });
    });

    // Room left
    this.room.addEventListener(HMSUpdateListenerActions.ON_ROOM_END, (data: any) => {
      console.log('Room ended:', data);
      this.updateMeetingState({
        isConnected: false,
        room: null,
        participants: []
      });
    });

    // Peer joined
    this.room.addEventListener(HMSUpdateListenerActions.ON_PEER_JOIN, (data: any) => {
      console.log('Peer joined:', data);
      this.updateMeetingState({
        participants: [...this.meetingState.participants, data.peer]
      });
    });

    // Peer left
    this.room.addEventListener(HMSUpdateListenerActions.ON_PEER_REMOVED, (data: any) => {
      console.log('Peer left:', data);
      this.updateMeetingState({
        participants: this.meetingState.participants.filter(
          (p: any) => p.id !== data.peer.id
        )
      });
    });

    // Audio/Video state changes
    this.room.addEventListener(HMSUpdateListenerActions.ON_AUDIO_CHANGED, (data: any) => {
      console.log('Audio changed:', data);
      if (data.peer.isLocal) {
        this.updateMeetingState({
          isAudioEnabled: data.enabled
        });
      }
    });

    this.room.addEventListener(HMSUpdateListenerActions.ON_VIDEO_CHANGED, (data: any) => {
      console.log('Video changed:', data);
      if (data.peer.isLocal) {
        this.updateMeetingState({
          isVideoEnabled: data.enabled
        });
      }
    });

    // Error handling
    this.room.addEventListener(HMSUpdateListenerActions.ON_ERROR, (error: any) => {
      console.error('HMS Room error:', error);
      this.updateMeetingState({
        error: error.message || 'Unknown error occurred'
      });
    });
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
