// 100ms Prebuilt Interface Implementation
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import {
  Alert, Linking, Platform, StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorLogger } from '../../services/errorLogger';
import { useAuth } from '../context/auth';
import { hmsBackendService } from './hmsBackendService';

// HMS package - enabled for local testing
// All HMS functionality is handled via backend API calls
// Note: HMS is native-only, skip imports on web platform and Expo Go

// Import HMS components (native platforms only)
let HMSPrebuilt: any = null;
let HMSConfig: any = null;

// Only try to import HMS on native platforms (not web) and in development builds (not Expo Go)
// HMS requires native modules that don't work in Expo Go
if (Platform.OS !== 'web') {
  try {
    // Check if we're in Expo Go (HMS won't work)
    const Constants = require('expo-constants').default;
    const isExpoGo = Constants.appOwnership === 'expo';
    
    if (isExpoGo) {
      // Silently skip HMS in Expo Go - it requires a development build
      // The error will be handled gracefully in the component
    } else {
      // Try to import HMS Room Kit (prebuilt UI) - requires native module
      // For localhost testing, you need a development build
      const roomKitPackage = require('@100mslive/react-native-room-kit');
      if (roomKitPackage && roomKitPackage.HMSPrebuilt) {
        HMSPrebuilt = roomKitPackage.HMSPrebuilt;
        console.log('📱 HMS Room Kit (Prebuilt) loaded successfully');
      }
      
      // HMS SDK is a peer dependency of room-kit but not required for prebuilt UI
      // Only import if needed for advanced configuration
      try {
        const hmsSDK = require('@100mslive/react-native-hms');
        HMSConfig = hmsSDK.HMSConfig;
      } catch (sdkError) {
        // Silently ignore - SDK is optional
      }
    }
  } catch (error: any) {
    // Silently handle HMS import errors - expected in Expo Go
    // The component will handle the missing module gracefully
  }
}

// Error Boundary Component for HMS Prebuilt
class HMSErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('📱 HMS Error Boundary caught error:', error, errorInfo);
    // Log error to backend
    errorLogger.logError(error, {
      severity: 'error',
      screenName: 'HMSMeetingInterface',
      userAction: 'HMS Error Boundary',
      errorType: 'HMSErrorBoundary',
    });
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null; // Let parent handle error display
    }
    return this.props.children;
  }
}

