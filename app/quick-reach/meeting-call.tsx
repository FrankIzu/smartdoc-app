import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { useAuth } from '../context/auth';

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

export default function MeetingCallScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const colors = useThemeColors();
  const isAuthenticated = !!user;
  
  console.log('🔄 MeetingCallScreen rendered, isAuthenticated:', isAuthenticated);
  
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [ongoingMeetings, setOngoingMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [meetingId, setMeetingId] = useState('');
  const [meetingPassword, setMeetingPassword] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

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
  }, [isAuthenticated, hasLoadedOnce]);

  const loadMeetings = async () => {
    if (!isAuthenticated) {
      console.log('📱 User not authenticated, skipping meetings load');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);
      
      // Load meetings and assets in parallel
      const [meetingsResponse, assetsResponse] = await Promise.all([
        apiClient.getMeetings(),
        apiClient.getMeetingAssets()
      ]);
      
      // Track which meetings have assets (for potential future use like badges/indicators)
      // Use title as primary identifier since IDs might not match (HMS ID vs DB ID)
      let meetingsWithAssetsTitles = new Set<string>();
      let meetingsWithAssetsIds = new Set<string>();
      
      if (assetsResponse.success && assetsResponse.data) {
        // Check top-level assets array (this is the main source of assets)
        if (assetsResponse.data.assets && Array.isArray(assetsResponse.data.assets)) {
          console.log(`📱 Processing ${assetsResponse.data.assets.length} assets from top-level assets array`);
          assetsResponse.data.assets.forEach((asset: any, index: number) => {
            // Extract meeting title from asset (try multiple property names)
            const title = (asset.meeting_title || asset.title || asset.meetingTitle || '').toLowerCase().trim();
            if (title) {
              meetingsWithAssetsTitles.add(title);
              if (index < 3) { // Log first 3 for debugging
                console.log(`📱 Asset ${index} title: "${title}"`);
              }
            }
            // Extract meeting ID from asset (try multiple property names)
            const meetingId = asset.meeting_id || asset.meetingId || asset.meeting_id;
            if (meetingId) {
              meetingsWithAssetsIds.add(String(meetingId));
              if (index < 3) { // Log first 3 for debugging
                console.log(`📱 Asset ${index} meetingId: "${meetingId}"`);
              }
            }
          });
        }
        
        // Also check meetings array for nested assets (if they exist)
        if (assetsResponse.data.meetings && Array.isArray(assetsResponse.data.meetings)) {
          assetsResponse.data.meetings.forEach((meeting: any) => {
            const hasAssets = meeting.assets && Array.isArray(meeting.assets) && meeting.assets.length > 0;
            if (hasAssets) {
              // Add title for matching (normalize to lowercase for comparison)
              const title = (meeting.title || meeting.meeting_title || '').toLowerCase().trim();
              if (title) {
                meetingsWithAssetsTitles.add(title);
              }
              // Also add IDs for potential matching
              const meetingId = meeting.id || meeting.meeting_id || meeting.meetingId;
              if (meetingId) {
                meetingsWithAssetsIds.add(String(meetingId));
              }
            }
          });
        }
      }
      
      console.log('📱 Meeting titles with assets:', Array.from(meetingsWithAssetsTitles));
      console.log('📱 Meeting IDs with assets:', Array.from(meetingsWithAssetsIds));
      
      if (meetingsResponse.success && meetingsResponse.data) {
        const allMeetings = meetingsResponse.data.meetings || [];
        
        console.log(`📱 Processing ${allMeetings.length} meetings from backend`);
        
        // Sort meetings by date (most recent first) BEFORE deduplication
        const sortedMeetings = allMeetings.sort((a: Meeting, b: Meeting) => {
          const dateA = new Date(a.startTime || a.createdAt || 0).getTime();
          const dateB = new Date(b.startTime || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        
        // Deduplicate meetings by title - keep only the most recent occurrence of each unique meeting name
        const uniqueMeetingsMap = new Map<string, Meeting>();
        const duplicatesFound: string[] = [];
        
        sortedMeetings.forEach((meeting: Meeting, index: number) => {
          const normalizedTitle = (meeting.title || '').toLowerCase().trim();
          
          if (!normalizedTitle) {
            console.warn(`📱 Meeting at index ${index} has no title, skipping`);
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
        
        // Filter meetings by status
        const upcoming = uniqueMeetings.filter((m: Meeting) => 
          m.status === 'scheduled' || m.status === 'created'
        );
        const ongoing = uniqueMeetings.filter((m: Meeting) => 
          m.status === 'active'
        );
        
        setUpcomingMeetings(upcoming);
        setOngoingMeetings(ongoing);
        
        console.log(`📱 Loaded ${uniqueMeetings.length} unique meetings:`, {
          total: uniqueMeetings.length,
          upcoming: upcoming.length,
          ongoing: ongoing.length,
          meetingsWithAssets: meetingsWithAssetsTitles.size,
          duplicatesRemoved: allMeetings.length - uniqueMeetings.length
        });
        
        // Debug: Log the actual status values from backend
        console.log('📱 Meeting statuses from backend:', uniqueMeetings.map((m: Meeting) => ({
          title: m.title,
          status: m.status,
          startTime: m.startTime,
          displayStatus: m.status.toUpperCase()
        })));
      } else {
        // No meetings found - show empty state
        setMeetings([]);
        setUpcomingMeetings([]);
        setOngoingMeetings([]);
        console.log('📱 No meetings found in database');
      }
    } catch (error: any) {
      console.error('Failed to load meetings from database:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        }
      });
      
      // Check if it's an authentication error
      if (error.response?.status === 401 || error.message?.includes('Not authenticated')) {
        console.log('📱 Authentication required for meetings');
        Alert.alert(
          'Authentication Required',
          'Please log in to view your meetings.',
          [
            { text: 'OK', onPress: () => router.push('/(auth)/sign-in') }
          ]
        );
      } else if (error.response?.status === 500) {
        console.log('📱 Server error (500) - backend issue');
        Alert.alert(
          'Server Error',
          'There was a server error loading meetings. Please try again later.',
          [
            { text: 'OK' }
          ]
        );
        // Show empty state for server errors
        setMeetings([]);
        setUpcomingMeetings([]);
        setOngoingMeetings([]);
      } else {
        // Other errors - show empty state
        console.log('📱 Other error loading meetings:', error.response?.status);
        setMeetings([]);
        setUpcomingMeetings([]);
        setOngoingMeetings([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    console.log('📱 Manual refresh triggered');
    setRefreshing(true);
    loadMeetings();
  }, []);

  const createMeeting = () => {
    router.push('./create-meeting' as any);
  };

  const scheduleMeeting = () => {
    router.push('./schedule-meeting' as any);
  };

  const joinMeeting = (meeting: Meeting) => {
    // Check if meeting is private and requires passcode
    if (meeting.passcode) {
      // Show passcode prompt for private meetings
      Alert.prompt(
        'Meeting Passcode',
        'This is a private meeting. Enter the passcode:',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Join', 
            onPress: (passcode) => {
              if (passcode) {
                router.push({
                  pathname: './hms-meeting-interface',
                  params: {
                    meetingId: meeting.meetingId,
                    title: meeting.title,
                    userName: 'Mobile User',
                    passcode: passcode
                  }
                });
              } else {
                Alert.alert('Error', 'Passcode is required for private meetings');
              }
            }
          }
        ],
        'secure-text'
      );
    } else {
      // Public meeting - join directly without passcode
      router.push({
        pathname: './hms-meeting-interface',
        params: {
          meetingId: meeting.meetingId,
          title: meeting.title,
          userName: 'Mobile User'
        }
      });
    }
  };

  const viewMeetingAssets = (meeting: Meeting) => {
    // Navigate to meeting assets page with meeting details
    router.push({
      pathname: '/quick-reach/meeting-details',
      params: {
        meetingId: meeting.meetingId,
        meetingTitle: meeting.title,
        roomCode: meeting.meetingId
      }
    });
  };

  const joinMeetingById = async () => {
    if (!meetingId.trim()) {
      Alert.alert('Error', 'Please enter a meeting ID');
      return;
    }

    try {
      const response = await apiClient.joinMeeting({
        meetingId: meetingId.trim(),
        passcode: meetingPassword.trim()
      });

      if (response.success && response.data) {
        setShowJoinModal(false);
        setMeetingId('');
        setMeetingPassword('');
        
        router.push({
          pathname: './hms-meeting-interface',
          params: {
            meetingId: response.data.meetingId || meetingId.trim(),
            title: response.data.title || 'Meeting',
            userName: 'Mobile User'
          }
        });
      } else {
        Alert.alert('Error', response.message || 'Invalid meeting ID or passcode');
      }
    } catch (error) {
      console.error('Failed to join meeting:', error);
      Alert.alert('Error', 'Failed to join meeting. Please check the meeting ID and passcode.');
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
            try {
              // Try using the id field instead of meetingId since backend expects room_id
              const roomId = meeting.id || meeting.meetingId;
              console.log('Ending meeting with ID:', roomId, 'from meeting:', meeting);
              const response = await apiClient.endMeeting(roomId);
              if (response.success) {
                Alert.alert('Success', 'Meeting ended successfully');
                loadMeetings(); // Refresh the list
              } else {
                Alert.alert('Error', response.message || 'Failed to end meeting');
              }
            } catch (error) {
              console.error('Failed to end meeting:', error);
              Alert.alert('Error', 'Failed to end meeting');
            }
          }
        }
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

  const inviteToMeeting = async () => {
    if (!selectedMeeting || !inviteEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    try {
      const response = await apiClient.sendMeetingInvite(selectedMeeting.meetingId, {
        email: inviteEmail.trim(),
        message: inviteMessage.trim()
      });

      if (response.success) {
        Alert.alert('Success', 'Invitation sent successfully');
        setShowInviteModal(false);
        setInviteEmail('');
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

  const formatMeetingTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString([], { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
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
    ongoingMeeting: {
      borderColor: '#34C759',
      borderWidth: 2,
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
  }), [colors]);

  const renderMeetingCard = ({ item }: { item: Meeting }) => (
    <TouchableOpacity
      style={[dynamicStyles.meetingCard, item.status === 'active' && dynamicStyles.ongoingMeeting]}
      onPress={() => viewMeetingAssets(item)}
      onLongPress={() => {
        const isLive = item.status === 'active';
        const buttons = [
          { text: 'Cancel', style: 'cancel' as const },
          { text: 'Join Meeting', onPress: () => joinMeeting(item) },
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
          `Host: ${item.host}\nParticipants: ${item.participants}\nStart Time: ${formatMeetingTime(item.startTime)}`,
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
          <Text style={dynamicStyles.meetingTimeCompact}>{formatMeetingTime(item.startTime)}</Text>
          <Text style={dynamicStyles.detailTextCompact}>👥 {item.participants}</Text>
          <Text style={dynamicStyles.detailTextCompact} numberOfLines={1}>ID: {item.meetingId}</Text>
        </View>
      </View>

      <View style={dynamicStyles.meetingActions}>
        <TouchableOpacity
          style={dynamicStyles.actionIcon}
          onPress={(e) => {
            e.stopPropagation();
            joinMeeting(item);
          }}
        >
          <Ionicons name="videocam" size={16} color="#007AFF" />
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
        <TouchableOpacity style={dynamicStyles.createFirstButton} onPress={createMeeting}>
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
        
        <TouchableOpacity style={dynamicStyles.actionButton} onPress={() => setShowJoinModal(true)}>
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
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={dynamicStyles.horizontalList}
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
            {meetings.filter(m => m.status === 'ended').length > 0 ? (
              <View style={dynamicStyles.section}>
                <Text style={dynamicStyles.sectionTitle}>Recent Meetings</Text>
                <FlatList
                  data={meetings.filter(m => m.status === 'ended')}
                  renderItem={renderMeetingCard}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                />
              </View>
            ) : null}
          </View>
        )}
      />

      {/* Join Meeting Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowJoinModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.joinModalContainer}>
            <View style={dynamicStyles.modalHeader}>
              <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                <Text style={dynamicStyles.cancelButton}>Cancel</Text>
              </TouchableOpacity>
              <Text style={dynamicStyles.modalTitle}>Join Meeting</Text>
              <TouchableOpacity 
                onPress={joinMeetingById}
                disabled={!meetingId.trim()}
              >
                <Text style={[
                  dynamicStyles.joinButton,
                  !meetingId.trim() && dynamicStyles.joinButtonDisabled
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
        </View>
      </Modal>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <SafeAreaView style={dynamicStyles.modalContainer}>
          <View style={dynamicStyles.modalHeader}>
            <TouchableOpacity onPress={() => setShowInviteModal(false)}>
              <Text style={dynamicStyles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Invite to Meeting</Text>
            <TouchableOpacity 
              onPress={inviteToMeeting}
              disabled={!inviteEmail.trim()}
            >
              <Text style={[
                dynamicStyles.joinButton,
                !inviteEmail.trim() && dynamicStyles.joinButtonDisabled
              ]}>
                Send
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={dynamicStyles.modalContent}>
            <Text style={dynamicStyles.inputLabel}>Email Address</Text>
            <TextInput
              style={dynamicStyles.input}
              placeholder="Enter email address"
              placeholderTextColor={colors.textLight}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoFocus
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
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
    </SafeAreaView>
  );
}

