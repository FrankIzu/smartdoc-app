import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { formatMeetingTimeToLocal } from '../../utils/timeFormatting';
import { useAuth } from '../context/auth';
import { REACH_CURRENT_MEETING_KEY } from './hms-meeting-interface';

interface Meeting {
  id: string;
  title: string;
  meetingId: string;
  host: string;
  participants: number;
  startTime: string;
  endTime?: string;
  status: 'scheduled' | 'created' | 'active' | 'ended';
  passcode?: string;
  roomUrl?: string;
  description?: string;
  duration?: number;
  createdAt?: string;
}

/** Keys `id:<meetingId>` / `title:<normalized>` for meetings that have ≥1 asset (from getMeetingAssets). */
function buildMeetingsWithAssetsMap(data: unknown): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  const markId = (id: string | number | null | undefined) => {
    if (id == null) return;
    const s = String(id).trim();
    if (s) map[`id:${s}`] = true;
  };
  const markTitle = (title: string | null | undefined) => {
    const t = (title || '').toLowerCase().trim();
    if (t) map[`title:${t}`] = true;
  };

  if (!data || typeof data !== 'object') return map;
  const d = data as { meetings?: unknown[]; assets?: unknown[] };

  if (Array.isArray(d.meetings)) {
    for (const meet of d.meetings) {
      if (!meet || typeof meet !== 'object') continue;
      const m = meet as Record<string, unknown>;
      const n =
        (Array.isArray(m.assets) ? m.assets.length : 0) +
        (Array.isArray(m.files) ? m.files.length : 0);
      if (n === 0) continue;
      markId(m.id as string | number);
      markId(m.meeting_id as string | number);
      markId(m.meetingId as string | number);
      markId(m.hms_meeting_id as string | number);
      markTitle(m.title as string);
      markTitle(m.meeting_title as string);
    }
  }

  if (Array.isArray(d.assets)) {
    for (const asset of d.assets) {
      if (!asset || typeof asset !== 'object') continue;
      const a = asset as Record<string, unknown>;
      markId((a.meeting_id ?? a.meetingId) as string | number);
      markTitle(a.meeting_title as string);
    }
  }

  return map;
}

function meetingHasKnownAssets(m: Meeting, presence: Record<string, boolean>): boolean {
  const id = String(m.meetingId || m.id || '').trim();
  const title = (m.title || '').toLowerCase().trim();
  if (id && presence[`id:${id}`]) return true;
  if (title && presence[`title:${title}`]) return true;
  return false;
}

