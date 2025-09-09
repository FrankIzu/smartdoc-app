import { HMSView } from '@100mslive/react-native-hms';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HMSMeetingConfig, HMSMeetingState, hmsService } from '../../services/hmsService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function HMSMeetingInterfaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { meetingId, title, userName } = params;

  const [meetingState, setMeetingState] = useState<HMSMeetingState>({
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
    participants: [],
    room: null,
    error: null
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeMeeting();
    
    // Subscribe to meeting state changes
    const listenerId = hmsService.subscribeToStateChanges((state) => {
      setMeetingState(state);
    });

    return () => {
      hmsService.unsubscribeFromStateChanges(listenerId);
      leaveMeeting();
    };
  }, []);

  const initializeMeeting = async () => {
    try {
      setIsLoading(true);
      
      // Initialize HMS service
      await hmsService.initialize();

      // Configure meeting - use meetingId as roomCode for HMS
      const meetingConfig: HMSMeetingConfig = {
        roomCode: meetingId as string,
        userName: (userName as string) || 'Mobile User',
        enableAudio: true,
        enableVideo: true,
        role: 'viewer' // or 'host' based on your logic
      };

      // Join the meeting
      await hmsService.joinMeeting(meetingConfig);
      
      console.log('📱 Successfully joined HMS meeting:', meetingId);
      
    } catch (error) {
      console.error('Failed to initialize HMS meeting:', error);
      Alert.alert(
        'Meeting Error',
        'Failed to join the meeting. Please check your connection and try again.',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const leaveMeeting = async () => {
    try {
      await hmsService.leaveMeeting();
    } catch (error) {
      console.error('Failed to leave meeting:', error);
    }
  };

  const toggleAudio = async () => {
    try {
      await hmsService.toggleAudio();
    } catch (error) {
      console.error('Failed to toggle audio:', error);
      Alert.alert('Error', 'Failed to toggle audio');
    }
  };

  const toggleVideo = async () => {
    try {
      await hmsService.toggleVideo();
    } catch (error) {
      console.error('Failed to toggle video:', error);
      Alert.alert('Error', 'Failed to toggle video');
    }
  };

  const handleLeaveMeeting = () => {
    Alert.alert(
      'Leave Meeting',
      'Are you sure you want to leave the meeting?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Leave', 
          style: 'destructive', 
          onPress: () => {
            leaveMeeting();
            router.back();
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Joining meeting...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (meetingState.error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF3B30" />
          <Text style={styles.errorTitle}>Meeting Error</Text>
          <Text style={styles.errorMessage}>{meetingState.error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeMeeting}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.meetingTitle} numberOfLines={1}>
            {title || 'Meeting'}
          </Text>
          <Text style={styles.connectionStatus}>
            {meetingState.isConnected ? 'Connected' : 'Connecting...'}
          </Text>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={() => {}}>
          <Ionicons name="settings" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* HMS Video View */}
      <View style={styles.videoContainer}>
        {meetingState.room && (
          <HMSView
            room={meetingState.room}
            style={styles.hmsView}
            autoManageCamera={true}
            autoManageMicrophone={true}
          />
        )}
        
        {!meetingState.isConnected && (
          <View style={styles.connectingOverlay}>
            <Text style={styles.connectingText}>Connecting to meeting...</Text>
          </View>
        )}
      </View>

      {/* Meeting Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            !meetingState.isAudioEnabled && styles.controlButtonDisabled
          ]}
          onPress={toggleAudio}
        >
          <Ionicons 
            name={meetingState.isAudioEnabled ? "mic" : "mic-off"} 
            size={24} 
            color={meetingState.isAudioEnabled ? "#fff" : "#FF3B30"} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            !meetingState.isVideoEnabled && styles.controlButtonDisabled
          ]}
          onPress={toggleVideo}
        >
          <Ionicons 
            name={meetingState.isVideoEnabled ? "videocam" : "videocam-off"} 
            size={24} 
            color={meetingState.isVideoEnabled ? "#fff" : "#FF3B30"} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {}}
        >
          <Ionicons name="chatbubble" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {}}
        >
          <Ionicons name="people" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.leaveButton]}
          onPress={handleLeaveMeeting}
        >
          <Ionicons name="call" size={24} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      {/* Participants Count */}
      <View style={styles.participantsInfo}>
        <Text style={styles.participantsText}>
          {meetingState.participants.length} participant{meetingState.participants.length !== 1 ? 's' : ''}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#000',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  connectionStatus: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 2,
  },
  settingsButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  hmsView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  connectingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  connectingText: {
    color: '#fff',
    fontSize: 18,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    gap: 20,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonDisabled: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
  },
  leaveButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
  },
  participantsInfo: {
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
  },
  participantsText: {
    color: '#ccc',
    fontSize: 14,
  },
});