export default function HMSMeetingInterfaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { meetingId, title, userName } = params;
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [hmsError, setHmsError] = useState<string | null>(null);
  const [hmsInitializing, setHmsInitializing] = useState(false);
  const [hmsInitTimeout, setHmsInitTimeout] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null);
  const [joinConfig, setJoinConfig] = useState<any>(null);

  // Debug logging
  console.log('📱 100ms Prebuilt Interface - Received params:', {
    meetingId,
    title,
    userName,
    allParams: params
  });

  useEffect(() => {
    // Check permissions first, then initialize
    const init = async () => {
      console.log('📱 [HMS] Starting initialization sequence...');
      try {
        // Check permissions and get result directly
        let permissionsOk = false;
        if (Platform.OS === 'web') {
          permissionsOk = true;
          setPermissionsGranted(true);
        } else {
          // Check permissions directly
          try {
            const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
            let audioStatus = { status: 'granted' as const };
            try {
              const audioPermission = await Audio.requestPermissionsAsync();
              audioStatus = audioPermission;
            } catch (audioError) {
              console.warn('⚠️ [HMS] Could not request audio permissions:', audioError);
            }
            
            permissionsOk = cameraStatus.status === 'granted' && audioStatus.status === 'granted';
            setPermissionsGranted(permissionsOk);
            
            console.log('📱 [HMS] Permissions check result:', {
              camera: cameraStatus.status,
              audio: audioStatus.status,
              granted: permissionsOk
            });
          } catch (permError) {
            console.error('📱 [HMS] Error checking permissions:', permError);
            permissionsOk = false;
            setPermissionsGranted(false);
          }
        }
        
        // Initialize based on permissions
        if (permissionsOk) {
          console.log('✅ [HMS] Permissions granted, initializing...');
          // Small delay to ensure state is set
          setTimeout(() => {
    initializePrebuiltInterface();
          }, 100);
        } else {
          console.warn('⚠️ [HMS] Permissions denied, showing error');
          setIsLoading(false);
          setError('Camera and microphone permissions are required. Please enable them in Settings.');
        }
      } catch (error: any) {
        console.error('❌ [HMS] Initialization sequence error:', error);
        setIsLoading(false);
        setError('Failed to initialize meeting. Please try again.');
        errorLogger.logError(error, {
          severity: 'error',
          screenName: 'HMSMeetingInterface',
          userAction: 'Initialization Sequence',
          errorType: 'HMSInitSequenceError',
          userId: user?.id,
        });
      }
    };
    init();
  }, []);

  // Check camera and microphone permissions
  const checkPermissions = async () => {
    try {
      if (Platform.OS !== 'web') {
        const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
        let audioStatus = { status: 'granted' as const };
        
        // Request audio permissions using expo-av
        try {
          const audioPermission = await Audio.requestPermissionsAsync();
          audioStatus = audioPermission;
        } catch (audioError) {
          console.warn('⚠️ [HMS] Could not request audio permissions:', audioError);
          // Continue with camera permission check
        }
        
        const granted = cameraStatus.status === 'granted' && audioStatus.status === 'granted';
        setPermissionsGranted(granted);
        
        console.log('📱 [HMS] Permissions check:', {
          camera: cameraStatus.status,
          audio: audioStatus.status,
          allGranted: granted
        });
        
        if (!granted) {
          console.warn('⚠️ [HMS] Camera or microphone permission not granted');
          errorLogger.logError(
            new Error(`Permissions not granted: camera=${cameraStatus.status}, audio=${audioStatus.status}`),
            {
              severity: 'warning',
              screenName: 'HMSMeetingInterface',
              userAction: 'Check Permissions',
              errorType: 'HMSPermissionsDenied',
              userId: user?.id,
            }
          );
        }
      } else {
        setPermissionsGranted(true); // Web doesn't need explicit permissions
      }
    } catch (error: any) {
      console.error('📱 [HMS] Error checking permissions:', error);
      setPermissionsGranted(false);
      errorLogger.logError(error, {
        severity: 'warning',
        screenName: 'HMSMeetingInterface',
        userAction: 'Check Permissions',
        errorType: 'HMSPermissionCheckFailed',
        userId: user?.id,
      });
    }
  };

  // Timeout to detect if HMS gets stuck (black screen issue)
  // Since React Native HMSPrebuilt doesn't have onJoin callback,
  // we use a two-stage timeout:
  // 1. After 5 seconds, assume join is in progress and hide loading overlay
  // 2. After 20 seconds, if still initializing, show error
  useEffect(() => {
    if (hmsInitializing && authToken) {
      // Stage 1: Clear loading overlay after 5 seconds (assuming join is in progress)
      const successTimeoutId = setTimeout(() => {
        console.log('✅ [HMS] Assuming join successful after 5 seconds (HMSPrebuilt should be rendering)');
        setHmsInitializing(false); // Clear loading overlay
        setIsLoading(false);
        // Don't set error - component should be rendering by now
      }, 5000); // 5 seconds - enough time for HMS to start joining
      
      // Stage 2: Error timeout after 20 seconds
      const errorTimeoutId = setTimeout(() => {
        console.warn('📱 [HMS] Initialization timeout after 20 seconds - component may be stuck');
        console.warn('📱 [HMS] This usually means HMS Prebuilt failed to join');
        setHmsInitTimeout(true);
        setHmsInitializing(false);
        setIsLoading(false);
        setError('Meeting initialization timed out. Please check your connection and try again.');
        // Log timeout error
        errorLogger.logError(
          new Error('HMS initialization timeout - component failed to join'),
          {
            severity: 'error',
            screenName: 'HMSMeetingInterface',
            userAction: 'HMS Initialization Timeout',
            errorType: 'HMSInitializationTimeout',
            userId: user?.id,
            metadata: {
              meetingId: meetingId as string,
              hasAuthToken: !!authToken,
              authTokenLength: authToken?.length || 0,
            }
          }
        );
      }, 20000); // 20 second timeout
      
      return () => {
        clearTimeout(successTimeoutId);
        clearTimeout(errorTimeoutId);
      };
    }
  }, [hmsInitializing, authToken, meetingId, user?.id]);

  const initializePrebuiltInterface = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check permissions BEFORE initializing HMS
      if (Platform.OS !== 'web' && permissionsGranted === false) {
        console.warn('⚠️ [HMS] Cannot initialize - permissions denied');
        setError('Camera and microphone permissions are required to join the meeting. Please enable them in Settings.');
        setIsLoading(false);
        return;
      }

      // Check if meetingId is provided
      if (!meetingId) {
        console.error('❌ No meetingId provided to 100ms Prebuilt Interface');
        setError('No meeting ID provided. Please try joining the meeting again from the meeting list.');
        setIsLoading(false);
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
        if (!token) {
          throw new Error('Token generation returned empty token');
        }
        // Validate token format (should be a JWT)
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
          throw new Error('Token is empty or invalid');
        }
        
        // Basic JWT validation (should have 3 parts separated by dots)
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          console.warn('⚠️ [HMS] Token does not appear to be a valid JWT (expected 3 parts, got ' + tokenParts.length + ')');
        }
        
        setAuthToken(token);
        
        // HARD LOGGING - Right before joining (as suggested by ChatGPT)
        const displayUserName = (userName as string) || user?.name || 'Mobile User';
        const joinConfigData = {
          token: token,
          tokenLength: token.length,
          tokenPreview: token.substring(0, 50) + '...',
          tokenParts: tokenParts.length,
          roomId: meetingId,
          roomIdLength: (meetingId as string)?.length || 0,
          userName: displayUserName,
          userNameLength: displayUserName.length,
          userId: user?.id?.toString(),
          role: 'host',
          platform: Platform.OS,
          permissionsGranted: permissionsGranted,
          timestamp: new Date().toISOString(),
        };
        
        setJoinConfig(joinConfigData);
        
        console.log('🚀 [HMS] JOINING 100ms MEETING WITH:');
        console.log('=====================================');
        console.log('Token Length:', token.length);
        console.log('Token Preview:', token.substring(0, 50) + '...');
        console.log('Token Parts (JWT):', tokenParts.length);
        console.log('Room ID:', meetingId);
        console.log('Room ID Length:', (meetingId as string)?.length || 0);
        console.log('User Name:', displayUserName);
        console.log('User Name Length:', displayUserName.length);
        console.log('User ID:', user?.id?.toString());
        console.log('Role: host');
        console.log('Platform:', Platform.OS);
        console.log('Permissions Granted:', permissionsGranted);
        console.log('HMSPrebuilt Available:', !!HMSPrebuilt);
        console.log('=====================================');
        
        // Log to backend for debugging
        errorLogger.logError(
          new Error('HMS Join Attempt - Diagnostic Log'),
          {
            severity: 'warning',
            screenName: 'HMSMeetingInterface',
            userAction: 'HMS Join Attempt',
            errorType: 'HMSJoinDiagnostic',
            userId: user?.id,
          }
        );
      } catch (tokenError: any) {
        // 405 means endpoint doesn't exist - backend needs to implement it
        if (tokenError?.response?.status === 405) {
          console.warn('⚠️ HMS token endpoint not implemented (405): /api/v1/mobile/meetings/hms-token');
          console.warn('⚠️ Backend needs to implement this endpoint for HMS to work');
          setError('HMS token endpoint not available. Please contact support.');
          errorLogger.logError(tokenError, {
            severity: 'error',
            screenName: 'HMSMeetingInterface',
            userAction: 'Generate HMS Token',
            errorType: 'HMSTokenEndpointMissing',
            userId: user?.id,
          });
        } else {
          console.error('Failed to generate HMS auth token:', tokenError?.message || tokenError);
          setError(`Failed to generate auth token: ${tokenError?.message || 'Unknown error'}`);
          errorLogger.logError(tokenError, {
            severity: 'error',
            screenName: 'HMSMeetingInterface',
            userAction: 'Generate HMS Token',
            errorType: 'HMSTokenGenerationFailed',
            userId: user?.id,
          });
        }
        // Don't continue without token - it's required
        return;
      }
      
      // Check if HMS Prebuilt is available
      if (!HMSPrebuilt) {
        console.log('📱 100ms Prebuilt not available - showing development mode');
        console.log('📱 To test with full functionality:');
        console.log('   1. Install HMS package: npm install @100mslive/react-native-hms');
        console.log('   2. Create a development build (not Expo Go)');
        console.log('   3. Ensure backend HMS endpoints are configured');
        console.log('💡 TIP: You can test token generation and UI without rebuilding!');
        // Don't set error - show development mode UI instead
        setIsLoading(false);
        return;
      }

      // Log that we're about to render HMS (this requires native module)
      console.log('📱 HMS Prebuilt is available - will render native component');
      console.log('💡 NOTE: Changes to this component logic can use Fast Refresh');
      console.log('💡 NOTE: Only native module changes require rebuilds');
      
      // Set flag that HMS is initializing
      // Note: React Native HMSPrebuilt doesn't have onJoin callback
      // It will automatically join when mounted, so we use a timeout to detect if it fails
      setHmsInitializing(true);
      setIsLoading(false); // Clear initial loading, but keep hmsInitializing for overlay
      
      // React Native HMSPrebuilt automatically joins when mounted with valid token/roomCode
      // Since there's no onJoin callback, we rely on timeout to detect failures
      console.log('✅ [HMS] Initialization complete, HMS Prebuilt will automatically join...');
      console.log('✅ [HMS] Note: React Native HMSPrebuilt uses "token" prop (not "authToken")');
      console.log('✅ [HMS] Note: React Native HMSPrebuilt does NOT have onJoin callback');
      console.log('✅ [HMS] Using timeout to detect if join succeeds (component will render when joined)');
      
    } catch (error: any) {
      console.error('❌ Failed to initialize 100ms Prebuilt Interface:', error);
      setError('Failed to initialize meeting interface. Please try again.');
      setHmsInitializing(false);
      setIsLoading(false);
      errorLogger.logError(error, {
        severity: 'error',
        screenName: 'HMSMeetingInterface',
        userAction: 'Initialize HMS Interface',
        errorType: 'HMSInitializationFailed',
        userId: user?.id,
      });
    }
    // Note: We don't set isLoading to false here - let it stay true until HMS actually renders
    // This prevents the blank screen issue
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

  // Show loading if still initializing OR if we're waiting for HMS to render
  if (isLoading || (hmsInitializing && !authToken)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Initializing 100ms Prebuilt Interface...</Text>
          {hmsInitializing && authToken && (
            <>
              <Text style={[styles.loadingText, { marginTop: 8, fontSize: 14, opacity: 0.7 }]}>
                Connecting to meeting...
              </Text>
              <Text style={[styles.loadingText, { marginTop: 8, fontSize: 12, opacity: 0.5 }]}>
                This may take a few seconds
              </Text>
            </>
          )}
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
  // Note: HMSConfig is not required - HMSPrebuilt works without it
  console.log('📱 [HMS] Render check:', {
    hasHMSPrebuilt: !!HMSPrebuilt,
    hasAuthToken: !!authToken,
    authTokenLength: authToken?.length || 0,
    hasMeetingId: !!meetingId,
    meetingId: meetingId
  });
  
  if (HMSPrebuilt && authToken && meetingId) {
    // Validate required props before rendering
    const roomCode = meetingId as string;
    const token = authToken;
    const userName = (userName as string) || user?.name || 'Mobile User';
    
    console.log('📱 [HMS] Props validation:', {
      roomCode: roomCode,
      roomCodeType: typeof roomCode,
      roomCodeLength: roomCode?.length || 0,
      token: token ? token.substring(0, 20) + '...' : 'MISSING',
      tokenType: typeof token,
      tokenLength: token?.length || 0,
      userName: userName
    });
    
    if (!roomCode || !token) {
      console.error('📱 [HMS] Missing required props:', { 
        roomCode: !!roomCode, 
        token: !!token,
        roomCodeValue: roomCode,
        tokenValue: token ? 'present' : 'missing'
      });
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Configuration Error</Text>
            <Text style={styles.errorMessage}>
              Missing required information: {!roomCode ? 'roomCode' : ''} {!token ? 'token' : ''}
            </Text>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    
    // Validate all required props
    const validRoomCode = roomCode && typeof roomCode === 'string' && roomCode.trim().length > 0;
    const validToken = token && typeof token === 'string' && token.trim().length > 0;
    const validUserName = userName && typeof userName === 'string' && userName.trim().length > 0;
    
    console.log('📱 Rendering HMSPrebuilt with:', {
      roomCode: validRoomCode ? roomCode.substring(0, 10) + '...' : 'INVALID',
      roomCodeLength: roomCode?.length || 0,
      tokenLength: token?.length || 0,
      tokenPreview: validToken ? token.substring(0, 20) + '...' : 'INVALID',
      userName: validUserName ? userName : 'INVALID',
      HMSPrebuiltAvailable: !!HMSPrebuilt
    });
    
    // Verify all required props
    if (!validRoomCode) {
      console.error('📱 Invalid roomCode:', roomCode);
      setError('Invalid room code. Please try joining the meeting again.');
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Configuration Error</Text>
            <Text style={styles.errorMessage}>Invalid room code. Please try joining the meeting again.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => {
              initializePrebuiltInterface();
            }}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    
    if (!validToken) {
      console.error('📱 Invalid token:', token ? 'empty' : 'missing');
      setError('Authentication token is missing or invalid.');
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Token Error</Text>
            <Text style={styles.errorMessage}>Authentication token is missing or invalid.</Text>
            <Text style={[styles.errorMessage, { marginTop: 16, fontSize: 14, color: '#999' }]}>
              This usually means:{'\n'}
              • Token endpoint returned empty response{'\n'}
              • Network error prevented token fetch{'\n'}
              • Backend token generation failed{'\n'}
              • Token format is invalid
            </Text>
            {joinConfig && (
              <View style={[styles.errorMessage, { marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }]}>
                <Text style={[styles.errorMessage, { fontWeight: 'bold', marginBottom: 8 }]}>Debug Info:</Text>
                <Text style={[styles.errorMessage, { fontSize: 12, fontFamily: 'monospace' }]}>
                  Token Length: {joinConfig.tokenLength || 0}{'\n'}
                  Room ID: {joinConfig.roomId || 'N/A'}{'\n'}
                  User Name: {joinConfig.userName || 'N/A'}
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.retryButton} onPress={() => {
              initializePrebuiltInterface();
            }}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    
    // Check permissions BEFORE rendering HMS
    if (Platform.OS !== 'web' && permissionsGranted === false) {
      console.warn('⚠️ [HMS] Cannot render - permissions denied');
    return (
      <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Permissions Required</Text>
            <Text style={styles.errorMessage}>
              Camera and microphone permissions are required to join the meeting.
            </Text>
            <Text style={[styles.errorMessage, { marginTop: 16, fontSize: 14, color: '#999' }]}>
              Please enable camera and microphone permissions in your device settings and try again.
            </Text>
            <TouchableOpacity 
              style={styles.retryButton} 
              onPress={async () => {
                await checkPermissions();
                if (permissionsGranted) {
                  initializePrebuiltInterface();
                }
              }}
            >
              <Text style={styles.retryButtonText}>Request Permissions</Text>
            </TouchableOpacity>
            {Platform.OS === 'ios' && (
              <TouchableOpacity 
                style={[styles.retryButton, { marginTop: 12, backgroundColor: '#007AFF' }]} 
                onPress={async () => {
                  await Linking.openSettings();
                }}
              >
                <Text style={styles.retryButtonText}>Open Settings</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
      </SafeAreaView>
    );
    }

    try {
      // Final validation before rendering
      console.log('🔍 [HMS] FINAL VALIDATION BEFORE RENDERING:');
      console.log('=====================================');
      console.log('✅ Room Code Valid:', validRoomCode, '- Value:', roomCode);
      console.log('✅ Token Valid:', validToken, '- Length:', token.length);
      console.log('✅ User Name Valid:', validUserName, '- Value:', userName);
      console.log('✅ HMSPrebuilt Available:', !!HMSPrebuilt);
      console.log('✅ Permissions Granted:', permissionsGranted);
      console.log('=====================================');
      
      // Prepare props object with only valid values
      // According to 100ms React Native docs: HMSPrebuilt uses:
      // - roomCode OR token (not authToken!)
      // - options: { userName, userId }
      // - onLeave callback
      // - NO onJoin callback (use HMSSDK event listeners instead)
      // roomCode should be the meeting room code (e.g., "abc-defg-hij" from URL)
      // If meetingId is a full URL, extract the code; otherwise use it directly
      let finalRoomCode = roomCode.trim();
      
      // Extract room code from URL if needed (format: https://subdomain.app.100ms.live/meeting/abc-defg-hij)
      // Or if meetingId is already just the code, use it as-is
      if (finalRoomCode.includes('/meeting/')) {
        const urlParts = finalRoomCode.split('/meeting/');
        if (urlParts.length > 1) {
          finalRoomCode = urlParts[1].split('?')[0]; // Remove query params if any
        }
      }
      
      // React Native HMSPrebuilt props format:
      // - token (not authToken) - required if using token-based join
      // - roomCode - required if using roomCode-based join
      // - options: { userName, userId } - optional
      // - onLeave - callback when leaving
      const hmsProps = {
        token: token.trim(), // React Native uses 'token', not 'authToken'
        roomCode: finalRoomCode, // Can use either token OR roomCode
        options: {
          ...(validUserName && { userName: userName.trim() }),
          ...(user?.id && { userId: user.id.toString() }),
        },
        onLeave: handleLeaveMeeting,
        style: styles.prebuiltContainer
      };
      
      console.log('📱 [HMS] Final roomCode after processing:', finalRoomCode);
      console.log('📱 [HMS] Using token prop (React Native format), not authToken');
      
      console.log('📱 [HMS] HMSPrebuilt props prepared:', {
        roomCode: hmsProps.roomCode.substring(0, 10) + '...',
        roomCodeFull: hmsProps.roomCode,
        tokenLength: hmsProps.token.length,
        tokenPreview: hmsProps.token.substring(0, 30) + '...',
        options: hmsProps.options,
        hasOnLeave: !!hmsProps.onLeave,
        note: 'React Native uses "token" prop, not "authToken"'
      });
      
      // Log join config one more time right before render
      if (joinConfig) {
        console.log('📋 [HMS] Join Config:', JSON.stringify(joinConfig, null, 2));
      }
      
      return (
        <SafeAreaView style={styles.container}>
          {hmsError || hmsInitTimeout ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>HMS Error</Text>
              <Text style={styles.errorMessage}>
                {hmsError || 'HMS component failed to initialize. This may be a native module issue.'}
              </Text>
              {hmsInitTimeout && (
                <Text style={[styles.errorMessage, { marginTop: 16, fontSize: 14, color: '#999' }]}>
                  The meeting interface took too long to load. This could indicate a network issue, HMS configuration problem, or the component may be stuck.
                </Text>
              )}
              
              {/* Diagnostic Information */}
              {joinConfig && (
                <View style={[styles.errorMessage, { marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }]}>
                  <Text style={[styles.errorMessage, { fontWeight: 'bold', marginBottom: 8 }]}>Diagnostic Information:</Text>
                  <Text style={[styles.errorMessage, { fontSize: 12, fontFamily: 'monospace' }]}>
                    Token Length: {joinConfig.tokenLength}{'\n'}
                    Token Parts: {joinConfig.tokenParts}{'\n'}
                    Room ID: {joinConfig.roomId}{'\n'}
                    Room ID Length: {joinConfig.roomIdLength}{'\n'}
                    User Name: {joinConfig.userName}{'\n'}
                    Platform: {joinConfig.platform}{'\n'}
                    Permissions: {joinConfig.permissionsGranted ? 'Granted' : 'Denied'}{'\n'}
                    HMSPrebuilt: {HMSPrebuilt ? 'Available' : 'Not Available'}
                  </Text>
                </View>
              )}
              
              <TouchableOpacity style={styles.retryButton} onPress={() => {
                setHmsError(null);
                setHmsInitTimeout(false);
                setHmsInitializing(false);
                initializePrebuiltInterface();
              }}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Text style={styles.backButtonText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Loading overlay while HMS initializes - prevents black screen */}
              {hmsInitializing && (
                <View style={styles.loadingOverlay}>
                  <View style={styles.loadingBox}>
                    <Text style={styles.loadingText}>Initializing meeting...</Text>
                    <Text style={styles.loadingSubtext}>This may take a few seconds</Text>
                  </View>
                </View>
              )}
              <HMSErrorBoundary
                onError={(error) => {
                  console.error('📱 [HMS] Prebuilt Error Boundary:', error);
                  setHmsInitializing(false);
                  setHmsError(error?.message || 'Failed to join meeting. Please try again.');
                  errorLogger.logError(error, {
                    severity: 'error',
                    screenName: 'HMSMeetingInterface',
                    userAction: 'HMS Error Boundary',
                    errorType: 'HMSPrebuiltErrorBoundary',
                    userId: user?.id,
                  });
                }}
              >
                {!permissionsGranted && permissionsGranted !== null ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorTitle}>Permissions Required</Text>
                    <Text style={styles.errorMessage}>
                      Camera and microphone permissions are required to join the meeting.
                    </Text>
                    <Text style={[styles.errorMessage, { marginTop: 16, fontSize: 14, color: '#999' }]}>
                      Please enable camera and microphone permissions in your device settings and try again.
                    </Text>
                    <TouchableOpacity 
                      style={styles.retryButton} 
                      onPress={async () => {
                        // Request permissions again
                        await checkPermissions();
                        // Small delay to ensure state updates
                        setTimeout(() => {
                          if (permissionsGranted) {
                            initializePrebuiltInterface();
                          }
                        }, 100);
                      }}
                    >
                      <Text style={styles.retryButtonText}>Request Permissions</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'ios' && (
                      <TouchableOpacity 
                        style={[styles.retryButton, { marginTop: 12, backgroundColor: '#007AFF' }]} 
                        onPress={async () => {
                          await Linking.openSettings();
                        }}
                      >
                        <Text style={styles.retryButtonText}>Open Settings</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                      <Text style={styles.backButtonText}>Go Back</Text>
                    </TouchableOpacity>
                  </View>
                ) : permissionsGranted === null ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Checking permissions...</Text>
                  </View>
                ) : (
                  <HMSPrebuilt 
                    token={hmsProps.token}
                    roomCode={hmsProps.roomCode}
                    options={hmsProps.options}
                    onLeave={(data?: any) => {
                      console.log('👋 [HMS] onLeave callback fired');
                      console.log('👋 [HMS] Leave data:', data);
                      setHmsInitializing(false);
                      setIsLoading(false);
                      router.back();
                    }}
                    style={hmsProps.style}
                    // Note: React Native HMSPrebuilt does NOT support onJoin callback
                    // The component will automatically join when mounted with valid token/roomCode
                    // We use a timeout to detect if join fails silently
                  />
                )}
              </HMSErrorBoundary>
            </>
          )}
        </SafeAreaView>
      );
    } catch (renderError: any) {
      console.error('📱 Error rendering HMSPrebuilt:', renderError);
      setHmsError(renderError?.message || 'Failed to initialize meeting interface.');
      errorLogger.logError(renderError, {
        severity: 'error',
        screenName: 'HMSMeetingInterface',
        userAction: 'Render HMSPrebuilt',
        errorType: 'HMSPrebuiltRenderError',
        userId: user?.id,
      });
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Initialization Error</Text>
            <Text style={styles.errorMessage}>{renderError?.message || 'Failed to initialize meeting interface.'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => {
              setHmsError(null);
              initializePrebuiltInterface();
            }}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  loadingSubtext: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
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