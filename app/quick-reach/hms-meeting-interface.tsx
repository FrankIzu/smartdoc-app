// 100ms Prebuilt Interface Implementation
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { Component, ErrorInfo, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  AppStateStatus,
  BackHandler,
  Linking,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { HMS_IOS_SCREENSHARE } from '../../constants/Config';
import { apiClient } from '../../services/api';
import { errorLogger } from '../../services/errorLogger';
import { MeetingJoinSound } from '../components/MeetingJoinSound';
import { useAuth } from '../context/auth';

const MEETING_NOTIFICATION_ID = 'grabdocs_meeting_minimized';
export const REACH_CURRENT_MEETING_KEY = 'reach_current_meeting_id';

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

// Minimal bottom inset for Android so prebuilt toolbar clears system nav (kept small to avoid moving UI up too much)
const ANDROID_NAV_INSET = 24;

export default function HMSMeetingInterfaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { meetingId, title, userName, passcode, passcode_token: passcodeToken } = params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, ANDROID_NAV_INSET) : insets.bottom;

  const goToAppHome = useCallback(() => {
    router.replace('/(tabs)' as any);
  }, [router]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [hmsError, setHmsError] = useState<string | null>(null);
  const [hmsInitializing, setHmsInitializing] = useState(false);
  const [hmsInitTimeout, setHmsInitTimeout] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null);
  const [joinConfig, setJoinConfig] = useState<any>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingNotificationShownRef = useRef(false);

  const notificationDisplayedRef = useRef(false);
  const pipFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [joinSoundReady, setJoinSoundReady] = useState(false);

  // Delay mounting MeetingJoinSound until after HMSPrebuilt has joined (useHMSPeerUpdates can crash without room context)
  useEffect(() => {
    if (!joinConfig || Platform.OS === 'web') return;
    setJoinSoundReady(false);
    const t = setTimeout(() => setJoinSoundReady(true), 5000);
    return () => clearTimeout(t);
  }, [joinConfig]);

  // Configure 100ms room-kit join behavior: skip preview and join with camera off to avoid
  // camera orientation bug (shows landscape for ~30s before correcting to portrait). User can
  // enable camera after joining; the delay patch gives orientation time to stabilize.
  useEffect(() => {
    if (Platform.OS !== 'web' && typeof global !== 'undefined') {
      (global as any).joinConfig = {
        mutedAudio: false,
        mutedVideo: true,
        skipPreview: true,
      };
    }
  }, []);

  useEffect(() => {
    // Check permissions first, then initialize
    const init = async () => {
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
            let audioStatus: { status: string } = { status: 'granted' };
            try {
              const audioPermission = await Audio.requestPermissionsAsync();
              audioStatus = audioPermission;
            } catch (audioError) {
              console.warn('⚠️ [HMS] Could not request audio permissions:', audioError);
            }
            
            permissionsOk = cameraStatus.status === 'granted' && audioStatus.status === 'granted';
            setPermissionsGranted(permissionsOk);
            
          } catch (permError) {
            console.error('📱 [HMS] Error checking permissions:', permError);
            permissionsOk = false;
            setPermissionsGranted(false);
          }
        }
        
        // Initialize based on permissions
        if (permissionsOk) {
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
        let audioStatus: { status: string } = { status: 'granted' };
        
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
  // 1. After 2s, hide loading overlay so preview (Get Started / audio-video setup) is visible
  // 2. After 20s, if still initializing, show error
  useEffect(() => {
    if (hmsInitializing && authToken) {
      // Stage 1: Clear loading overlay after 2s so user sees preview screen (audio/video controls, name)
      const successTimeoutId = setTimeout(() => {
        setHmsInitializing(false); // Clear loading overlay
        setIsLoading(false);
      }, 2000);
      
      // Stage 2: Error timeout after 20 seconds
      const errorTimeoutId = setTimeout(() => {
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

  // Get room_id from meeting info and set up heartbeat. Defer by 3s so we don't parse a large response on the same frame as mounting HMSPrebuilt (can cause crash).
  useEffect(() => {
    let mounted = true;
    const timeoutId = setTimeout(async () => {
      if (!meetingId || !user) return;
      try {
        const meetingInfo = await apiClient.getMeetingInfo(meetingId as string);
        if (mounted && meetingInfo.success && meetingInfo.data?.id) {
          setRoomId(meetingInfo.data.id);
        }
      } catch {
        // Non-fatal: heartbeat won't run
      }
    }, 3000);
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [meetingId, user]);

  // Set up heartbeat interval when room_id is available
  useEffect(() => {
    if (!roomId) return;

    // Clear any existing interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    // Send initial heartbeat immediately
    const sendHeartbeat = async () => {
      try {
        await apiClient.sendMeetingHeartbeat(roomId);
      } catch {
        // Silently fail - heartbeat errors shouldn't break the app
      }
    };

    // Send first heartbeat immediately
    sendHeartbeat();

    // Set up interval to send heartbeat every 25 seconds (recommended: 20-30 seconds)
    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, 25000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [roomId]);

  // Poll recording status only after user has joined - notify when joining a meeting that is already being recorded.
  // Do not run while initializing or before first "in call" delay, so we never show the popup when just starting a meeting.
  useEffect(() => {
    if (!roomId || Platform.OS === 'web' || hmsInitializing) return;

    const RECORDING_POLL_INTERVAL = 6000; // 6 seconds
    const FIRST_CHECK_DELAY_MS = 5000;   // Only check after user has been in the call for 5s (avoids showing when clicking "Start meeting")

    const checkRecording = async () => {
      try {
        const response = await apiClient.client.get(
          `/api/v1/video/room/${roomId}/recording-status`,
          { withCredentials: true }
        );
        if (response.data?.is_recording && !recordingNotificationShownRef.current) {
          recordingNotificationShownRef.current = true;
          const roomName = response.data?.room_name || 'This meeting';
          Alert.alert(
            'Recording Started',
            `${roomName} is now being recorded. By staying, you consent to being recorded.`,
            [{ text: 'OK' }]
          );
        }
      } catch {
        // Silently fail - recording status is non-critical
      }
    };

    const timeoutId = setTimeout(() => {
      checkRecording();
      recordingPollIntervalRef.current = setInterval(checkRecording, RECORDING_POLL_INTERVAL);
    }, FIRST_CHECK_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
      if (recordingPollIntervalRef.current) {
        clearInterval(recordingPollIntervalRef.current);
        recordingPollIntervalRef.current = null;
      }
    };
  }, [roomId, hmsInitializing]);

  // Cleanup on unmount (e.g., user swipes back). Do NOT call leave endpoint here.
  // Meeting must stay connected so user can return via active meeting card. Leave is only
  // called when user explicitly taps "Leave Meeting" and confirms (handleLeaveMeeting).
  useEffect(() => {
    return () => {
      // Stop heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Dismiss meeting notification on unmount
      if (Platform.OS === 'android') {
        Notifications.dismissNotificationAsync(MEETING_NOTIFICATION_ID).catch(() => {});
      }

      // Deactivate keep-awake
      deactivateKeepAwake();
    };
  }, []);

  // Show "In meeting" notification only (no in-app bubble). Used when PiP fallback is needed.
  const showMeetingNotification = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('meeting', {
          name: 'Meeting',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      await Notifications.scheduleNotificationAsync({
        identifier: MEETING_NOTIFICATION_ID,
        content: {
          title: 'In GrabDocs meeting',
          body: 'Tap to return',
          data: {
            type: 'meeting_minimized',
            meetingId: String(meetingId),
            title: title ? String(title) : undefined,
            userName: userName ? String(userName) : undefined,
          },
        },
        trigger: null,
        ...(Platform.OS === 'android' && { channelId: 'meeting' }),
      });
      notificationDisplayedRef.current = true;
    } catch (err) {
    }
  }, [meetingId, title, userName]);

  // Back / swipe: go to meeting list (Reach). Using replace avoids popping to (tabs)/Home first and keeps path correct (avoids grabdocs:/// unmatched route when tapping active meeting later).
  const goBackToApp = useCallback(() => {
    router.replace('/quick-reach/meeting-call' as any);
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !authToken || !meetingId) return;
    const handler = () => {
      goBackToApp();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => subscription.remove();
  }, [authToken, meetingId, goBackToApp]);

  // Let swipe-back and header back arrow do default pop (no intercept) so user goes to previous screen without an extra stack entry.
  // (Removed beforeRemove listener that was preventing default and pushing returnPath, which caused "taken back to meeting" on next back.)

  // PiP strategy (both platforms):
  //
  // Android:
  //   Primary:  HMS autoEnterPipMode via onUserLeaveHint() in MainActivity — fires for
  //             Home button and Recents button ONLY.
  //   Problem:  onUserLeaveHint does NOT fire for screen-off, notification shade, incoming
  //             calls, or gesture-based app switches — so PiP silently fails in those cases.
  //   Fix:      After 500 ms (letting HMS try first), call GrabDocsPipModule.enterPipForMeeting()
  //             ourselves. GrabDocsPipModule now guards against re-entry — if HMS already
  //             entered PiP it returns immediately without touching the video surface.
  //             Trigger on both 'inactive' AND 'background': Android only ever fires
  //             'background', but catching both is harmless (the timer is restarted each time
  //             and only fires once).
  //
  // iOS:
  //   Primary:  HMS autoEnterPipMode — handles PiP entry when app backgrounds.
  //   Fallback: We have no native PiP module for iOS, so after 2.5 s we show a notification
  //             if PiP did not activate (cannot check isInPipMode on iOS without native code).
  //   'inactive' on iOS fires during app-switcher animation before 'background' — we handle
  //             it with a delay so the timer is simply restarted when 'background' follows.
  const pipEnabled = Platform.OS !== 'web';
  const pipModule = Platform.OS === 'android' ? NativeModules.GrabDocsPipModule : null;
  // How long to wait before our fallback kicks in, giving HMS first chance.
  const HMS_PIP_SETTLE_MS = 500;   // let HMS enter PiP, then we check/enter
  const NOTIFICATION_FALLBACK_MS = 2500; // if still no PiP, show notification
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (!authToken || !meetingId) return;

        // Always restart the timer so rapid state changes (inactive→background) don't
        // double-fire — the last event wins.
        if (pipFallbackTimerRef.current) clearTimeout(pipFallbackTimerRef.current);

        if (pipEnabled && pipModule) {
          // Android path — two-stage fallback.
          pipFallbackTimerRef.current = setTimeout(() => {
            pipFallbackTimerRef.current = null;
            // Stage 1 (500 ms): enter PiP if HMS did not already do so.
            // GrabDocsPipModule guards against re-entry: if already in PiP it returns
            // true immediately without resetting the video surface.
            pipModule.enterPipForMeeting?.().then((entered: boolean) => {
              if (!entered) {
                // Stage 2: PiP truly unavailable — show notification.
                setTimeout(() => {
                  pipModule.isInPipMode?.().then((inPip: boolean) => {
                    if (!inPip && authToken && meetingId) {
                      showMeetingNotification();
                    }
                  }).catch(() => {});
                }, NOTIFICATION_FALLBACK_MS - HMS_PIP_SETTLE_MS);
              }
            }).catch(() => {});
          }, HMS_PIP_SETTLE_MS);
        } else if (pipEnabled && !pipModule) {
          // iOS path — HMS handles PiP, we only show notification as last resort.
          pipFallbackTimerRef.current = setTimeout(() => {
            pipFallbackTimerRef.current = null;
            showMeetingNotification();
          }, NOTIFICATION_FALLBACK_MS);
        } else {
          // Web / unsupported — just notify.
          showMeetingNotification();
        }
      } else if (nextState === 'active') {
        if (pipFallbackTimerRef.current) {
          clearTimeout(pipFallbackTimerRef.current);
          pipFallbackTimerRef.current = null;
        }
        if (notificationDisplayedRef.current) {
          Notifications.dismissNotificationAsync(MEETING_NOTIFICATION_ID).catch(() => {});
          notificationDisplayedRef.current = false;
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
      if (pipFallbackTimerRef.current) {
        clearTimeout(pipFallbackTimerRef.current);
        pipFallbackTimerRef.current = null;
      }
    };
  }, [authToken, meetingId, showMeetingNotification, pipEnabled, pipModule]);

  // Screen wake lock: activate when in meeting
  useEffect(() => {
    if (authToken && meetingId) {
      activateKeepAwake();
    } else {
      deactivateKeepAwake();
    }
    return () => {
      deactivateKeepAwake();
    };
  }, [authToken, meetingId]);

  // Track current meeting for "one meeting at a time" and return-via-active-card
  useEffect(() => {
    if (authToken && meetingId) {
      AsyncStorage.setItem(REACH_CURRENT_MEETING_KEY, String(meetingId)).catch(() => {});
    }
    return () => {};
  }, [authToken, meetingId]);

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

      if (!meetingId) {
        setError('No meeting ID provided. Please try joining the meeting again from the meeting list.');
        setIsLoading(false);
        return;
      }

      // Same as web: get token via join-by-id (one join path for both web and mobile)
      const displayUserName = (userName as string) || user?.name || 'Mobile User';
      try {
        const joinRes = await apiClient.client.post('/api/v1/video/room/join-by-id', {
          meeting_id: (meetingId as string).trim(),
          participant_name: displayUserName,
          enable_audio: true,
          enable_video: false,
          viewer_type: 'near-realtime',
          ...(passcodeToken ? { passcode_token: passcodeToken } : ((passcode as string)?.trim() ? { passcode: (passcode as string).trim() } : {})),
        });
        const raw = joinRes?.data || {};
        const data = (raw && typeof (raw as any).data === 'object' && (raw as any).data != null) ? (raw as any).data : raw;
        const token = (data as any).token;
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
          throw new Error('Join did not return a token');
        }
        const tokenParts = token.split('.');
        setAuthToken(token);
        const joinConfigData = {
          token,
          tokenLength: token.length,
          tokenPreview: token.substring(0, 50) + '...',
          tokenParts: tokenParts.length,
          roomId: meetingId,
          roomIdLength: (meetingId as string)?.length || 0,
          userName: displayUserName,
          userNameLength: displayUserName.length,
          userId: user?.id?.toString(),
          role: 'auto-determined-by-backend',
          platform: Platform.OS,
          permissionsGranted: permissionsGranted,
          timestamp: new Date().toISOString(),
        };
        setJoinConfig(joinConfigData);
      } catch (joinError: any) {
        const status = joinError?.response?.status;
        const errData = joinError?.response?.data || {};
        const errMsg = errData.message || errData.error || joinError?.message || 'Unknown error';
        if (status === 409) {
          setError('You are already in this meeting. Leave the other session and try again.');
        } else if (status === 403) {
          setError(errMsg || 'This meeting requires host approval to join.');
        } else {
          const isRoomNotReady =
            /room not found/i.test(errMsg) ||
            /does not have an HMS room/i.test(errMsg) ||
            /NO_HMS_ROOM/i.test(String(errData?.error_code || ''));
          setError(isRoomNotReady ? 'Meeting not started yet. Contact host' : errMsg);
        }
        errorLogger.logError(joinError, {
          severity: 'error',
          screenName: 'HMSMeetingInterface',
          userAction: 'Join by ID',
          errorType: 'HMSJoinByIdFailed',
          userId: user?.id,
        });
        setIsLoading(false);
        return;
      }
      
      if (!HMSPrebuilt) {
        setIsLoading(false);
        return;
      }

      // Set flag that HMS is initializing
      // Note: React Native HMSPrebuilt doesn't have onJoin callback
      // It will automatically join when mounted, so we use a timeout to detect if it fails
      setHmsInitializing(true);
      setIsLoading(false); // Clear initial loading, but keep hmsInitializing for overlay
      
    } catch (error: any) {
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

  const handleLeaveMeeting = async () => {
    Alert.alert(
      'Leave Meeting',
      'Are you sure you want to leave the meeting?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Leave', 
          style: 'destructive', 
          onPress: async () => {
            try {
              // Stop heartbeat immediately
              if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
              }

              try {
                await AsyncStorage.removeItem(REACH_CURRENT_MEETING_KEY);
              } catch (_) {}
              // Call backend to leave meeting (clears ActiveParticipant table)
              if (meetingId) {
                await apiClient.client.post(`/api/v1/mobile/meetings/${meetingId}/leave`);
              }
            } catch (error: any) {
              // Log error but don't block navigation - user is leaving anyway
              console.error('⚠️ [LEAVE] Error calling leave endpoint:', error);
              console.error('⚠️ [LEAVE] Continuing with navigation despite error');
            }
            // Navigate to meeting list (same as swipe-back) so stack/path stay correct
            router.replace('/quick-reach/meeting-call' as any);
          }
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
          <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
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
          <Text style={styles.loadingText}>Initializing GrabDocs Meeting...</Text>
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
          <Text style={styles.errorTitle}>GrabDocs Meeting</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (HMSPrebuilt && authToken && meetingId) {
    const roomCode = meetingId as string;
    const token = authToken;
    const displayUserName = (userName as string) || user?.name || 'Mobile User';
    
    if (!roomCode || !token) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Configuration Error</Text>
            <Text style={styles.errorMessage}>
              Missing required information: {!roomCode ? 'roomCode' : ''} {!token ? 'token' : ''}
            </Text>
            <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    
    // Validate all required props
    const validRoomCode = roomCode && typeof roomCode === 'string' && roomCode.trim().length > 0;
    const validToken = token && typeof token === 'string' && token.trim().length > 0;
    const validUserName = displayUserName && typeof displayUserName === 'string' && displayUserName.trim().length > 0;
    
    // Verify all required props
    if (!validRoomCode) {
      setError('Invalid room code. Please try joining the meeting again.');
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Configuration Error</Text>
            <Text style={styles.errorMessage}>Invalid room code. Please try joining the meeting again.</Text>
            <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    
    if (!validToken) {
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
            <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    
    if (Platform.OS !== 'web' && permissionsGranted === false) {
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
            <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
      </SafeAreaView>
    );
    }

    try {
      // Final validation before rendering
      // Prepare props object with only valid values
      // According to React Native docs: HMSPrebuilt uses:
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
      // - options: { userName, userId, ios?: { appGroup, preferredExtension } } - optional
      // - onLeave - callback when leaving
      // iOS screenshare: pass appGroup + preferredExtension so prebuilt can start screen share (see docs/MOBILE_SCREENSHARE_WHITEBOARD.md)
      const hmsProps = {
        token: token.trim(), // React Native uses 'token', not 'authToken'
        roomCode: finalRoomCode, // Can use either token OR roomCode
        options: {
          ...(validUserName && { userName: displayUserName.trim() }),
          ...(user?.id && { userId: user.id.toString() }),
          ...(Platform.OS === 'ios' && HMS_IOS_SCREENSHARE && {
            ios: {
              appGroup: HMS_IOS_SCREENSHARE.appGroup,
              preferredExtension: HMS_IOS_SCREENSHARE.preferredExtension,
            },
          }),
        },
        onLeave: handleLeaveMeeting,
        style: styles.prebuiltContainer
      };
      
      const meetingTitleStr = (title as string) || undefined;

      return (
        <>
          {/* Mount join sound only after room is likely joined (useHMSPeerUpdates can crash without room context) */}
          {HMSPrebuilt && joinSoundReady && (
            <MeetingJoinSound enabled={!!authToken && !!meetingId} />
          )}
          <SafeAreaView style={styles.container}>
            <View style={styles.meetingContentWrapper}>
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
              
              <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
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
                  const rawMessage = error?.message || '';
                  // Intercept 100ms "room not found" / 400 INIT - show friendly message
                  const isRoomNotFound =
                    /room not found/i.test(rawMessage) ||
                    /400\s*\[?INIT\]?/i.test(rawMessage) ||
                    /room.*not.*exist/i.test(rawMessage);
                  const friendlyMessage = isRoomNotFound
                    ? 'Meeting not started yet. Contact host'
                    : rawMessage || 'Failed to join meeting. Please try again.';
                  setHmsError(friendlyMessage);
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
                    <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
                      <Text style={styles.backButtonText}>Go Back</Text>
                    </TouchableOpacity>
                  </View>
                ) : permissionsGranted === null ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Checking permissions...</Text>
                  </View>
                ) : (
                  <View style={[styles.prebuiltWrapper, { paddingBottom: bottomInset }]}>
                    {/* PiP: Square, smaller window on both platforms. Video preview enabled by 100ms (useActiveSpeaker: true). iOS: UIBackgroundModes ["voip"] + plugins/ios-pip. Android: plugins/android-pip + GrabDocsPipModule (1:1). See docs/PIP_MOBILE_SETUP.md if PiP shows black. */}
                    <HMSPrebuilt 
                      token={hmsProps.token}
                      roomCode={hmsProps.roomCode}
                      options={hmsProps.options}
                      autoEnterPipMode={Platform.OS !== 'web'}
                      pipConfig={Platform.OS !== 'web' ? { aspectRatio: [1, 1] } : undefined}
                      onLeave={async (data?: any) => {
                        setHmsInitializing(false);
                        setIsLoading(false);
                        
                        // Clear "current meeting" so user can join another
                        try {
                          await AsyncStorage.removeItem(REACH_CURRENT_MEETING_KEY);
                        } catch (_) {}
                        // Call backend to leave meeting (clears ActiveParticipant table)
                        try {
                          if (meetingId) {
                            await apiClient.client.post(`/api/v1/mobile/meetings/${meetingId}/leave`);
                          }
                        } catch (error: any) {
                          // Log error but don't block navigation - user is leaving anyway
                          console.error('⚠️ [LEAVE] Error calling leave endpoint:', error);
                          console.error('⚠️ [LEAVE] Continuing with navigation despite error');
                        }
                        
                        // Navigate to meeting list (same as swipe-back) so stack/path stay correct
                        router.replace('/quick-reach/meeting-call' as any);
                      }}
                      style={hmsProps.style}
                      // Note: React Native HMSPrebuilt does NOT support onJoin callback
                      // The component will automatically join when mounted with valid token/roomCode
                      // We use a timeout to detect if join fails silently
                    />
                  </View>
                )}
              </HMSErrorBoundary>
            </>
          )}
            </View>
        </SafeAreaView>
        </>
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
            <TouchableOpacity style={styles.backButton} onPress={goToAppHome}>
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
        <Text style={styles.developmentTitle}>GrabDocs Meeting</Text>
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
            The GrabDocs Meeting Interface requires a development build (not Expo Go).
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
  containerMinimized: {
    backgroundColor: '#0d0d0d',
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
  meetingContentWrapper: {
    flex: 1,
  },
  prebuiltWrapper: {
    flex: 1,
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