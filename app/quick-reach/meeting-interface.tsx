import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../services/api';

interface MeetingParticipant {
  id: string;
  name: string;
  email: string;
  role: 'host' | 'participant';
  status: 'online' | 'offline' | 'muted' | 'speaking';
  isVideoOn: boolean;
  isAudioOn: boolean;
  isScreenSharing: boolean;
}

interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: string;
  type: 'text' | 'system';
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function MeetingInterfaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { meetingId, title, password } = params;

  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    joinMeeting();
    startDurationTimer();
    loadParticipants();
    loadChatHistory();

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      leaveMeeting();
    };
  }, []);

  const joinMeeting = async () => {
    try {
      const response = await apiClient.joinMeeting({
        meetingId: meetingId as string,
        password: password as string
      });

      if (response.success && response.data) {
        console.log('Successfully joined meeting');
        // Store room URL for daily.co integration
        const roomUrl = response.data.roomUrl;
        if (roomUrl) {
          // In a real implementation, you would initialize daily.co here
          console.log('Daily.co room URL:', roomUrl);
        }
      } else {
        Alert.alert('Error', response.message || 'Failed to join meeting');
        router.back();
      }
    } catch (error) {
      console.error('Failed to join meeting:', error);
      Alert.alert('Error', 'Failed to join meeting');
      router.back();
    }
  };

  const leaveMeeting = async () => {
    try {
      // Call API to leave meeting
      await apiClient.client.post(`/api/v1/mobile/meetings/${meetingId}/leave`);
    } catch (error) {
      console.error('Failed to leave meeting:', error);
    }
  };

  const startDurationTimer = () => {
    durationIntervalRef.current = setInterval(() => {
      setMeetingDuration(prev => prev + 1);
    }, 1000);
  };

  const loadParticipants = async () => {
    try {
      const response = await apiClient.client.get(`/api/v1/mobile/meetings/${meetingId}/participants`);
      if (response.data.success) {
        setParticipants(response.data.data.participants || []);
      } else {
        console.warn('No participants data returned');
        setParticipants([]);
      }
    } catch (error) {
      console.error('Failed to load participants:', error);
      setParticipants([]);
    }
  };

  const loadChatHistory = async () => {
    try {
      const response = await apiClient.client.get(`/api/v1/mobile/meetings/${meetingId}/chat`);
      if (response.data.success) {
        setChatMessages(response.data.data.messages || []);
      } else {
        console.warn('No chat messages data returned');
        setChatMessages([]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setChatMessages([]);
    }
  };

  const sendChatMessage = async () => {
    if (!newMessage.trim()) return;

    const message: ChatMessage = {
      id: Date.now().toString(),
      sender: 'You',
      message: newMessage.trim(),
      timestamp: new Date().toISOString(),
      type: 'text'
    };

    setChatMessages(prev => [...prev, message]);
    setNewMessage('');

    try {
      await apiClient.client.post(`/api/v1/mobile/meetings/${meetingId}/chat`, {
        message: message.message
      });
    } catch (error) {
      console.error('Failed to send chat message:', error);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    // Call API to toggle mute
  };

  const toggleVideo = () => {
    setIsVideoOn(!isVideoOn);
    // Call API to toggle video
  };

  const toggleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing);
    // Call API to toggle screen sharing
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    Alert.alert(
      isRecording ? 'Stop Recording' : 'Start Recording',
      isRecording ? 'Recording will be stopped' : 'Recording will be started',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isRecording ? 'Stop' : 'Start', onPress: () => {
          // Call API to toggle recording
          console.log(isRecording ? 'Stopping recording' : 'Starting recording');
        }}
      ]
    );
  };

  const toggleHandRaise = () => {
    setIsHandRaised(!isHandRaised);
    // Call API to toggle hand raise
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const renderParticipant = ({ item }: { item: MeetingParticipant }) => (
    <View style={styles.participantCard}>
      <View style={styles.participantInfo}>
        <View style={styles.participantAvatar}>
          <Text style={styles.participantInitial}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.participantDetails}>
          <Text style={styles.participantName}>{item.name}</Text>
          <Text style={styles.participantRole}>{item.role}</Text>
        </View>
      </View>
      
      <View style={styles.participantControls}>
        {item.isVideoOn && <Ionicons name="videocam" size={16} color="#34C759" />}
        {!item.isAudioOn && <Ionicons name="mic-off" size={16} color="#FF3B30" />}
        {item.isScreenSharing && <Ionicons name="desktop" size={16} color="#007AFF" />}
        {item.status === 'speaking' && <View style={styles.speakingIndicator} />}
      </View>
    </View>
  );

  const renderChatMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[
      styles.chatMessage,
      item.type === 'system' && styles.systemMessage
    ]}>
      {item.type === 'text' && (
        <Text style={styles.messageSender}>{item.sender}</Text>
      )}
      <Text style={[
        styles.messageText,
        item.type === 'system' && styles.systemMessageText
      ]}>
        {item.message}
      </Text>
      <Text style={styles.messageTime}>
        {new Date(item.timestamp).toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Meeting Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.meetingTitle}>{title}</Text>
          <Text style={styles.meetingDuration}>{formatDuration(meetingDuration)}</Text>
        </View>
        <View style={styles.headerControls}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowParticipants(!showParticipants)}
          >
            <Ionicons name="people" size={20} color="#fff" />
            <Text style={styles.headerButtonText}>{participants.length}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowSettings(!showSettings)}
          >
            <Ionicons name="settings" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Meeting Area */}
      <View style={styles.mainArea}>
        {/* Video Grid */}
        <View style={styles.videoGrid}>
          {participants.length > 0 ? (
            participants.map((participant, index) => (
              <View key={participant.id} style={styles.videoTile}>
                {participant.isVideoOn ? (
                  <View style={styles.videoPlaceholder}>
                    <Text style={styles.videoPlaceholderText}>Video</Text>
                  </View>
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {participant.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.videoOverlay}>
                  <Text style={styles.participantNameOverlay}>{participant.name}</Text>
                  {!participant.isAudioOn && (
                    <Ionicons name="mic-off" size={16} color="#fff" />
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyVideoGrid}>
              <Ionicons name="people-outline" size={64} color="#666" />
              <Text style={styles.emptyVideoText}>Waiting for participants...</Text>
            </View>
          )}
        </View>

        {/* Chat Panel */}
        {showChat && (
          <View style={styles.chatPanel}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>Meeting Chat</Text>
              <TouchableOpacity onPress={() => setShowChat(false)}>
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            
            {chatMessages.length > 0 ? (
              <FlatList
                data={chatMessages}
                renderItem={renderChatMessage}
                keyExtractor={(item) => item.id}
                style={styles.chatMessages}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={styles.emptyChatState}>
                <Ionicons name="chatbubbles-outline" size={48} color="#999" />
                <Text style={styles.emptyChatText}>No messages yet</Text>
                <Text style={styles.emptyChatSubtext}>Start the conversation!</Text>
              </View>
            )}
            
            <View style={styles.chatInput}>
              <TextInput
                style={styles.chatTextInput}
                placeholder="Type a message..."
                value={newMessage}
                onChangeText={setNewMessage}
                onSubmitEditing={sendChatMessage}
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={sendChatMessage}
              >
                <Ionicons name="send" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Participants Panel */}
        {showParticipants && (
          <View style={styles.participantsPanel}>
            <View style={styles.participantsHeader}>
              <Text style={styles.participantsTitle}>Participants ({participants.length})</Text>
              <TouchableOpacity onPress={() => setShowParticipants(false)}>
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            
            {participants.length > 0 ? (
              <FlatList
                data={participants}
                renderItem={renderParticipant}
                keyExtractor={(item) => item.id}
                style={styles.participantsList}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={styles.emptyParticipantsState}>
                <Ionicons name="person-outline" size={48} color="#999" />
                <Text style={styles.emptyParticipantsText}>No participants</Text>
                <Text style={styles.emptyParticipantsSubtext}>Invite others to join</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Meeting Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, isHandRaised && styles.controlButtonActive]}
          onPress={toggleHandRaise}
        >
          <Ionicons 
            name={isHandRaised ? "hand-left" : "hand-left-outline"} 
            size={24} 
            color={isHandRaised ? "#fff" : "#666"} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonMuted]}
          onPress={toggleMute}
        >
          <Ionicons 
            name={isMuted ? "mic-off" : "mic"} 
            size={24} 
            color={isMuted ? "#FF3B30" : "#666"} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, isVideoOn && styles.controlButtonActive]}
          onPress={toggleVideo}
        >
          <Ionicons 
            name={isVideoOn ? "videocam" : "videocam-off"} 
            size={24} 
            color={isVideoOn ? "#34C759" : "#666"} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, isScreenSharing && styles.controlButtonActive]}
          onPress={toggleScreenShare}
        >
          <Ionicons 
            name="desktop" 
            size={24} 
            color={isScreenSharing ? "#007AFF" : "#666"} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, showChat && styles.controlButtonActive]}
          onPress={() => setShowChat(!showChat)}
        >
          <Ionicons 
            name="chatbubbles" 
            size={24} 
            color={showChat ? "#007AFF" : "#666"} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, isRecording && styles.controlButtonRecording]}
          onPress={toggleRecording}
        >
          <Ionicons 
            name={isRecording ? "stop-circle" : "radio-button-on"} 
            size={24} 
            color={isRecording ? "#FF3B30" : "#666"} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.leaveButton]}
          onPress={() => {
            Alert.alert(
              'Leave Meeting',
              'Are you sure you want to leave the meeting?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: () => router.back() }
              ]
            );
          }}
        >
          <Ionicons name="call" size={24} color="#FF3B30" />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  headerInfo: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  meetingDuration: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 2,
  },
  headerControls: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  headerButtonText: {
    fontSize: 14,
    color: '#fff',
  },
  mainArea: {
    flex: 1,
    position: 'relative',
  },
  videoGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  emptyVideoGrid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyVideoText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  videoTile: {
    width: screenWidth / 2 - 16,
    height: screenHeight / 3 - 16,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#444',
  },
  videoPlaceholderText: {
    color: '#fff',
    fontSize: 16,
  },
  avatarPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007AFF',
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '600',
  },
  videoOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantNameOverlay: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  chatPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 300,
    height: '100%',
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  chatMessages: {
    flex: 1,
    padding: 16,
  },
  emptyChatState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyChatText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    fontWeight: '600',
  },
  emptyChatSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  chatInput: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
  },
  chatTextInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  sendButton: {
    padding: 8,
  },
  chatMessage: {
    marginBottom: 12,
  },
  systemMessage: {
    alignItems: 'center',
  },
  messageSender: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  systemMessageText: {
    color: '#666',
    fontStyle: 'italic',
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  participantsPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 300,
    height: '100%',
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  participantsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  participantsList: {
    flex: 1,
    padding: 16,
  },
  emptyParticipantsState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyParticipantsText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    fontWeight: '600',
  },
  emptyParticipantsSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  participantInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  participantDetails: {
    flex: 1,
  },
  participantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  participantRole: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  participantControls: {
    flexDirection: 'row',
    gap: 8,
  },
  speakingIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#007AFF',
  },
  controlButtonMuted: {
    backgroundColor: '#FF3B30',
  },
  controlButtonRecording: {
    backgroundColor: '#FF3B30',
  },
  leaveButton: {
    backgroundColor: '#FF3B30',
  },
});
