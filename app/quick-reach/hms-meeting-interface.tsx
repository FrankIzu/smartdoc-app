// 100ms Prebuilt Interface Implementation
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, {
    Component,
    ErrorInfo,
    ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import {
    Alert,
    AppState,
    AppStateStatus,
    BackHandler,
    Linking,
    Modal,
    NativeModules,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetingPresenceConfirmBridge } from '../../components/quick-reach/MeetingPresenceConfirmBridge';
import { API_BASE_URL, HMS_IOS_SCREENSHARE } from '../../constants/Config';
import { REACH_CURRENT_MEETING_KEY, canonicalizeReachMeetingId } from '../../constants/reachMeeting';
import { apiClient } from '../../services/api';
import { errorLogger } from '../../services/errorLogger';
import { getHmsDisplayUserName } from '../../utils/reachDisplayName';
import { MeetingJoinSound } from '../components/MeetingJoinSound';
import { useAuth } from '../context/auth';

const MEETING_NOTIFICATION_ID = 'grabdocs_meeting_minimized';

// HMS package - enabled for local testing
// All HMS functionality is handled via backend API calls
// Note: HMS is native-only, skip imports on web platform and Expo Go

// Import HMS components (native platforms only)
let HMSPrebuilt: any = null;

// Only try to import HMS on native platforms (not web) and in development builds (not Expo Go).
// HMS requires native modules that don't work in Expo Go. `require()` is required for conditional native loading.
/* eslint-disable @typescript-eslint/no-require-imports */
if (Platform.OS !== 'web') {
  try {
    const Constants = require('expo-constants').default;
    const isExpoGo = Constants.appOwnership === 'expo';

    if (!isExpoGo) {
      const roomKitPackage = require('@100mslive/react-native-room-kit');
      if (roomKitPackage?.HMSPrebuilt) {
        HMSPrebuilt = roomKitPackage.HMSPrebuilt;
      }
    }
  } catch {
    // Import errors expected in Expo Go; component handles missing module
  }
}
/* eslint-enable @typescript-eslint/no-require-imports */

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

function applyGrabdocsHmsRoomKitJoinDefaults() {
  if (typeof global === 'undefined') return;
  (global as any).joinConfig = {
    mutedAudio: true,
    mutedVideo: true,
    skipPreview: false,
    audioMixer: false,
    musicMode: false,
    softwareDecoder: true,
    autoResize: false,
  };
}

/** Minimum bottom clearance on Android — edge-to-edge often reports 0 for the 3-button nav bar. */
const ANDROID_NAV_INSET = 48;

function PrejoinBackButton({ onPress, topInset }: { onPress: () => void; topInset: number }) {
  return (
    <View style={[styles.prejoinBackContainer, { top: topInset + 8 }]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.prejoinBackButton}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Back to meetings"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export default function HMSMeetingInterfaceScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { meetingId, title, userName, passcode, passcode_token: passcodeToken, force_join: forceJoinParam } = params;
  const forceJoinFromRoute =
    (() => {
      const f = forceJoinParam;
      const v = f == null ? '' : Array.isArray(f) ? String(f[0]) : String(f);
      return v === '1' || v.toLowerCase() === 'true';
    })();
  const meetingIdForDisplay =
    meetingId == null ? undefined : Array.isArray(meetingId) ? meetingId[0] : meetingId;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset =
    Platform.OS === 'android' ? Math.max(insets.bottom, ANDROID_NAV_INSET) : insets.bottom;

  const goToAppHome = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(REACH_CURRENT_MEETING_KEY);
    } catch {
      /* ignore */
    }
    try {
      if (meetingId) {
        await apiClient.client.post(`/api/v1/mobile/meetings/${String(meetingId).trim()}/leave`);
      }
    } catch {
      /* ignore */
    }
    router.replace('/(tabs)' as any);
  }, [router, meetingId]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [hmsError, setHmsError] = useState<string | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null);
  const [joinConfig, setJoinConfig] = useState<any>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingNotificationShownRef = useRef(false);

  const notificationDisplayedRef = useRef(false);
  const pipFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orientationReadyForHms, setOrientationReadyForHms] = useState(() => Platform.OS === 'web');
  const [joinSoundReady, setJoinSoundReady] = useState(false);
  /** Canonical GrabDocs meeting id from join response (preferred for list/storage merge). */
  const [resolvedStorageMeetingId, setResolvedStorageMeetingId] = useState<string | null>(null);
  /** True only after HMS room join + `/join-by-id/confirm` — gates presence side effects (storage, heartbeat, etc.). */
  const [presenceConfirmed, setPresenceConfirmed] = useState(false);

  type JoinConfirmContext = {
    meetingIdStr: string;
    token: string;
    displayName: string;
    viewerType: string;
    passcodePayload: Record<string, string>;
    startedWithForceJoin: boolean;
  };
  const joinConfirmContextRef = useRef<JoinConfirmContext>({
    meetingIdStr: '',
    token: '',
    displayName: '',
    viewerType: 'guest',
    passcodePayload: {},
    startedWithForceJoin: false,
  });
  const presenceConfirmSentRef = useRef(false);
  const isNavigatingAwayRef = useRef(false);
  /** True when user backs/swipes to the list while still in a live call (not an explicit leave). */
  const isMinimizingAwayRef = useRef(false);

  // Network connectivity monitoring — shown as a friendly overlay instead of the raw HMS error
  const [isNetworkDown, setIsNetworkDown] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const networkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In-meeting dismissable banners (recording started, peer joined)
  const [bannerQueue, setBannerQueue] = useState<{ message: string; type: 'recording' | 'joined' }[]>([]);
  const dismissBanner = useCallback(() => setBannerQueue(prev => prev.slice(1)), []);

  // Collect peer names over a 2s window, then collapse into one banner
  const pendingJoinNamesRef = useRef<string[]>([]);
  const joinGroupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePeerJoined = useCallback((peerName: string) => {
    pendingJoinNamesRef.current.push(peerName);
    if (joinGroupTimerRef.current) clearTimeout(joinGroupTimerRef.current);
    joinGroupTimerRef.current = setTimeout(() => {
      const names = pendingJoinNamesRef.current;
      pendingJoinNamesRef.current = [];
      joinGroupTimerRef.current = null;
      let message: string;
      if (names.length === 1) {
        message = `${names[0]} joined the meeting`;
      } else if (names.length === 2) {
        message = `${names[0]} and ${names[1]} joined the meeting`;
      } else {
        message = `${names[0]} and ${names.length - 1} others joined the meeting`;
      }
      setBannerQueue(prev => [...prev, { message, type: 'joined' }]);
    }, 2000);
  }, []);

  // Delay mounting MeetingJoinSound until GrabDocs presence is confirmed (useHMSPeerUpdates needs room context)
  useEffect(() => {
    if (!joinConfig || Platform.OS === 'web' || !presenceConfirmed) {
      setJoinSoundReady(false);
      return;
    }
    const t = setTimeout(() => setJoinSoundReady(true), 4000);
    return () => clearTimeout(t);
  }, [joinConfig, presenceConfirmed]);

  // Network connectivity monitor — poll the backend health endpoint every 5 s during a live call.
  // When the connection drops we show our own friendly banner (which renders above the HMS native UI
  // via a transparent Modal). When it recovers, we flash "Reconnected" for 3 s then hide the banner.
  useEffect(() => {
    // Only monitor after confirmed presence (prejoin HMS UI should not show call-level overlays)
    if (!joinConfig || Platform.OS === 'web' || !HMSPrebuilt || !presenceConfirmed) return;

    const checkConnectivity = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        await fetch(`${API_BASE_URL}/health`, {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        // Connection restored
        setIsNetworkDown(prev => {
          if (prev) {
            // Was offline — flash "Reconnected" banner for 3 s
            setShowReconnected(true);
            if (reconnectedTimerRef.current) clearTimeout(reconnectedTimerRef.current);
            reconnectedTimerRef.current = setTimeout(() => setShowReconnected(false), 3000);
          }
          return false;
        });
      } catch {
        clearTimeout(timeout);
        setIsNetworkDown(true);
      }
    };

    // Initial check after a short delay (give HMS time to settle)
    const initialDelay = setTimeout(checkConnectivity, 3000);
    networkPollRef.current = setInterval(checkConnectivity, 5000);

    return () => {
      clearTimeout(initialDelay);
      if (networkPollRef.current) clearInterval(networkPollRef.current);
      if (reconnectedTimerRef.current) clearTimeout(reconnectedTimerRef.current);
    };
  }, [joinConfig, presenceConfirmed]);

  // Room-kit HMSSDK.build reads `global.joinConfig` before mount; portrait lock aligns camera preview with phone use while `app.config` orientation is unlocked.
  useLayoutEffect(() => {
    if (Platform.OS === 'web') return;
    applyGrabdocsHmsRoomKitJoinDefaults();

    let cancelled = false;
    setOrientationReadyForHms(false);

    const run = async () => {
      try {
        if (Device.deviceType !== Device.DeviceType.TABLET) {
          const supported = await ScreenOrientation.supportsOrientationLockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP,
          );
          if (!cancelled && supported) {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          }
        }
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) {
          setOrientationReadyForHms(true);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [meetingId]);

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
    // Intentionally run once on mount; initializePrebuiltInterface reads latest params from closure on first paint
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount init
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
    if (!roomId || !presenceConfirmed) return;

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
  }, [roomId, presenceConfirmed]);

  // Poll recording status only after token is ready - notify when joining a meeting that is already being recorded.
  // Defer first check so we never show the popup during GrabDocs / HMS prejoin.
  useEffect(() => {
    if (!roomId || Platform.OS === 'web' || !joinConfig || !presenceConfirmed) return;

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
          setBannerQueue(prev => [...prev, { message: `${roomName} is being recorded. By staying, you consent to being recorded.`, type: 'recording' }]);
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
  }, [roomId, joinConfig, presenceConfirmed]);

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

      // Clear pending join group timer
      if (joinGroupTimerRef.current) {
        clearTimeout(joinGroupTimerRef.current);
        joinGroupTimerRef.current = null;
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
    } catch {
      /* notification scheduling is best-effort */
    }
  }, [meetingId, title, userName]);

  // Back / swipe: go to meeting list (Reach). Using replace avoids popping to (tabs)/Home first and keeps path correct (avoids grabdocs:/// unmatched route when tapping active meeting later).
  const goBackToApp = useCallback(() => {
    isNavigatingAwayRef.current = true;
    if (presenceConfirmed) {
      isMinimizingAwayRef.current = true;
    }
    router.replace('/quick-reach/meeting-call' as any);
  }, [router, presenceConfirmed]);

  const showPrejoinBack = !presenceConfirmed && !!meetingId;

  useEffect(() => {
    if (Platform.OS !== 'android' || !meetingId) return;
    const handler = () => {
      goBackToApp();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => subscription.remove();
  }, [meetingId, goBackToApp]);

  // Route swipe-back to the meeting list (prejoin cancel or in-call minimize).
  useEffect(() => {
    if (!meetingId) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (isNavigatingAwayRef.current) return;
      e.preventDefault();
      goBackToApp();
    });
    return unsubscribe;
  }, [navigation, meetingId, goBackToApp]);

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
        if (!authToken || !meetingId || !presenceConfirmed) return;

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
                    if (!inPip && authToken && meetingId && presenceConfirmed) {
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
  }, [authToken, meetingId, presenceConfirmed, showMeetingNotification, pipEnabled, pipModule]);

  // Screen wake lock: activate when in meeting
  useEffect(() => {
    if (authToken && meetingId && presenceConfirmed) {
      activateKeepAwake();
    } else {
      deactivateKeepAwake();
    }
    return () => {
      deactivateKeepAwake();
    };
  }, [authToken, meetingId, presenceConfirmed]);

  // Track current meeting for "one meeting at a time" and return-via-active-card
  useEffect(() => {
    if (authToken && meetingId && presenceConfirmed) {
      const id =
        resolvedStorageMeetingId ??
        canonicalizeReachMeetingId(String(meetingId));
      AsyncStorage.setItem(REACH_CURRENT_MEETING_KEY, id).catch(() => {});
    }
    return () => {};
  }, [authToken, meetingId, presenceConfirmed, resolvedStorageMeetingId]);

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
      const displayUserName = getHmsDisplayUserName(userName, user, meetingIdForDisplay);
      const passcodePayload = passcodeToken
        ? { passcode_token: passcodeToken }
        : (passcode as string)?.trim()
          ? { passcode: (passcode as string).trim() }
          : {};

      const joinById = async (forceJoin: boolean) => {
        return apiClient.client.post('/api/v1/video/room/join-by-id', {
          meeting_id: (meetingId as string).trim(),
          participant_name: displayUserName,
          enable_audio: false,
          enable_video: false,
          viewer_type: user ? 'host' : 'guest',
          join_intent: 'prepare',
          ...(forceJoin ? { force_join: true } : {}),
          ...passcodePayload,
        });
      };

      try {
        presenceConfirmSentRef.current = false;
        setPresenceConfirmed(false);
        let joinRes;
        try {
          joinRes = await joinById(forceJoinFromRoute);
        } catch (firstErr: any) {
          if (forceJoinFromRoute) {
            throw firstErr;
          }
          const st = firstErr?.response?.status;
          const code = firstErr?.response?.data?.error_code;
          if (st === 409 && code === 'ALREADY_IN_MEETING') {
            joinRes = await joinById(true);
          } else {
            throw firstErr;
          }
        }

        const raw = joinRes?.data || {};
        const data =
          raw && typeof (raw as any).data === 'object' && (raw as any).data != null ? (raw as any).data : raw;
        const token = (data as any).token;
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
          throw new Error('Join did not return a token');
        }
        const apiMeetingId =
          (data as any).meeting_id ??
          (data as any).meetingId ??
          (data as any).scheduled_meeting_id;
        const forStorage = canonicalizeReachMeetingId(
          apiMeetingId != null && String(apiMeetingId).trim() !== ''
            ? String(apiMeetingId)
            : String(meetingId)
        );
        joinConfirmContextRef.current = {
          meetingIdStr: (meetingId as string).trim(),
          token: token.trim(),
          displayName: displayUserName,
          viewerType: user ? 'host' : 'guest',
          passcodePayload: passcodePayload as Record<string, string>,
          startedWithForceJoin: forceJoinFromRoute,
        };
        setResolvedStorageMeetingId(forStorage);
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
        if (status === 409 || errData.error_code === 'ALREADY_IN_MEETING') {
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

      setIsLoading(false);
    } catch (error: any) {
      setError('Failed to initialize meeting interface. Please try again.');
      setIsLoading(false);
      errorLogger.logError(error, {
        severity: 'error',
        screenName: 'HMSMeetingInterface',
        userAction: 'Initialize HMS Interface',
        errorType: 'HMSInitializationFailed',
        userId: user?.id,
      });
    }
  };

  const handleHmsEnteredForPresenceConfirm = useCallback(async () => {
    if (presenceConfirmSentRef.current) return;
    presenceConfirmSentRef.current = true;
    const ctx = joinConfirmContextRef.current;
    if (!ctx.token || !ctx.meetingIdStr) {
      presenceConfirmSentRef.current = false;
      return;
    }

    const doConfirm = (forceJoin: boolean) =>
      apiClient.client.post('/api/v1/video/room/join-by-id/confirm', {
        meeting_id: ctx.meetingIdStr.trim(),
        participant_name: ctx.displayName,
        token: ctx.token,
        viewer_type: ctx.viewerType,
        ...(forceJoin ? { force_join: true } : {}),
        ...ctx.passcodePayload,
      });

    try {
      try {
        await doConfirm(ctx.startedWithForceJoin);
      } catch (firstErr: unknown) {
        const fe = firstErr as {
          response?: { status?: number; data?: { error_code?: string } };
        };
        if (
          !ctx.startedWithForceJoin &&
          fe?.response?.status === 409 &&
          fe?.response?.data?.error_code === 'ALREADY_IN_MEETING'
        ) {
          await doConfirm(true);
        } else {
          throw firstErr;
        }
      }
      setPresenceConfirmed(true);
    } catch (e) {
      console.error('[HMS] POST /join-by-id/confirm failed', e);
      presenceConfirmSentRef.current = false;
    }
  }, []);

  // Called by the presence bridge when a join attempt is detected but never connects (stuck).
  // Surfaces a friendly error and stops the endless HMS "Join" spinner. Ignored once we are
  // actually in the meeting (presence confirmed) so mid-call reconnects don't bounce the user.
  const handleConnectionStuck = useCallback(() => {
    if (presenceConfirmed) return;
    setIsLoading(false);
    setError('Couldn’t connect to the meeting. It may have ended or not started yet. Please try again.');
    errorLogger.logError(new Error('HMS join stuck: connecting but never entered room'), {
      severity: 'warning',
      screenName: 'HMSMeetingInterface',
      userAction: 'Join stuck',
      errorType: 'HMSJoinStuck',
      userId: user?.id,
    });
  }, [presenceConfirmed, user?.id]);

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
              } catch {
                /* ignore */
              }
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

  // Loading only while fetching token / preparing join (before HMS prejoin UI is shown)
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <PrejoinBackButton onPress={goBackToApp} topInset={insets.top} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Initializing GrabDocs Meeting...</Text>
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

  if (HMSPrebuilt && authToken && meetingId && orientationReadyForHms) {
    const roomCode = meetingId as string;
    const token = authToken;
    const displayUserName = getHmsDisplayUserName(userName, user, meetingIdForDisplay);
    
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

    if (Platform.OS !== 'web') applyGrabdocsHmsRoomKitJoinDefaults();

    try {
      // React Native HMSPrebuilt props format:
      // - token - required for token-based join (mutually exclusive with roomCode)
      // - roomCode - only used for room-link-based join (not used here; backend issues a token)
      // - options: { userName, userId, ios?: { appGroup, preferredExtension } } - optional
      // - onLeave - callback when leaving
      // iOS screenshare: pass appGroup + preferredExtension so prebuilt can start screen share (see docs/MOBILE_SCREENSHARE_WHITEBOARD.md)
      const hmsProps = {
        token: token.trim(),
        // roomCode is intentionally omitted: token and roomCode are mutually exclusive join
        // methods. Passing both causes HMS to attempt a room-code lookup with the GrabDocs
        // numeric meeting ID (not a valid 100ms room code), which silently fails and leaves
        // the "Join" button spinning. The backend already supplies an auth token via
        // /api/v1/video/room/join-by-id, so token-only join is the correct path.
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

      return (
        <>
          <MeetingPresenceConfirmBridge
            enabled={!!joinConfig && !!authToken && !hmsError}
            onEnteredRoom={handleHmsEnteredForPresenceConfirm}
            onConnectionStuck={handleConnectionStuck}
          />
          {/* Join sound after GrabDocs presence + short delay (useHMSPeerUpdates needs room context) */}
          {HMSPrebuilt && joinSoundReady && (
            <MeetingJoinSound enabled={!!authToken && !!meetingId && presenceConfirmed} onPeerJoined={handlePeerJoined} />
          )}

          {/* In-meeting event banners (recording started, peer joined) — must be dismissed by tapping OK */}
          <Modal
            visible={bannerQueue.length > 0 && !!joinConfig && !hmsError}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={dismissBanner}
          >
            <View style={styles.networkOverlay} pointerEvents="box-none">
              {bannerQueue.length > 0 && (
                <View style={styles.networkBanner}>
                  <View style={[styles.networkDot, { backgroundColor: bannerQueue[0].type === 'recording' ? '#FF3B30' : '#007AFF' }]} />
                  <Text style={[styles.networkBannerTitle, { flex: 1 }]}>{bannerQueue[0].message}</Text>
                  <TouchableOpacity style={styles.networkLeaveButton} onPress={dismissBanner}>
                    <Text style={styles.networkLeaveButtonText}>OK</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Modal>

          {/* Network status overlay — rendered as a Modal so it appears above the HMS native UI.
              Shows a friendly banner instead of the raw "code: 1003" HMS error. */}
          <Modal
            visible={(isNetworkDown || showReconnected) && !!joinConfig && !!presenceConfirmed && !hmsError}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => {}}
          >
            <View style={styles.networkOverlay} pointerEvents="box-none">
              <View style={[styles.networkBanner, showReconnected && !isNetworkDown && styles.networkBannerOnline]}>
                {isNetworkDown ? (
                  <>
                    <View style={styles.networkDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.networkBannerTitle}>Connection lost</Text>
                      <Text style={styles.networkBannerSubtitle}>Trying to reconnect…</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.networkLeaveButton}
                      onPress={async () => {
                        if (networkPollRef.current) clearInterval(networkPollRef.current);
                        try {
                          await AsyncStorage.removeItem(REACH_CURRENT_MEETING_KEY);
                        } catch {
                          /* ignore */
                        }
                        try {
                          if (meetingId) await apiClient.client.post(`/api/v1/mobile/meetings/${meetingId}/leave`);
                        } catch {
                          /* ignore */
                        }
                        router.replace('/quick-reach/meeting-call' as any);
                      }}
                    >
                      <Text style={styles.networkLeaveButtonText}>Leave</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={[styles.networkDot, { backgroundColor: '#34C759' }]} />
                    <Text style={styles.networkBannerTitle}>Reconnected</Text>
                  </>
                )}
              </View>
            </View>
          </Modal>

          <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.meetingContentWrapper}>
          {hmsError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>HMS Error</Text>
              <Text style={styles.errorMessage}>
                {hmsError || 'HMS component failed to initialize. This may be a native module issue.'}
              </Text>

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
              <HMSErrorBoundary
                onError={(error) => {
                  console.error('📱 [HMS] Prebuilt Error Boundary:', error);
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
                    <PrejoinBackButton onPress={goBackToApp} topInset={insets.top} />
                    <Text style={styles.loadingText}>Checking permissions...</Text>
                  </View>
                ) : (
                  <View style={[styles.prebuiltWrapper, { paddingBottom: bottomInset }]}>
                    {/* PiP: Square, smaller window on both platforms. Video preview enabled by 100ms (useActiveSpeaker: true). iOS: UIBackgroundModes ["voip"] + plugins/ios-pip. Android: plugins/android-pip + GrabDocsPipModule (1:1). See docs/PIP_MOBILE_SETUP.md if PiP shows black. */}
                    <HMSPrebuilt 
                      token={hmsProps.token}
                      options={hmsProps.options}
                      autoEnterPipMode={Platform.OS !== 'web'}
                      pipConfig={Platform.OS !== 'web' ? { aspectRatio: [1, 1] } : undefined}
                      onLeave={async () => {
                        setIsLoading(false);

                        // Swipe/back to list while in-call — keep REACH_CURRENT_MEETING_KEY so user can return.
                        if (isMinimizingAwayRef.current) {
                          return;
                        }

                        // Prejoin cancel (HMS back) — never joined; no leave API.
                        if (!presenceConfirmed) {
                          if (!isNavigatingAwayRef.current) {
                            isNavigatingAwayRef.current = true;
                            router.replace('/quick-reach/meeting-call' as any);
                          }
                          return;
                        }

                        try {
                          await AsyncStorage.removeItem(REACH_CURRENT_MEETING_KEY);
                        } catch {
                          /* ignore */
                        }
                        try {
                          if (meetingId) {
                            await apiClient.client.post(`/api/v1/mobile/meetings/${meetingId}/leave`);
                          }
                        } catch (error: any) {
                          console.error('⚠️ [LEAVE] Error calling leave endpoint:', error);
                        }

                        isNavigatingAwayRef.current = true;
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

  if (HMSPrebuilt && authToken && meetingId && !orientationReadyForHms && Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <PrejoinBackButton onPress={goBackToApp} topInset={insets.top} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Initializing GrabDocs Meeting...</Text>
        </View>
      </SafeAreaView>
    );
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
          <Text style={styles.meetingInfoValue}>{getHmsDisplayUserName(userName, user, meetingIdForDisplay)}</Text>
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
    position: 'relative',
  },
  prejoinBackContainer: {
    position: 'absolute',
    left: 12,
    zIndex: 2000,
    elevation: 2000,
  },
  prejoinBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
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
  // Network overlay styles
  networkOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  networkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 12,
    minWidth: 240,
  },
  networkBannerOnline: {
    backgroundColor: 'rgba(20, 50, 20, 0.95)',
  },
  networkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  networkBannerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  networkBannerSubtitle: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  networkLeaveButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  networkLeaveButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});