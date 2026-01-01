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
import { hmsBackendService } from './hmsBackendService';
import { useAuth } from '../context/auth';

// HMS package - enabled for local testing
// All HMS functionality is handled via backend API calls
console.log('📱 HMS Prebuilt Interface - Loading HMS package');

// Import HMS components
let HMSPrebuilt: any = null;
let HMSConfig: any = null;

try {
  // Try to import HMS Room Kit (prebuilt UI) - requires native module
  // For localhost testing, you need a development build
  const roomKitPackage = require('@100mslive/react-native-room-kit');
  if (roomKitPackage && roomKitPackage.HMSPrebuilt) {
    HMSPrebuilt = roomKitPackage.HMSPrebuilt;
    console.log('📱 HMS Room Kit (Prebuilt) loaded successfully');
  } else {
    console.log('📱 HMS Room Kit imported but HMSPrebuilt not found');
  }
  
  // Also import HMS SDK for config if needed
  try {
    const hmsSDK = require('@100mslive/react-native-hms');
    HMSConfig = hmsSDK.HMSConfig;
  } catch (sdkError) {
    console.log('📱 HMS SDK not available (optional)');
  }
} catch (error: any) {
  console.log('📱 HMS Room Kit not available:', error?.message || error);
  console.log('📱 This is expected if:');
  console.log('   1. Package not installed: npm install @100mslive/react-native-room-kit');
  console.log('   2. Dev build created before package install (rebuild needed)');
  console.log('   3. Native module not properly linked');
  // Will fall back to development mode UI
}

export default function HMSMeetingInterfaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { meetingId, title, userName } = params;
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

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
      
      // Generate auth token from backend
      try {
        const token = await hmsBackendService.generateAuthToken({
          roomCode: meetingId as string,
          userName: (userName as string) || user?.name || 'Mobile User',
          role: 'host', // or 'viewer' based on your needs
          userId: user?.id?.toString()
        });
        setAuthToken(token);
        console.log('📱 HMS auth token generated successfully');
      } catch (tokenError: any) {
        // 405 means endpoint doesn't exist - backend needs to implement it
        if (tokenError?.response?.status === 405) {
          console.warn('⚠️ HMS token endpoint not implemented (405): /api/v1/mobile/meetings/hms-token');
          console.warn('⚠️ Backend needs to implement this endpoint for HMS to work');
        } else {
          console.error('Failed to generate HMS auth token:', tokenError?.message || tokenError);
        }
        // Continue anyway - might work without token in some cases
        console.log('📱 Continuing without auth token (may work for testing)');
      }
      
      // Check if HMS Prebuilt is available
      if (!HMSPrebuilt) {
        console.log('📱 100ms Prebuilt not available - showing development mode');
        console.log('📱 To test with full functionality:');
        console.log('   1. Install HMS package: npm install @100mslive/react-native-hms');
        console.log('   2. Create a development build (not Expo Go)');
        console.log('   3. Ensure backend HMS endpoints are configured');
        // Don't set error - show development mode UI instead
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
  if (HMSPrebuilt && HMSConfig && authToken) {
    return (
      <SafeAreaView style={styles.container}>
        <HMSPrebuilt
          config={{
            roomCode: meetingId as string,
            userName: (userName as string) || user?.name || 'Mobile User',
            authToken: authToken,
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
            The 100ms Prebuilt Interface requires a development build (not Expo Go).
          </Text>
          <Text style={styles.developmentText}>
            To test with an existing meeting:
          </Text>
          <Text style={[styles.developmentText, { marginTop: 12, fontWeight: '600' }]}>
            1. Install: npm install @100mslive/react-native-hms
          </Text>
          <Text style={[styles.developmentText, { fontWeight: '600' }]}>
            2. Create dev build: npx expo run:android or npx expo run:ios
          </Text>
          <Text style={[styles.developmentText, { fontWeight: '600' }]}>
            3. Ensure backend HMS endpoints are configured
          </Text>
          <Text style={[styles.developmentText, { marginTop: 12 }]}>
            Meeting ID: {meetingId}
          </Text>
          {authToken && (
            <Text style={[styles.developmentText, { marginTop: 8, fontSize: 12 }]}>
              Auth token generated ✓
            </Text>
          )}
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