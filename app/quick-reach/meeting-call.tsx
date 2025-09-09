import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { apiClient } from '../../services/api';

interface Meeting {
  id: string;
  title: string;
  meetingId: string;
  host: string;
  participants: number;
  startTime: string;
  endTime?: string;
  status: 'scheduled' | 'ongoing' | 'live' | 'ended' | 'upcoming' | 'active';
  password?: string;
  roomUrl?: string;
  description?: string;
  duration?: number;
  createdAt?: string;
}

export default function MeetingCallScreen() {
  const router = useRouter();
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

  useEffect(() => {
    loadMeetings();
  }, []);

  const loadMeetings = async () => {
    try {
      setLoading(true);
      
      // Load previous user meetings from database using mobile API
      const response = await apiClient.getMeetings();
      
      if (response.success && response.data) {
        const allMeetings = response.data.meetings || [];
        
        // Sort meetings by date (most recent first)
        const sortedMeetings = allMeetings.sort((a: Meeting, b: Meeting) => {
          const dateA = new Date(a.startTime || a.createdAt || 0).getTime();
          const dateB = new Date(b.startTime || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        
        setMeetings(sortedMeetings);
        
        // Filter meetings by status
        const upcoming = sortedMeetings.filter((m: Meeting) => 
          m.status === 'scheduled' || m.status === 'upcoming'
        );
        const ongoing = sortedMeetings.filter((m: Meeting) => 
          m.status === 'ongoing' || m.status === 'live' || m.status === 'active'
        );
        
        setUpcomingMeetings(upcoming);
        setOngoingMeetings(ongoing);
        
        console.log(`📱 Loaded ${sortedMeetings.length} meetings from database:`, {
          total: sortedMeetings.length,
          upcoming: upcoming.length,
          ongoing: ongoing.length
        });
      } else {
        // No meetings found - show empty state
        setMeetings([]);
        setUpcomingMeetings([]);
        setOngoingMeetings([]);
        console.log('📱 No meetings found in database');
      }
    } catch (error) {
      console.error('Failed to load meetings from database:', error);
      // On error - show empty state
      setMeetings([]);
      setUpcomingMeetings([]);
      setOngoingMeetings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadMeetings();
  }, []);

  const createMeeting = () => {
    router.push('./schedule-meeting' as any);
  };

  const joinMeeting = (meeting: Meeting) => {
    if (meeting.status === 'ongoing' || meeting.status === 'live') {
      // Join ongoing meeting directly
      router.push({
        pathname: '/quick-reach/meeting-interface',
        params: {
          meetingId: meeting.meetingId,
          title: meeting.title,
          password: meeting.password || ''
        }
      });
    } else {
      // For scheduled meetings, may need password
      if (meeting.password) {
        // Show password prompt
        Alert.prompt(
          'Meeting Password',
          'Enter the meeting password:',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Join', 
              onPress: (password) => {
                router.push({
                  pathname: './meeting-interface' as any,
                  params: {
                    meetingId: meeting.meetingId,
                    title: meeting.title,
                    password: password || ''
                  }
                });
              }
            }
          ],
          'secure-text'
        );
      } else {
        router.push({
          pathname: './meeting-interface' as any,
          params: {
            meetingId: meeting.meetingId,
            title: meeting.title,
            password: ''
          }
        });
      }
    }
  };

  const joinMeetingById = async () => {
    if (!meetingId.trim()) {
      Alert.alert('Error', 'Please enter a meeting ID');
      return;
    }

    try {
      const response = await apiClient.joinMeeting({
        meetingId: meetingId.trim(),
        password: meetingPassword.trim()
      });

      if (response.success && response.data) {
        setShowJoinModal(false);
        setMeetingId('');
        setMeetingPassword('');
        
        router.push({
          pathname: './meeting-interface' as any,
          params: {
            meetingId: response.data.meetingId || meetingId.trim(),
            title: response.data.title || 'Meeting',
            password: meetingPassword.trim()
          }
        });
      } else {
        Alert.alert('Error', response.message || 'Invalid meeting ID or password');
      }
    } catch (error) {
      console.error('Failed to join meeting:', error);
      Alert.alert('Error', 'Failed to join meeting. Please check the meeting ID and password.');
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
              const response = await apiClient.endMeeting(meeting.meetingId);
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
              const response = await apiClient.deleteMeeting(meeting.meetingId);
              if (response.success) {
                Alert.alert('Success', 'Meeting deleted successfully');
                loadMeetings(); // Refresh the list
              } else {
                Alert.alert('Error', response.message || 'Failed to delete meeting');
              }
            } catch (error) {
              console.error('Failed to delete meeting:', error);
              Alert.alert('Error', 'Failed to delete meeting');
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

  const renderMeetingCard = ({ item }: { item: Meeting }) => (
    <TouchableOpacity
      style={[styles.meetingCard, (item.status === 'ongoing' || item.status === 'live') && styles.ongoingMeeting]}
      onPress={() => joinMeeting(item)}
      onLongPress={() => {
        const isLive = item.status === 'ongoing' || item.status === 'live';
        const buttons = [
          { text: 'Cancel', style: 'cancel' as const },
          { text: 'Join', onPress: () => joinMeeting(item) },
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
      <View style={styles.meetingHeader}>
        <Text style={styles.meetingTitle} numberOfLines={1}>{item.title}</Text>
        <View 
          style={[
            styles.statusBadge, 
            (item.status === 'ongoing' || item.status === 'live') ? styles.statusOngoing : styles.statusScheduled
          ]}
        >
          <Text style={styles.statusText}>
            {(item.status === 'ongoing' || item.status === 'live') ? 'LIVE' : 'SCHED'}
          </Text>
        </View>
      </View>
      
      <View style={styles.meetingDetails}>
        <Text style={styles.meetingHost} numberOfLines={1}>Host: {item.host}</Text>
        <Text style={styles.meetingTime}>{formatMeetingTime(item.startTime)}</Text>
        <View style={styles.meetingMeta}>
          <Text style={styles.detailText} numberOfLines={1}>👥 {item.participants}</Text>
          <Text style={styles.detailText} numberOfLines={1}>ID: {item.meetingId}</Text>
        </View>
      </View>

      <View style={styles.meetingActions}>
        <TouchableOpacity
          style={styles.actionIcon}
          onPress={(e) => {
            e.stopPropagation();
            joinMeeting(item);
          }}
        >
          <Ionicons name="videocam" size={20} color="#007AFF" />
        </TouchableOpacity>
        
        {(item.status === 'ongoing' || item.status === 'live') && (
          <TouchableOpacity
            style={styles.actionIcon}
            onPress={(e) => {
              e.stopPropagation();
              endMeeting(item);
            }}
          >
            <Ionicons name="stop-circle" size={20} color="#FF3B30" />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={styles.actionIcon}
          onPress={(e) => {
            e.stopPropagation();
            setSelectedMeeting(item);
            setShowInviteModal(true);
          }}
        >
          <Ionicons name="person-add" size={20} color="#34C759" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = (title: string, subtitle: string) => (
    <View style={styles.emptyState}>
      <Ionicons name="videocam-off-outline" size={48} color="#999" />
      <Text style={styles.emptyStateText}>{title}</Text>
      <Text style={styles.emptyStateSubtext}>{subtitle}</Text>
      {title.includes('meeting') && (
        <TouchableOpacity style={styles.createFirstButton} onPress={createMeeting}>
          <Text style={styles.createFirstButtonText}>Schedule Your First Meeting</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Meeting Call</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading meetings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meeting Call</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          <Ionicons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionButton} onPress={createMeeting}>
          <Ionicons name="add-circle" size={32} color="#007AFF" />
          <Text style={styles.actionButtonText}>Create</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowJoinModal(true)}>
          <Ionicons name="enter" size={32} color="#34C759" />
          <Text style={styles.actionButtonText}>Join</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={() => router.push('./schedule-meeting' as any)}>
          <Ionicons name="calendar" size={32} color="#FF9500" />
          <Text style={styles.actionButtonText}>Schedule</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={meetings}
        renderItem={renderMeetingCard}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={styles.meetingsList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <View>
            {/* Ongoing Meetings */}
            {ongoingMeetings.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Live Meetings ({ongoingMeetings.length})</Text>
                <FlatList
                  data={ongoingMeetings}
                  renderItem={renderMeetingCard}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalList}
                />
              </View>
            )}

            {/* Upcoming Meetings */}
            {upcomingMeetings.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Upcoming Meetings ({upcomingMeetings.length})</Text>
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
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Meetings</Text>
                <FlatList
                  data={meetings.filter(m => m.status === 'ended').slice(0, 5)}
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
        presentationStyle="pageSheet"
        onRequestClose={() => setShowJoinModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowJoinModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Join Meeting</Text>
            <TouchableOpacity 
              onPress={joinMeetingById}
              disabled={!meetingId.trim()}
            >
              <Text style={[
                styles.joinButton,
                !meetingId.trim() && styles.joinButtonDisabled
              ]}>
                Join
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <Text style={styles.inputLabel}>Meeting ID</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter meeting ID"
              value={meetingId}
              onChangeText={setMeetingId}
              autoFocus
              keyboardType="numeric"
              autoCapitalize="none"
            />
            
            <Text style={styles.inputLabel}>Password (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter meeting password"
              value={meetingPassword}
              onChangeText={setMeetingPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowInviteModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Invite to Meeting</Text>
            <TouchableOpacity 
              onPress={inviteToMeeting}
              disabled={!inviteEmail.trim()}
            >
              <Text style={[
                styles.joinButton,
                !inviteEmail.trim() && styles.joinButtonDisabled
              ]}>
                Send
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter email address"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoFocus
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <Text style={styles.inputLabel}>Message (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Add a personal message..."
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerSpacer: {
    width: 40, // Same width as back button to center title
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212529',
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
    color: '#666',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#fff',
    marginBottom: 8,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    minHeight: 70,
    minWidth: 90,
    maxWidth: 120,
  },
  actionButtonText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
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
    color: '#212529',
    marginBottom: 12,
  },
  horizontalList: {
    paddingRight: 20,
  },
  meetingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
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
    color: '#212529',
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
    color: '#495057',
    marginBottom: 4,
  },
  meetingTime: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 8,
  },
  meetingMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailText: {
    fontSize: 12,
    color: '#6c757d',
  },
  meetingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionIcon: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f8f9fa',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6c757d',
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  cancelButton: {
    fontSize: 16,
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  joinButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  joinButtonDisabled: {
    color: '#adb5bd',
  },
  modalContent: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
});