export default function MeetingCallScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const isAuthenticated = !!user;
  
  console.log('🔄 MeetingCallScreen rendered, isAuthenticated:', isAuthenticated);
  
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [ongoingMeetings, setOngoingMeetings] = useState<Meeting[]>([]);
  const [assetPresenceMap, setAssetPresenceMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [meetingId, setMeetingId] = useState('');
  const [meetingPassword, setMeetingPassword] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [infoMeeting, setInfoMeeting] = useState<Meeting | null>(null);
  const [meetingInfoData, setMeetingInfoData] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [featuresExpanded, setFeaturesExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isJoining, setIsJoining] = useState(false);

  // Use keyboard height for padding so join modal stays above keyboard on both Android and iOS
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadMeetings = useCallback(async () => {
    if (!isAuthenticated) {
      console.log('📱 User not authenticated, skipping meetings load');
      setAssetPresenceMap({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);
      
      // One getMeetingAssets() populates folder icons (cached for meeting-details — not N per row).
      const startTime = Date.now();
      const meetingsResponse = await apiClient.getMeetings(10, 0);
      const loadTime = Date.now() - startTime;
      console.log(`📱 Meetings loaded in ${loadTime}ms`);

      // Handle meetings response (critical path)
      // Support multiple response formats:
      // 1. { success: true, data: { meetings: [] } }
      // 2. { success: true, data: [] } (data is array)
      // 3. { success: true, meetings: [] }
      // 4. { meetings: [] }
      // 5. Array directly
      let allMeetings: any[] = [];
      if (Array.isArray(meetingsResponse)) {
        allMeetings = meetingsResponse;
      } else if (meetingsResponse?.data) {
        if (Array.isArray(meetingsResponse.data)) {
          allMeetings = meetingsResponse.data;
        } else {
          allMeetings = meetingsResponse.data.meetings || [];
        }
      } else if ((meetingsResponse as any)?.meetings) {
        allMeetings = Array.isArray((meetingsResponse as any).meetings) ? (meetingsResponse as any).meetings : [];
      } else {
        allMeetings = [];
      }
      
      // Process meetings if we have any or if there's a response
      if (allMeetings.length > 0 || meetingsResponse) {
        
        console.log(`📱 Processing ${allMeetings.length} meetings from backend`);
        console.log('📱 Raw meetings response structure:', {
          hasData: !!meetingsResponse?.data,
          hasMeetingsInData: !!meetingsResponse?.data?.meetings,
          hasMeetingsAtRoot: !!(meetingsResponse as any)?.meetings,
          meetingsCount: allMeetings.length,
          firstMeetingSample: allMeetings[0] ? Object.keys(allMeetings[0]) : []
        });
        
        // Normalize meeting data to handle different backend field names
        const normalizedMeetings = allMeetings.map((m: any) => {
          // Map different field names to our Meeting interface
          return {
            id: m.id || m.meeting_id || m.meetingId || '',
            title: m.title || m.name || m.roomName || m.room_name || 'Untitled Meeting',
            meetingId: m.meetingId || m.meeting_id || m.id || '',
            host: m.host || m.host_name || m.hostName || 'Unknown',
            participants: m.participants || m.participant_count || 0,
            startTime: m.startTime || m.start_time || m.start_at || m.scheduled_time || m.scheduled_at || '',
            endTime: m.endTime || m.end_time || m.end_at || '',
            status: m.status || m.meeting_status || 'created',
            passcode: m.passcode || undefined,
            roomUrl: m.roomUrl || m.room_url || m.url || undefined,
            description: m.description || undefined,
            duration: m.duration || m.meeting_duration_minutes || undefined,
            createdAt: m.createdAt || m.created_at || m.created || undefined
          } as Meeting;
        });
        
        // Sort meetings by date (most recent first) BEFORE deduplication
        const sortedMeetings = normalizedMeetings.sort((a: Meeting, b: Meeting) => {
          const dateA = new Date(a.startTime || a.createdAt || 0).getTime();
          const dateB = new Date(b.startTime || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        
        // Deduplicate meetings by title - keep only the most recent occurrence of each unique meeting name
        const uniqueMeetingsMap = new Map<string, Meeting>();
        const duplicatesFound: string[] = [];
        
        sortedMeetings.forEach((meeting: Meeting, index: number) => {
          const normalizedTitle = (meeting.title || '').toLowerCase().trim();
          
          if (!normalizedTitle || normalizedTitle === 'untitled meeting') {
            console.warn(`📱 Meeting at index ${index} has no valid title, skipping`);
            return;
          }
          
          // Only keep the first occurrence (most recent due to prior sorting)
          if (!uniqueMeetingsMap.has(normalizedTitle)) {
            uniqueMeetingsMap.set(normalizedTitle, meeting);
            if (index < 5) {
              console.log(`📱 Adding unique meeting "${meeting.title}" (${meeting.startTime || meeting.createdAt})`);
            }
          } else {
            duplicatesFound.push(`"${meeting.title}" (${meeting.startTime || meeting.createdAt})`);
            if (duplicatesFound.length <= 5) {
              console.log(`📱 Skipping duplicate: "${meeting.title}" (${meeting.startTime || meeting.createdAt})`);
            }
          }
        });
        
        const uniqueMeetings = Array.from(uniqueMeetingsMap.values());
        console.log(`📱 Deduplicated ${duplicatesFound.length} duplicate meetings`);
        console.log(`📱 Showing ${uniqueMeetings.length} unique meetings (deduplicated from ${allMeetings.length} total)`);
        
        setMeetings(uniqueMeetings);
        
        // Filter meetings by status and time
        // Upcoming: Scheduled meetings with a future startTime OR newly created meetings (status="created" or without start_at/end_at)
        // Recent: Ended meetings OR created/scheduled meetings without startTime (immediate meetings)
        const now = new Date();
        const upcoming = uniqueMeetings.filter((m: Meeting) => {
          // Check if meeting has no start_at/end_at (no startTime or empty startTime)
          const hasNoStartTime = !m.startTime || 
                                 (typeof m.startTime === 'string' && m.startTime.trim() === '') ||
                                 m.startTime === null ||
                                 m.startTime === undefined;
          
          // Rule 1: Include meetings with status="created" - these are newly created meetings
          // Even if they have a startTime (which might be the creation timestamp), they should be in upcoming
          // This is the primary requirement: "if a meeting is newly created and has not start_at or end_at date, then show it in upcoming meeting"
          if (m.status === 'created') {
            console.log(`✅ Meeting "${m.title}" included in upcoming: newly created meeting (status="created")`);
            return true;
          }
          
          // Rule 2: Include newly created meetings without start_at/end_at (regardless of status, except ended)
          if (hasNoStartTime && m.status !== 'ended') {
            console.log(`✅ Meeting "${m.title}" included in upcoming: newly created without start_at/end_at (status="${m.status}")`);
            return true;
          }
          
          // Rule 3: Include scheduled meetings with a startTime in the future
          if (m.status === 'scheduled' && !hasNoStartTime) {
            try {
              const startTime = new Date(m.startTime);
              if (isNaN(startTime.getTime())) {
                // Invalid date, treat as no startTime
                console.log(`✅ Meeting "${m.title}" included in upcoming: scheduled but invalid startTime, treating as newly created`);
                return true;
              }
              const isFuture = startTime > now;
              if (isFuture) {
                console.log(`✅ Meeting "${m.title}" included in upcoming: scheduled with future startTime (${m.startTime})`);
                return true;
              } else {
                console.log(`❌ Meeting "${m.title}" excluded from upcoming: scheduled but startTime in past (${m.startTime})`);
                return false;
              }
            } catch (e) {
              console.warn(`⚠️ Meeting "${m.title}" has invalid startTime format: ${m.startTime}, treating as newly created`);
              // If startTime is invalid, treat as no startTime (newly created)
              return true;
            }
          }
          
          // Exclude all other meetings from upcoming
          console.log(`❌ Meeting "${m.title}" excluded from upcoming: status="${m.status}", hasNoStartTime=${hasNoStartTime}, startTime="${m.startTime}"`);
          return false;
        });
        
        let ongoing = uniqueMeetings.filter((m: Meeting) => 
          m.status === 'active'
        );
        // If user is in a meeting (local key set), that meeting MUST appear in active section
        const currentId = await AsyncStorage.getItem(REACH_CURRENT_MEETING_KEY);
        if (currentId && currentId.trim() !== '') {
          const inOngoing = ongoing.some((m: Meeting) => (m.meetingId || m.id) === currentId.trim());
          if (!inOngoing) {
            const fromList = uniqueMeetings.find((m: Meeting) => (m.meetingId || m.id) === currentId.trim());
            if (fromList) {
              ongoing = [{ ...fromList, status: 'active' as const }, ...ongoing];
            } else {
              ongoing = [{
                id: currentId.trim(),
                meetingId: currentId.trim(),
                title: 'Active meeting',
                host: 'You',
                participants: 0,
                startTime: '',
                status: 'active',
              }, ...ongoing];
            }
            console.log('📱 Included current meeting in active section:', currentId.trim());
          }
        }
        
        setUpcomingMeetings(upcoming);
        setOngoingMeetings(ongoing);

        try {
          const ar = await apiClient.getMeetingAssets();
          if (ar?.success && ar.data) {
            setAssetPresenceMap(buildMeetingsWithAssetsMap(ar.data));
          } else {
            setAssetPresenceMap({});
          }
        } catch (assetErr) {
          console.warn('📱 Could not load asset presence for meeting list:', assetErr);
          setAssetPresenceMap({});
        }
        
        // Calculate recent meetings count (for logging)
        const recentCount = uniqueMeetings.filter(m => {
          if (m.status === 'ended') return true;
          if ((m.status === 'created' || m.status === 'scheduled') && !m.startTime) return true;
          return false;
        }).length;
        
        console.log(`📱 Loaded ${uniqueMeetings.length} unique meetings in ${loadTime}ms:`, {
          total: uniqueMeetings.length,
          upcoming: upcoming.length,
          ongoing: ongoing.length,
          recent: recentCount,
          duplicatesRemoved: allMeetings.length - uniqueMeetings.length
        });
        
        // Debug: Log the actual status values from backend and upcoming filter results
        console.log('📱 Meeting statuses from backend:', uniqueMeetings.map((m: Meeting) => {
          const hasNoStartTime = !m.startTime || 
                                 (typeof m.startTime === 'string' && m.startTime.trim() === '') ||
                                 m.startTime === null ||
                                 m.startTime === undefined;
          const isInUpcoming = upcoming.includes(m);
          return {
            title: m.title,
            status: m.status,
            startTime: m.startTime,
            hasStartTime: !!m.startTime && !hasNoStartTime,
            hasNoStartTime: hasNoStartTime,
            isInUpcoming: isInUpcoming,
            category: m.status === 'ended' ? 'recent' : 
                      (m.status === 'scheduled' && !hasNoStartTime ? 'upcoming' : 
                       (m.status === 'active' ? 'ongoing' : 
                        (hasNoStartTime ? 'upcoming (newly created)' : 'other')))
          };
        }));
      } else {
        // No meetings found or failed to load - show empty state (unless user has current meeting)
        console.log('📱 No meetings found or failed to load');
        setAssetPresenceMap({});
        setMeetings([]);
        setUpcomingMeetings([]);
        const currentId = await AsyncStorage.getItem(REACH_CURRENT_MEETING_KEY);
        if (currentId && currentId.trim() !== '') {
          setOngoingMeetings([{
            id: currentId.trim(),
            meetingId: currentId.trim(),
            title: 'Active meeting',
            host: 'You',
            participants: 0,
            startTime: '',
            status: 'active',
          }]);
          console.log('📱 Showing current meeting in active section (no list from API):', currentId.trim());
        } else {
          setOngoingMeetings([]);
        }
      }
    } catch (error: any) {
      // This catch block should rarely be hit now since we use allSettled
      // But keep it as a safety net
      console.error('Unexpected error in loadMeetings:', error);
      setAssetPresenceMap({});
      setMeetings([]);
      setUpcomingMeetings([]);
      setOngoingMeetings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && !hasLoadedOnce) {
      console.log('📱 Initial load triggered by authentication');
      setHasLoadedOnce(true);
      loadMeetings();
    } else if (!isAuthenticated) {
      setLoading(false);
    } else if (hasLoadedOnce) {
      console.log('📱 Skipping duplicate load - already loaded once');
    }
  }, [isAuthenticated, hasLoadedOnce, loadMeetings]);

  // Reload meetings when screen comes into focus (e.g., after creating a meeting)
  // Use a ref to track last load time to prevent excessive reloads
  const lastLoadTimeRef = useRef<number>(0);
  const RELOAD_DEBOUNCE_MS = 2000; // Don't reload if less than 2 seconds since last load
  
  useFocusEffect(
    useCallback(() => {
      // Only reload if user is authenticated and we've already loaded once
      // Add debounce to prevent excessive reloads when quickly switching screens
      const now = Date.now();
      if (isAuthenticated && hasLoadedOnce && (now - lastLoadTimeRef.current > RELOAD_DEBOUNCE_MS)) {
        console.log('📱 Screen focused - reloading meetings to show new meetings');
        lastLoadTimeRef.current = now;
        loadMeetings();
      }
    }, [isAuthenticated, hasLoadedOnce, loadMeetings])
  );

  const handleRefresh = useCallback(() => {
    console.log('📱 Manual refresh triggered');
    setRefreshing(true);
    loadMeetings();
  }, [loadMeetings]);

  const createMeeting = () => {
    router.push('/quick-reach/create-meeting');
  };

  const scheduleMeeting = () => {
    router.push('/quick-reach/schedule-meeting');
  };

  const navigateToMeetingScreen = (params: { meetingId: string; title: string; userName?: string; passcode?: string }) => {
    const q = new URLSearchParams({
      meetingId: params.meetingId,
      title: params.title,
      userName: params.userName || 'Mobile User'
    });
    if (params.passcode) q.set('passcode', params.passcode);
    router.replace(`/quick-reach/hms-meeting-interface?${q.toString()}` as any);
  };

  const joinMeeting = async (meeting: Meeting, forceJoin: boolean = false) => {
    if (isJoining) return;
    // One meeting at a time: block joining another meeting if already in one
    if (!forceJoin) {
      try {
        const currentId = await AsyncStorage.getItem(REACH_CURRENT_MEETING_KEY);
        if (currentId && currentId.trim() !== '' && currentId !== meeting.meetingId) {
          Alert.alert(
            'Already in a meeting',
            'You can only be in one meeting at a time. Please leave the current meeting first, then join this one.',
            [{ text: 'OK', style: 'cancel' }]
          );
          return;
        }
      } catch (_) {}
    }
    setIsJoining(true);
    try {
      const response = await apiClient.joinMeeting({
        meetingId: meeting.meetingId,
        passcode: meeting.passcode || undefined,
        force_join: forceJoin || undefined
      });

      const resp = response as any;
      if (resp.type === 'already_in_meeting') {
        Alert.alert(
          "You're already in this meeting.",
          resp.message || "You're already participating in this meeting. Would you like to end your current session and join again?",
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Disconnect & Rejoin',
              onPress: () => joinMeeting(meeting, true)
            }
          ]
        );
        return;
      }

      if (!response.success) {
        Alert.alert('Error', (response as any).message || 'Failed to join meeting');
        return;
      }

      if (meeting.passcode && !(response as any).data?.password) {
        Alert.prompt(
          'Meeting Passcode',
          'This is a private meeting. Enter the passcode:',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Join',
              onPress: async (passcode?: string) => {
                if (passcode) {
                  if (isJoining) return;
                  setIsJoining(true);
                  try {
                    const retryResponse = await apiClient.joinMeeting({
                      meetingId: meeting.meetingId,
                      passcode,
                      force_join: forceJoin || undefined
                    });
                    const retry = retryResponse as any;
                    if (retry.type === 'already_in_meeting') {
                      Alert.alert(
                        "You're already in this meeting.",
                        retry.message || "Would you like to end your current session and join again?",
                        [
                          { text: 'OK', style: 'cancel' },
                          { text: 'Disconnect & Rejoin', onPress: () => joinMeeting(meeting, true) }
                        ]
                      );
                      return;
                    }
                    if (retryResponse.success && retryResponse.data) {
                      navigateToMeetingScreen({
                        meetingId: (retryResponse.data as any).meetingId || meeting.meetingId,
                        title: (retryResponse.data as any).title || meeting.title,
                        passcode
                      });
                    } else {
                      Alert.alert('Error', (retryResponse as any).message || 'Invalid passcode');
                    }
                  } catch (error: any) {
                    Alert.alert('Error', error.message || 'Failed to join meeting. Please check the passcode.');
                  } finally {
                    setIsJoining(false);
                  }
                } else {
                  Alert.alert('Error', 'Passcode is required for private meetings');
                }
              }
            }
          ],
          'secure-text'
        );
        return;
      }

      navigateToMeetingScreen({
        meetingId: (response as any).data?.meetingId || meeting.meetingId,
        title: (response as any).data?.title || meeting.title,
        passcode: meeting.passcode || undefined
      });
    } catch (error: any) {
      console.error('Failed to join meeting:', error);
      Alert.alert('Error', error.message || 'Failed to join meeting. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const viewMeetingAssets = (meeting: Meeting, options?: { fromAssetsIcon?: boolean }) => {
    router.push({
      pathname: '/quick-reach/meeting-details',
      params: {
        meetingId: meeting.meetingId,
        meetingTitle: meeting.title,
        roomCode: meeting.meetingId,
        ...(options?.fromAssetsIcon ? { entry: 'assets' } : {}),
      },
    });
  };

  const joinMeetingById = async () => {
    if (isJoining) return;
    if (!meetingId.trim()) {
      Alert.alert('Error', 'Please enter a meeting ID');
      return;
    }
    const savedMeetingId = meetingId.trim();
    // One meeting at a time
    try {
      const currentId = await AsyncStorage.getItem(REACH_CURRENT_MEETING_KEY);
      if (currentId && currentId.trim() !== '' && currentId !== savedMeetingId) {
        Alert.alert(
          'Already in a meeting',
          'You can only be in one meeting at a time. Please leave the current meeting first, then join this one.',
          [{ text: 'OK', style: 'cancel' }]
        );
        return;
      }
    } catch (_) {}
    setIsJoining(true);
    const savedPassword = meetingPassword.trim();
    try {
      const response = await apiClient.joinMeeting({
        meetingId: savedMeetingId,
        passcode: savedPassword || undefined,
        force_join: undefined
      });

      const resp = response as any;
      if (resp.type === 'already_in_meeting') {
        Alert.alert(
          "You're already in this meeting.",
          resp.message || "Would you like to end your current session and join again?",
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Disconnect & Rejoin',
              onPress: async () => {
                if (isJoining) return;
                setIsJoining(true);
                try {
                  const retryResponse = await apiClient.joinMeeting({
                    meetingId: savedMeetingId,
                    passcode: savedPassword || undefined,
                    force_join: true
                  });
                  const retry = retryResponse as any;
                  if (retry.type === 'already_in_meeting') {
                    Alert.alert('Error', (retryResponse as any).message || 'Could not rejoin.');
                    return;
                  }
                  if (retryResponse.success && retryResponse.data) {
                    setShowJoinModal(false);
                    setMeetingId('');
                    setMeetingPassword('');
                    navigateToMeetingScreen({
                      meetingId: (retryResponse.data as any).meetingId || savedMeetingId,
                      title: (retryResponse.data as any).title || 'Meeting'
                    });
                  } else {
                    Alert.alert('Error', (retryResponse as any).message || 'Invalid meeting ID or passcode');
                  }
                } finally {
                  setIsJoining(false);
                }
              }
            }
          ]
        );
        return;
      }

      if (response.success && response.data) {
        setShowJoinModal(false);
        setMeetingId('');
        setMeetingPassword('');
        navigateToMeetingScreen({
          meetingId: (response.data as any).meetingId || savedMeetingId,
          title: (response.data as any).title || 'Meeting'
        });
      } else {
        Alert.alert('Error', (response as any).message || 'Invalid meeting ID or passcode');
      }
    } catch (error: any) {
      console.error('Failed to join meeting:', error);
      Alert.alert('Error', error.message || 'Failed to join meeting. Please check the meeting ID and passcode.');
    } finally {
      setIsJoining(false);
    }
  };

  const endMeeting = async (meeting: Meeting) => {
    Alert.alert(
      'End Meeting',
      'Are you sure you want to end this meeting?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Meeting',
          style: 'destructive',
          onPress: async () => {
            const roomId = meeting.id || meeting.meetingId;
            Toast.show({ type: 'info', text1: 'Ending meeting...', visibilityTime: 2000 });
            const clearCurrentMeetingKey = () => {
              AsyncStorage.removeItem(REACH_CURRENT_MEETING_KEY).catch(() => {});
            };
            try {
              const response = await apiClient.endMeeting(roomId);
              if (response.success) {
                clearCurrentMeetingKey();
                Alert.alert('Success', 'Meeting ended successfully');
                loadMeetings();
                return;
              }
              if ((response as any).requires_confirmation) {
                const count = (response as any).active_participants_count ?? 0;
                if (count > 1) {
                  Toast.show({
                    type: 'info',
                    text1: 'Others still in meeting',
                    text2: 'Do you want to end the meeting for everyone?',
                    visibilityTime: 4000,
                  });
                  Alert.alert(
                    'End meeting anyway?',
                    'Others are still in the meeting. Do you want to end the meeting for everyone?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'End meeting',
                        style: 'destructive',
                        onPress: async () => {
                          Toast.show({ type: 'info', text1: 'Ending meeting...', visibilityTime: 2000 });
                          try {
                            const forceResponse = await apiClient.endMeeting(roomId, true);
                            if (forceResponse.success) {
                              clearCurrentMeetingKey();
                              Alert.alert('Success', 'Meeting ended successfully.');
                              loadMeetings();
                            } else {
                              Alert.alert('Error', (forceResponse as any).message || 'Failed to end meeting');
                            }
                          } catch (err: any) {
                            console.error('Force end meeting failed:', err);
                            Alert.alert('Error', err?.message || 'Failed to end meeting');
                          }
                        },
                      },
                    ]
                  );
                } else {
                  Toast.show({ type: 'info', text1: 'Ending meeting...', visibilityTime: 2000 });
                  try {
                    const forceResponse = await apiClient.endMeeting(roomId, true);
                    if (forceResponse.success) {
                      clearCurrentMeetingKey();
                      Alert.alert('Success', 'Meeting ended successfully.');
                      loadMeetings();
                    } else {
                      Alert.alert('Error', (forceResponse as any).message || 'Failed to end meeting');
                    }
                  } catch (err: any) {
                    console.error('Force end meeting failed:', err);
                    Alert.alert('Error', err?.message || 'Failed to end meeting');
                  }
                }
                return;
              }
              Alert.alert('Error', (response as any).message || 'Failed to end meeting');
            } catch (error: any) {
              console.error('Failed to end meeting:', error);
              Alert.alert('Error', error?.message || 'Failed to end meeting');
            }
          },
        },
      ]
    );
  };

  const deleteMeeting = async (meeting: Meeting) => {
    Alert.alert(
      'Delete Meeting',
      'Are you sure you want to delete this meeting?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiClient.deleteMeeting(meeting.id);
              
              if (response.success) {
                Alert.alert('Success', 'Meeting deleted successfully');
                loadMeetings(); // Refresh the list
              } else if (response.requires_confirmation) {
                // Show confirmation dialog for meetings with assets
                Alert.alert(
                  'Confirm Deletion',
                  response.message,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Delete Permanently', 
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const confirmResponse = await apiClient.deleteMeeting(meeting.id, true);
                          if (confirmResponse.success) {
                            Alert.alert('Success', 'Meeting and all assets deleted successfully');
                            loadMeetings(); // Refresh the list
                          } else {
                            Alert.alert('Error', confirmResponse.message || 'Failed to delete meeting');
                          }
                        } catch (error: any) {
                          Alert.alert('Error', error.message || 'Failed to delete meeting');
                        }
                      }
                    }
                  ]
                );
              } else {
                Alert.alert('Error', response.message || 'Failed to delete meeting');
              }
            } catch (error: any) {
              console.error('Failed to delete meeting:', error);
              Alert.alert('Error', error.message || 'Failed to delete meeting');
            }
          }
        }
      ]
    );
  };

  const addInviteEmail = () => {
    if (newInviteEmail.trim() && !inviteEmails.includes(newInviteEmail.trim().toLowerCase())) {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(newInviteEmail.trim())) {
        setInviteEmails(prev => [...prev, newInviteEmail.trim().toLowerCase()]);
        setNewInviteEmail('');
      } else {
        Alert.alert('Error', 'Please enter a valid email address');
      }
    }
  };

  const removeInviteEmail = (email: string) => {
    setInviteEmails(prev => prev.filter(e => e !== email));
  };

  const inviteToMeeting = async () => {
    if (!selectedMeeting || inviteEmails.length === 0) {
      Alert.alert('Error', 'Please add at least one email address');
      return;
    }

    try {
      const response = await apiClient.sendMeetingInvite(selectedMeeting.meetingId, {
        emails: inviteEmails,
        message: inviteMessage.trim()
      });

      if (response.success) {
        const count = inviteEmails.length;
        Alert.alert('Success', `Invitation${count > 1 ? 's' : ''} sent successfully to ${count} recipient${count > 1 ? 's' : ''}`);
        setShowInviteModal(false);
        setInviteEmails([]);
        setNewInviteEmail('');
        setInviteMessage('');
        setSelectedMeeting(null);
      } else {
        Alert.alert('Error', response.message || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Failed to send invitation:', error);
      Alert.alert('Error', 'Failed to send invitation');
    }
  };

  const copyMeetingDetails = async (meeting: Meeting) => {
    try {
      // Use the same backend endpoint as web to get the properly formatted invitation text
      const response = await apiClient.copyMeetingInvite(meeting.meetingId);
      
      if (response.success && response.data?.invite_message) {
        // Use the invitation message from backend (same format as web)
        await Clipboard.setStringAsync(response.data.invite_message);
        Alert.alert('Copied', 'Meeting invitation copied to clipboard');
      } else {
        // Fallback to basic details if backend doesn't return invite_message
        let details = `Meeting: ${meeting.title}\n`;
        details += `Meeting ID: ${meeting.meetingId}\n`;
        if (meeting.passcode) {
          details += `Passcode: ${meeting.passcode}\n`;
        }
        if (meeting.roomUrl) {
          details += `Room URL: ${meeting.roomUrl}\n`;
        }
        await Clipboard.setStringAsync(details);
        Alert.alert('Copied', 'Meeting details copied to clipboard');
      }
    } catch (error) {
      console.error('Copy error:', error);
      Alert.alert('Error', 'Failed to copy meeting invitation');
    }
  };

  const showMeetingInfo = async (meeting: Meeting) => {
    setInfoMeeting(meeting);
    setShowInfoModal(true);
    setLoadingInfo(true);
    setMeetingInfoData(null);
    
    try {
      const response = await apiClient.getMeetingInfo(meeting.meetingId);
      if (response.success) {
        const roomData = response.data?.data || response.data || response;
        setMeetingInfoData(roomData);
      }
    } catch (_error) {
      // Non-fatal: info modal will show loading/empty state
    } finally {
      setLoadingInfo(false);
    }
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
      marginRight: 8,
    },
    headerSpacer: {
      width: 40,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    refreshButton: {
      padding: 8,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textSecondary,
    },
    quickActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 20,
      backgroundColor: colors.card,
      marginBottom: 8,
      gap: 12,
    },
    actionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 70,
      minWidth: 90,
      maxWidth: 120,
    },
    actionButtonText: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    meetingsList: {
      padding: 20,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    horizontalList: {
      paddingRight: 20,
    },
    // Same border for live and recent meetings (user can only be in one at a time)
    meetingCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      marginRight: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
      minWidth: 280,
    },
    meetingHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    meetingTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
      marginRight: 8,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusOngoing: {
      backgroundColor: '#34C759',
    },
    statusScheduled: {
      backgroundColor: '#007AFF',
    },
    statusCreated: {
      backgroundColor: '#FF9500',
    },
    statusEnded: {
      backgroundColor: '#8E8E93',
    },
    statusText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#fff',
    },
    meetingDetails: {
      marginBottom: 12,
    },
    meetingHost: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    meetingTime: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    meetingMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    meetingMetaCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
    meetingTimeCompact: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    detailText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    detailTextCompact: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    meetingActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    actionIcon: {
      padding: 8,
      borderRadius: 6,
      backgroundColor: colors.surface,
    },
    emptyState: {
      alignItems: 'center',
      padding: 40,
      marginTop: 40,
    },
    emptyStateText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      textAlign: 'center',
    },
    emptyStateSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 8,
      textAlign: 'center',
      lineHeight: 20,
    },
    createFirstButton: {
      marginTop: 20,
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: '#007AFF',
      borderRadius: 8,
    },
    createFirstButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 60, // Move modal up from center
    },
    joinModalContainer: {
      backgroundColor: colors.card,
      borderRadius: 12,
      marginHorizontal: 20,
      width: '90%',
      maxWidth: 400,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cancelButton: {
      fontSize: 16,
      color: '#007AFF',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    joinButton: {
      fontSize: 16,
      fontWeight: '600',
      color: '#007AFF',
    },
    joinButtonDisabled: {
      color: colors.textLight,
    },
    modalContent: {
      padding: 20,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
      marginTop: 16,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    infoSection: {
      marginBottom: 16,
    },
    infoCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    infoRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 10,
    },
    infoItem: {
      width: '48%',
      marginRight: '2%',
      marginBottom: 10,
    },
    infoItemFull: {
      width: '100%',
      marginBottom: 8,
    },
    infoLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    infoValue: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    participantsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 8,
    },
    participantItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
      borderRadius: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    participantName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    participantEmail: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
    participantInput: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    participantTextInput: {
      flex: 1,
      marginRight: 12,
    },
    addButton: {
      padding: 8,
    },
    participantsList: {
      marginTop: 8,
      marginBottom: 8,
    },
    participantHostBadge: {
      marginTop: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      backgroundColor: '#34C759',
      borderRadius: 4,
      alignSelf: 'flex-start',
    },
    participantHostText: {
      fontSize: 9,
      fontWeight: '700',
      color: '#fff',
    },
    featureBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    featureBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    invitedGuestItem: {
      paddingVertical: 2,
      marginBottom: 0,
    },
    invitedGuestEmail: {
      fontSize: 13,
      color: colors.text,
    },
    invitedGuestYou: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    invitedGuestsScrollView: {
      maxHeight: 200,
    },
    hostItem: {
      paddingVertical: 2,
      marginBottom: 0,
    },
  }), [colors]);

  const renderMeetingCard = ({ item }: { item: Meeting }) => (
    <TouchableOpacity
      style={dynamicStyles.meetingCard}
      onPress={() => {
        // Active meeting: return to meeting. Use string href so path is not lost (avoids grabdocs:/// unmatched route).
        if (item.status === 'active') {
          const q = new URLSearchParams({
            meetingId: String(item.meetingId ?? ''),
            title: String(item.title ?? ''),
            userName: String(user?.name || user?.email || 'Mobile User')
          });
          if (item.passcode) q.set('passcode', String(item.passcode));
          router.push(`/quick-reach/hms-meeting-interface?${q.toString()}` as any);
        } else {
          viewMeetingAssets(item);
        }
      }}
      onLongPress={() => {
        if (isJoining) return;
        const isLive = item.status === 'active';
        const buttons = [
          { text: 'Cancel', style: 'cancel' as const },
          { text: 'Join Meeting', onPress: () => { if (!isJoining) joinMeeting(item); } },
          { text: 'View Assets', onPress: () => viewMeetingAssets(item) },
          ...(isLive ? [{ text: 'End Meeting', style: 'destructive' as const, onPress: () => endMeeting(item) }] : []),
          { text: 'Delete', style: 'destructive' as const, onPress: () => deleteMeeting(item) },
          { text: 'Invite', onPress: () => {
            setSelectedMeeting(item);
            setShowInviteModal(true);
          }}
        ];
        
        Alert.alert(
          'Meeting Options',
          `Host: ${item.host}\nParticipants: ${item.participants}\nStart Time: ${formatMeetingTimeToLocal(item.startTime)}`,
          buttons as any
        );
      }}
    >
      <View style={dynamicStyles.meetingHeader}>
        <Text style={dynamicStyles.meetingTitle} numberOfLines={1}>{item.title}</Text>
        <View 
          style={[
            dynamicStyles.statusBadge, 
            item.status === 'active' ? dynamicStyles.statusOngoing : 
            item.status === 'ended' ? dynamicStyles.statusEnded :
            item.status === 'created' ? dynamicStyles.statusCreated :
            dynamicStyles.statusScheduled
          ]}
        >
          <Text style={dynamicStyles.statusText}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>
      
      <View style={dynamicStyles.meetingDetails}>
        <Text style={dynamicStyles.meetingHost} numberOfLines={1}>Host: {item.host}</Text>
        <View style={dynamicStyles.meetingMetaCompact}>
          <Text style={dynamicStyles.meetingTimeCompact}>{formatMeetingTimeToLocal(item.startTime)}</Text>
          <Text style={dynamicStyles.detailTextCompact}>👥 {item.participants}</Text>
          <Text style={dynamicStyles.detailTextCompact} numberOfLines={1}>ID: {item.meetingId}</Text>
        </View>
      </View>

      <View style={dynamicStyles.meetingActions}>
        <TouchableOpacity
          style={[dynamicStyles.actionIcon, isJoining && { opacity: 0.5 }]}
          disabled={isJoining}
          onPress={(e) => {
            e.stopPropagation();
            if (isJoining) return;
            joinMeeting(item);
          }}
        >
          <Ionicons name="videocam" size={16} color="#007AFF" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={dynamicStyles.actionIcon}
          onPress={(e) => {
            e.stopPropagation();
            copyMeetingDetails(item);
          }}
        >
          <Ionicons name="copy" size={16} color="#5856D6" />
        </TouchableOpacity>

        {meetingHasKnownAssets(item, assetPresenceMap) ? (
          <TouchableOpacity
            style={dynamicStyles.actionIcon}
            accessibilityLabel="Meeting assets"
            onPress={(e) => {
              e.stopPropagation();
              viewMeetingAssets(item, { fromAssetsIcon: true });
            }}
          >
            <Ionicons name="folder-open-outline" size={16} color={colors.tint || '#007AFF'} />
          </TouchableOpacity>
        ) : null}
        
        <TouchableOpacity
          style={dynamicStyles.actionIcon}
          onPress={(e) => {
            e.stopPropagation();
            showMeetingInfo(item);
          }}
        >
          <Ionicons name="information-circle" size={16} color="#FF9500" />
        </TouchableOpacity>
        
        {(item.status === 'active') && (
          <TouchableOpacity
            style={dynamicStyles.actionIcon}
            onPress={(e) => {
              e.stopPropagation();
              endMeeting(item);
            }}
          >
            <Ionicons name="stop-circle" size={16} color="#FF3B30" />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={dynamicStyles.actionIcon}
          onPress={(e) => {
            e.stopPropagation();
            setSelectedMeeting(item);
            setShowInviteModal(true);
          }}
        >
          <Ionicons name="person-add" size={16} color="#34C759" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={dynamicStyles.actionIcon}
          onPress={(e) => {
            e.stopPropagation();
            deleteMeeting(item);
          }}
        >
          <Ionicons name="trash" size={16} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = (title: string, subtitle: string) => (
    <View style={dynamicStyles.emptyState}>
      <Ionicons name="videocam-off-outline" size={48} color={colors.textLight} />
      <Text style={dynamicStyles.emptyStateText}>{title}</Text>
      <Text style={dynamicStyles.emptyStateSubtext}>{subtitle}</Text>
      {title.includes('meeting') && (
        <TouchableOpacity style={dynamicStyles.createFirstButton} onPress={scheduleMeeting}>
          <Text style={dynamicStyles.createFirstButtonText}>Schedule Your First Meeting</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Show authentication required message if not logged in
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity style={dynamicStyles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>Meeting Call</Text>
          <View style={dynamicStyles.headerSpacer} />
        </View>
        <View style={dynamicStyles.loadingContainer}>
          <Ionicons name="lock-closed" size={64} color={colors.textLight} />
          <Text style={dynamicStyles.loadingText}>Authentication Required</Text>
          <Text style={[dynamicStyles.loadingText, { fontSize: 16, marginTop: 8 }]}>
            Please log in to view your meetings
          </Text>
          <TouchableOpacity 
            style={[dynamicStyles.actionButton, { marginTop: 20 }]} 
            onPress={() => router.push('/(auth)/sign-in')}
          >
            <Text style={dynamicStyles.actionButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity style={dynamicStyles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>Meeting Call</Text>
          <View style={dynamicStyles.headerSpacer} />
        </View>
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading meetings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity style={dynamicStyles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Meeting Call</Text>
        <TouchableOpacity
          style={dynamicStyles.refreshButton}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          <Ionicons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={dynamicStyles.quickActions}>
        <TouchableOpacity style={dynamicStyles.actionButton} onPress={createMeeting}>
          <Ionicons name="add-circle" size={24} color="#007AFF" />
          <Text style={dynamicStyles.actionButtonText}>Create</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[dynamicStyles.actionButton, isJoining && { opacity: 0.5 }]}
          disabled={isJoining}
          onPress={() => { if (!isJoining) setShowJoinModal(true); }}
        >
          <Ionicons name="enter" size={24} color="#34C759" />
          <Text style={dynamicStyles.actionButtonText}>Join</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={dynamicStyles.actionButton} onPress={scheduleMeeting}>
          <Ionicons name="calendar" size={24} color="#FF9500" />
          <Text style={dynamicStyles.actionButtonText}>Schedule</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={[]}
        renderItem={renderMeetingCard}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={dynamicStyles.meetingsList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <View>
            {/* Ongoing Meetings */}
            {ongoingMeetings.length > 0 && (
              <View style={dynamicStyles.section}>
                <Text style={dynamicStyles.sectionTitle}>Live Meetings ({ongoingMeetings.length})</Text>
                <FlatList
                  data={ongoingMeetings}
                  renderItem={renderMeetingCard}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                />
              </View>
            )}

            {/* Upcoming Meetings */}
            {upcomingMeetings.length > 0 ? (
              <View style={dynamicStyles.section}>
                <Text style={dynamicStyles.sectionTitle}>Upcoming Meetings ({upcomingMeetings.length})</Text>
                <FlatList
                  data={upcomingMeetings.slice(0, 3)}
                  renderItem={renderMeetingCard}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                />
              </View>
            ) : !loading && meetings.length === 0 && (
              renderEmptyState("No upcoming meetings", "Create or join a meeting to get started")
            )}

            {/* Recent Meetings */}
            {(() => {
              const recentMeetings = meetings.filter(m => {
                // Include ended meetings
                if (m.status === 'ended') return true;
                
                // Include created/scheduled meetings without startTime (immediate meetings created via "Create")
                if ((m.status === 'created' || m.status === 'scheduled') && !m.startTime) {
                  return true;
                }
                
                return false;
              }).sort((a, b) => {
                // Sort by date: most recent first
                const dateA = new Date(a.createdAt || a.startTime || 0).getTime();
                const dateB = new Date(b.createdAt || b.startTime || 0).getTime();
                return dateB - dateA;
              });
              
              return recentMeetings.length > 0 ? (
                <View style={dynamicStyles.section}>
                  <Text style={dynamicStyles.sectionTitle}>Recent Meetings ({recentMeetings.length})</Text>
                  <FlatList
                    data={recentMeetings}
                    renderItem={renderMeetingCard}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                  />
                </View>
              ) : null;
            })()}
          </View>
        )}
      />

      {/* Join Meeting Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowJoinModal(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={[
            dynamicStyles.modalOverlay,
            keyboardHeight > 0 && { paddingBottom: keyboardHeight },
          ]}
          activeOpacity={1}
          onPress={() => setShowJoinModal(false)}
        >
          <KeyboardAvoidingView
            behavior={undefined}
            style={{ width: '100%' }}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={dynamicStyles.joinModalContainer}>
                <View style={dynamicStyles.modalHeader}>
                  <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                    <Text style={dynamicStyles.cancelButton}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={dynamicStyles.modalTitle}>Join Meeting</Text>
                  <TouchableOpacity 
                    onPress={joinMeetingById}
                    disabled={isJoining || !meetingId.trim()}
                  >
                    <Text style={[
                      dynamicStyles.joinButton,
                      (!meetingId.trim() || isJoining) && dynamicStyles.joinButtonDisabled
                    ]}>
                      Join
                    </Text>
                  </TouchableOpacity>
                </View>
                
                <View style={dynamicStyles.modalContent}>
                  <Text style={dynamicStyles.inputLabel}>Meeting ID</Text>
                  <TextInput
                    style={dynamicStyles.input}
                    placeholder="Enter meeting ID"
                    placeholderTextColor={colors.textLight}
                    value={meetingId}
                    onChangeText={setMeetingId}
                    autoFocus
                    keyboardType="numeric"
                    autoCapitalize="none"
                  />
                  
                  <Text style={dynamicStyles.inputLabel}>Passcode (Optional)</Text>
                  <TextInput
                    style={dynamicStyles.input}
                    placeholder="Enter meeting passcode"
                    placeholderTextColor={colors.textLight}
                    value={meetingPassword}
                    onChangeText={setMeetingPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <SafeAreaView style={dynamicStyles.modalContainer} edges={['top', 'bottom', 'left', 'right']}>
          <View style={[dynamicStyles.modalHeader, { paddingTop: Math.max(insets.top - 20, 8) }]}>
            <TouchableOpacity onPress={() => setShowInviteModal(false)}>
              <Text style={dynamicStyles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Invite to Meeting</Text>
            <TouchableOpacity 
              onPress={inviteToMeeting}
              disabled={inviteEmails.length === 0}
            >
              <Text style={[
                dynamicStyles.joinButton,
                inviteEmails.length === 0 && dynamicStyles.joinButtonDisabled
              ]}>
                Send
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={dynamicStyles.modalContent}>
            <Text style={dynamicStyles.inputLabel}>Email Addresses</Text>
            <View style={dynamicStyles.participantInput}>
              <TextInput
                style={[dynamicStyles.input, dynamicStyles.participantTextInput]}
                placeholder="Enter email address"
                placeholderTextColor={colors.textLight}
                value={newInviteEmail}
                onChangeText={setNewInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                onSubmitEditing={addInviteEmail}
                returnKeyType="done"
              />
              <TouchableOpacity style={dynamicStyles.addButton} onPress={addInviteEmail}>
                <Ionicons name="add" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            {inviteEmails.length > 0 && (
              <View style={dynamicStyles.participantsList}>
                {inviteEmails.map((email, index) => (
                  <View key={index} style={dynamicStyles.participantItem}>
                    <Text style={dynamicStyles.participantEmail} numberOfLines={1}>{email}</Text>
                    <TouchableOpacity onPress={() => removeInviteEmail(email)}>
                      <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            
            <Text style={dynamicStyles.inputLabel}>Message (Optional)</Text>
            <TextInput
              style={[dynamicStyles.input, dynamicStyles.textArea]}
              placeholder="Add a personal message..."
              placeholderTextColor={colors.textLight}
              value={inviteMessage}
              onChangeText={setInviteMessage}
              multiline
              numberOfLines={3}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Info Modal */}
      <Modal
        visible={showInfoModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <SafeAreaView style={dynamicStyles.modalContainer} edges={['left', 'right', 'bottom']}>
          <View style={[dynamicStyles.modalHeader, { paddingTop: Math.max(insets.top, 12) }]}>
            <TouchableOpacity onPress={() => setShowInfoModal(false)}>
              <Text style={dynamicStyles.cancelButton}>Close</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Meeting Information</Text>
            <TouchableOpacity 
              onPress={async () => {
                if (infoMeeting) {
                  await copyMeetingDetails(infoMeeting);
                }
              }}
            >
              <Text style={dynamicStyles.joinButton}>Copy</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={dynamicStyles.modalContent}>
            {loadingInfo ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={{ marginTop: 8, color: colors.textSecondary, fontSize: 12 }}>Loading meeting info...</Text>
              </View>
            ) : infoMeeting ? (
              <>
                {/* Title - Full width row for lengthy names */}
                <View style={dynamicStyles.infoSection}>
                  <Text style={dynamicStyles.infoLabel}>Title</Text>
                  <Text style={dynamicStyles.infoValue}>{infoMeeting.title}</Text>
                </View>

                {/* Status with Participant Count - Compact Row */}
                <View style={dynamicStyles.infoRow}>
                  <View style={dynamicStyles.infoItem}>
                    <Text style={dynamicStyles.infoLabel}>Status</Text>
                    <Text style={dynamicStyles.infoValue}>{infoMeeting.status.toUpperCase()}</Text>
                  </View>
                  <View style={dynamicStyles.infoItem}>
                    <Text style={dynamicStyles.infoLabel}>Participants</Text>
                    <Text style={dynamicStyles.infoValue}>
                      {meetingInfoData?.active_participant_count ?? 
                       meetingInfoData?.active_participants?.length ??
                       infoMeeting.participants}
                      {meetingInfoData?.max_participants ? `/${meetingInfoData.max_participants}` : ''}
                    </Text>
                  </View>
                </View>

                {/* Start and End Time - Moved Up */}
                <View style={dynamicStyles.infoRow}>
                  <View style={dynamicStyles.infoItem}>
                    <Text style={dynamicStyles.infoLabel}>Start Time</Text>
                    <Text style={dynamicStyles.infoValue}>{formatMeetingTimeToLocal(infoMeeting.startTime)}</Text>
                  </View>
                  {infoMeeting.endTime && (
                    <View style={dynamicStyles.infoItem}>
                      <Text style={dynamicStyles.infoLabel}>End Time</Text>
                      <Text style={dynamicStyles.infoValue}>{formatMeetingTimeToLocal(infoMeeting.endTime)}</Text>
                    </View>
                  )}
                </View>

                {/* Meeting Connect Info Section */}
                <View style={dynamicStyles.infoSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="call" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={dynamicStyles.infoLabel}>Meeting Connect Info</Text>
                  </View>
                  <View style={dynamicStyles.infoRow}>
                    <View style={dynamicStyles.infoItem}>
                      <Text style={dynamicStyles.infoLabel}>Meeting ID</Text>
                      <Text style={dynamicStyles.infoValue} numberOfLines={1}>{infoMeeting.meetingId}</Text>
                    </View>
                    {infoMeeting.passcode && (
                      <View style={dynamicStyles.infoItem}>
                        <Text style={dynamicStyles.infoLabel}>Passcode</Text>
                        <Text style={dynamicStyles.infoValue}>{infoMeeting.passcode}</Text>
                      </View>
                    )}
                  </View>
                  {meetingInfoData?.phone_number && (
                    <View style={dynamicStyles.infoRow}>
                      <View style={dynamicStyles.infoItemFull}>
                        <Text style={dynamicStyles.infoLabel}>Phone</Text>
                        <Text style={dynamicStyles.infoValue}>{meetingInfoData.phone_number}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Creation Details - Compact Row */}
                <View style={dynamicStyles.infoRow}>
                  {infoMeeting.createdAt && (
                    <View style={dynamicStyles.infoItem}>
                      <Text style={dynamicStyles.infoLabel}>Created</Text>
                      <Text style={dynamicStyles.infoValue}>{formatMeetingTimeToLocal(infoMeeting.createdAt)}</Text>
                    </View>
                  )}
                  <View style={dynamicStyles.infoItem}>
                    <Text style={dynamicStyles.infoLabel}>Creator</Text>
                    <Text style={dynamicStyles.infoValue} numberOfLines={1}>
                      {meetingInfoData?.creator?.username || meetingInfoData?.creator?.email || infoMeeting.host}
                    </Text>
                  </View>
                </View>

                {/* Features Section */}
                {(meetingInfoData?.enable_recording || meetingInfoData?.enable_transcription || meetingInfoData?.enable_meeting_summary) && (
                  <View style={dynamicStyles.infoSection}>
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: featuresExpanded ? 8 : 0 }}
                      onPress={() => setFeaturesExpanded(!featuresExpanded)}
                      activeOpacity={0.7}
                    >
                      <Text style={dynamicStyles.infoLabel}>Features</Text>
                      <Ionicons 
                        name={featuresExpanded ? "chevron-up" : "chevron-down"} 
                        size={18} 
                        color={colors.textSecondary} 
                      />
                    </TouchableOpacity>
                    {featuresExpanded && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {meetingInfoData.enable_recording && (
                          <View style={dynamicStyles.featureBadge}>
                            <Text style={dynamicStyles.featureBadgeText}>Recording</Text>
                          </View>
                        )}
                        {meetingInfoData.enable_transcription && (
                          <View style={dynamicStyles.featureBadge}>
                            <Text style={dynamicStyles.featureBadgeText}>Transcription</Text>
                          </View>
                        )}
                        {meetingInfoData.enable_meeting_summary && (
                          <View style={dynamicStyles.featureBadge}>
                            <Text style={dynamicStyles.featureBadgeText}>Summary</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* Host(s) - Can be single or multiple */}
                <View style={dynamicStyles.infoCard}>
                  <Text style={dynamicStyles.infoCardTitle}>
                    {meetingInfoData?.meeting_hosts && meetingInfoData.meeting_hosts.length > 1 ? 'Hosts' : 'Host'}
                  </Text>
                  {meetingInfoData?.meeting_hosts && meetingInfoData.meeting_hosts.length > 0 ? (
                    <View>
                      {meetingInfoData.meeting_hosts.map((host: any, index: number) => {
                        const hostName = host?.username || host?.email || host?.name || 'Unknown';
                        const hostEmail = host?.email || '';
                        return (
                          <View key={index} style={dynamicStyles.hostItem}>
                            <Text style={dynamicStyles.infoValue} numberOfLines={1}>
                              {hostName}
                              {hostEmail && hostEmail !== hostName && (
                                <Text style={[dynamicStyles.infoValue, { color: colors.textSecondary, fontSize: 12 }]}>
                                  {' '}({hostEmail})
                                </Text>
                              )}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={dynamicStyles.infoValue}>
                      {meetingInfoData?.creator?.username || meetingInfoData?.creator?.email || infoMeeting.host || 'Unknown'}
                    </Text>
                  )}
                </View>

                {infoMeeting.duration && (
                  <View style={dynamicStyles.infoRow}>
                    <View style={dynamicStyles.infoItem}>
                      <Text style={dynamicStyles.infoLabel}>Duration</Text>
                      <Text style={dynamicStyles.infoValue}>{infoMeeting.duration} min</Text>
                    </View>
                  </View>
                )}

                {infoMeeting.roomUrl && (
                  <View style={dynamicStyles.infoSection}>
                    <Text style={dynamicStyles.infoLabel}>Room URL</Text>
                    <Text style={dynamicStyles.infoValue} selectable numberOfLines={2}>{infoMeeting.roomUrl}</Text>
                  </View>
                )}

                {infoMeeting.description && (
                  <View style={dynamicStyles.infoSection}>
                    <Text style={dynamicStyles.infoLabel}>Description</Text>
                    <Text style={dynamicStyles.infoValue}>{infoMeeting.description}</Text>
                  </View>
                )}

                {/* Invited Guests Section - Last Item with ScrollView */}
                {meetingInfoData?.invited_participants && meetingInfoData.invited_participants.length > 0 && (
                  <View style={dynamicStyles.infoCard}>
                    <Text style={dynamicStyles.infoCardTitle}>Invited Guests</Text>
                    <ScrollView 
                      style={dynamicStyles.invitedGuestsScrollView}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                    >
                      {meetingInfoData.invited_participants.map((email: string, index: number) => {
                        const isCurrentUser = user?.email?.toLowerCase() === email.toLowerCase();
                        return (
                          <View key={index} style={dynamicStyles.invitedGuestItem}>
                            <Text style={dynamicStyles.invitedGuestEmail} numberOfLines={1}>
                              {email}
                              {isCurrentUser && (
                                <Text style={dynamicStyles.invitedGuestYou}> (You)</Text>
                              )}
                            </Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

