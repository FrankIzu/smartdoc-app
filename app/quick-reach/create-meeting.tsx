import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../services/api';

export default function CreateMeetingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [meetingData, setMeetingData] = useState({
    title: '',
    description: '',
    passcode: '',
    enableRecording: false,
    enableTranscription: false,
    isPrivate: false,
    participants: [] as string[]
  });
  const [newParticipant, setNewParticipant] = useState('');

  const createMeeting = async () => {
    if (!meetingData.title.trim()) {
      Alert.alert('Error', 'Please enter a meeting name');
      return;
    }

    if (meetingData.isPrivate && !meetingData.passcode.trim()) {
      Alert.alert('Error', 'Please enter a passcode for private meetings');
      return;
    }

    // Prepare meeting data for immediate creation
    const meetingPayload = {
      roomName: meetingData.title,
      title: meetingData.title,
      description: meetingData.description,
      isPrivate: meetingData.isPrivate,
      passcode: meetingData.isPrivate ? meetingData.passcode : undefined,
      enableRecording: meetingData.enableRecording,
      enableTranscription: meetingData.enableTranscription,
      participants: meetingData.participants
    };

    console.log('📱 Sending create meeting payload:', meetingPayload);

    try {
      setLoading(true);

      const response = await apiClient.client.post('/api/v1/video/room/create', meetingPayload);
      
      console.log('📱 Create meeting response:', response.data);
      
      if (response.data.success) {
        Alert.alert('Success', 'Meeting created successfully!', [
          {
            text: 'OK',
            onPress: () => {
              router.back();
            }
          }
        ]);
      } else {
        Alert.alert('Error', response.data.message || 'Failed to create meeting');
      }
    } catch (error: any) {
      console.error('Create meeting failed:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      if (error.response?.status === 409) {
        // Handle conflict - existing active meeting
        const activeMeeting = error.response?.data?.activeMeeting;
        Alert.alert(
          'Active Meeting Exists',
          `You already have an active meeting: "${activeMeeting?.name || 'Unknown'}". Would you like to end it and create a new one?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'End & Create New', 
              style: 'destructive',
              onPress: async () => {
                try {
                  // End the existing meeting first
                  await apiClient.endMeeting(activeMeeting.id.toString());
                  
                  // Then create the new meeting
                  const response = await apiClient.client.post('/api/v1/video/room/create', meetingPayload);
                  
                  if (response.data.success) {
                    Alert.alert('Success', 'Meeting created successfully!', [
                      {
                        text: 'OK',
                        onPress: () => {
                          router.back();
                        }
                      }
                    ]);
                  } else {
                    Alert.alert('Error', response.data.message || 'Failed to create meeting');
                  }
                } catch (endError) {
                  console.error('Failed to end existing meeting:', endError);
                  Alert.alert('Error', 'Failed to end existing meeting. Please try again.');
                }
              }
            }
          ]
        );
      } else if (error.response?.status === 500) {
        Alert.alert('Server Error', 'There was a server error while creating the meeting. Please try again or contact support.');
      } else {
        Alert.alert('Error', error.response?.data?.message || 'Failed to create meeting');
      }
    } finally {
      setLoading(false);
    }
  };

  const addParticipant = () => {
    if (newParticipant.trim() && !meetingData.participants.includes(newParticipant.trim())) {
      setMeetingData(prev => ({
        ...prev,
        participants: [...prev.participants, newParticipant.trim()]
      }));
      setNewParticipant('');
    }
  };

  const removeParticipant = (email: string) => {
    setMeetingData(prev => ({
      ...prev,
      participants: prev.participants.filter(p => p !== email)
    }));
  };

  const toggleFeature = (feature: 'enableRecording' | 'enableTranscription' | 'isPrivate') => {
    setMeetingData(prev => ({
      ...prev,
      [feature]: !prev[feature],
      // Clear passcode if making meeting public
      ...(feature === 'isPrivate' && !prev.isPrivate ? { passcode: '' } : {})
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Create New Meeting</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Meeting Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meeting Details</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Meeting Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter meeting name"
                value={meetingData.title}
                onChangeText={(text) => setMeetingData(prev => ({ ...prev, title: text }))}
                maxLength={100}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Enter meeting description"
                value={meetingData.description}
                onChangeText={(text) => setMeetingData(prev => ({ ...prev, description: text }))}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
            </View>
          </View>

          {/* Features */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Features</Text>
            
            <TouchableOpacity 
              style={styles.featureRow}
              onPress={() => toggleFeature('enableRecording')}
            >
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Enable Recording</Text>
              </View>
              <View style={[styles.checkbox, meetingData.enableRecording && styles.checkboxChecked]}>
                {meetingData.enableRecording && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.featureRow}
              onPress={() => toggleFeature('enableTranscription')}
            >
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Enable Transcription</Text>
              </View>
              <View style={[styles.checkbox, meetingData.enableTranscription && styles.checkboxChecked]}>
                {meetingData.enableTranscription && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.featureRow}
              onPress={() => toggleFeature('isPrivate')}
            >
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Private Meeting (Requires Passcode)</Text>
              </View>
              <View style={[styles.checkbox, meetingData.isPrivate && styles.checkboxChecked]}>
                {meetingData.isPrivate && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
            </TouchableOpacity>

            {meetingData.isPrivate && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Passcode *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter passcode"
                  value={meetingData.passcode}
                  onChangeText={(text) => setMeetingData(prev => ({ ...prev, passcode: text }))}
                  secureTextEntry
                  maxLength={20}
                />
              </View>
            )}
          </View>

          {/* Participants */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Participants (Optional)</Text>
            
            <View style={styles.participantInput}>
              <TextInput
                style={[styles.textInput, styles.participantTextInput]}
                placeholder="Enter email address"
                value={newParticipant}
                onChangeText={setNewParticipant}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.addButton} onPress={addParticipant}>
                <Ionicons name="add" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            {meetingData.participants.length > 0 && (
              <View style={styles.participantsList}>
                {meetingData.participants.map((email, index) => (
                  <View key={index} style={styles.participantItem}>
                    <Text style={styles.participantEmail}>{email}</Text>
                    <TouchableOpacity onPress={() => removeParticipant(email)}>
                      <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.createButton, loading && styles.createButtonDisabled]}
            onPress={createMeeting}
            disabled={loading}
          >
            <Text style={styles.createButtonText}>
              {loading ? 'Creating...' : 'Create Meeting'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardView: {
    flex: 1,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#495057',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#212529',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    color: '#212529',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
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
  },
  participantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  participantEmail: {
    fontSize: 14,
    color: '#495057',
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#6c757d',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  createButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#c6c6c6',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
