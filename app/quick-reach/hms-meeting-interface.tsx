// 100ms Prebuilt Interface Implementation
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// HMS package temporarily disabled for deployment
// All HMS functionality is handled via backend API calls
console.log('📱 HMS Prebuilt Interface temporarily disabled for deployment');

// Import HMS components (will be undefined in development mode)
let HMSPrebuilt: any = null;
let HMSConfig: any = null;

try {
  // In production builds, these would be imported from the HMS package
  // HMSPrebuilt = require('@100mslive/react-native-hms').HMSPrebuilt;
  // HMSConfig = require('@100mslive/react-native-hms').HMSConfig;
} catch (error) {
  console.log('📱 HMS package not available:', error);
}

export default function HMSMeetingInterfaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { meetingId, title, userName } = params;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debug logging
  console.log('📱 100ms Prebuilt Interface - Received params:', {
    meetingId,
    title,
    userName,
    allParams: params
  });

  useEffect(() => {
    initializePrebuiltInterface();
  }, []);

  const initializePrebuiltInterface = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if meetingId is provided
      if (!meetingId) {
        console.error('❌ No meetingId provided to 100ms Prebuilt Interface');
        setError('No meeting ID provided. Please try joining the meeting again from the meeting list.');
        return;
      }

      console.log('📱 Initializing 100ms Prebuilt Interface with meeting ID:', meetingId);
      
      // For development mode, we'll show a placeholder
      if (!HMSPrebuilt) {
        console.log('📱 100ms Prebuilt not available - showing development mode');
        setError('100ms Prebuilt Interface not available in development mode. Please use a development build for full functionality.');
        return;
      }

      // In production, this would initialize the prebuilt interface
      console.log('📱 100ms Prebuilt Interface initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize 100ms Prebuilt Interface:', error);
      setError('Failed to initialize meeting interface. Please try again.');
    } finally {
      setIsLoading(false);
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
          onPress: () => router.back()
        }
      ]
    );
  };

  // Check if meetingId is missing
  if (!meetingId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Missing Meeting ID</Text>
          <Text style={styles.errorMessage}>
            No meeting ID was provided. Please try joining the meeting again from the meeting list.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Initializing 100ms Prebuilt Interface...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>100ms Prebuilt Interface</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializePrebuiltInterface}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 100ms Prebuilt Interface
  if (HMSPrebuilt && HMSConfig) {
    return (
      <SafeAreaView style={styles.container}>
        <HMSPrebuilt
          config={{
            roomCode: meetingId as string,
            userName: (userName as string) || 'Mobile User',
            // Add other HMS configuration as needed
          }}
          onLeave={handleLeaveMeeting}
          style={styles.prebuiltContainer}
        />
      </SafeAreaView>
    );
  }

  // Development mode fallback
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.developmentContainer}>
        <Text style={styles.developmentTitle}>100ms Prebuilt Interface</Text>
        <Text style={styles.developmentSubtitle}>Development Mode</Text>
        
        <View style={styles.meetingInfo}>
          <Text style={styles.meetingInfoLabel}>Meeting ID:</Text>
          <Text style={styles.meetingInfoValue}>{meetingId}</Text>
          
          <Text style={styles.meetingInfoLabel}>Title:</Text>
          <Text style={styles.meetingInfoValue}>{title || 'Meeting'}</Text>
          
          <Text style={styles.meetingInfoLabel}>User:</Text>
          <Text style={styles.meetingInfoValue}>{userName || 'Mobile User'}</Text>
        </View>

        <View style={styles.developmentMessage}>
          <Text style={styles.developmentText}>
            The 100ms Prebuilt Interface is not available in Expo Go development mode.
          </Text>
          <Text style={styles.developmentText}>
            To test the full functionality, you need to create a development build with the HMS native module.
          </Text>
        </View>

        <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveMeeting}>
          <Text style={styles.leaveButtonText}>Leave Meeting</Text>
        </TouchableOpacity>
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
  prebuiltContainer: {
    flex: 1,
  },
  developmentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#000',
  },
  developmentTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  developmentSubtitle: {
    fontSize: 18,
    color: '#007AFF',
    marginBottom: 40,
  },
  meetingInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    borderRadius: 12,
    marginBottom: 40,
    width: '100%',
  },
  meetingInfoLabel: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 12,
    marginBottom: 4,
  },
  meetingInfoValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  developmentMessage: {
    marginBottom: 40,
  },
  developmentText: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 12,
  },
  leaveButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  leaveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});