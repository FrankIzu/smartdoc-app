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

export default function ScheduleMeetingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [meetingData, setMeetingData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    timezone: 'UTC',
    password: '',
    enableRecording: false,
    enableTranscription: false,
    participants: [] as string[]
  });
  const [newParticipant, setNewParticipant] = useState('');

  const createMeeting = async () => {
    if (!meetingData.title.trim()) {
      Alert.alert('Error', 'Please enter a meeting title');
      return;
    }

    if (!meetingData.startTime) {
      Alert.alert('Error', 'Please select a start time');
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.client.post('/api/v1/mobile/meetings/create', meetingData);
      
      if (response.data.success) {
        Alert.alert('Success', 'Meeting scheduled successfully', [
          {
            text: 'OK',
            onPress: () => {
              router.back();
            }
          }
        ]);
      } else {
        Alert.alert('Error', response.data.message || 'Failed to schedule meeting');
      }
    } catch (error: any) {
      console.error('Failed to create meeting:', error);
      Alert.alert('Error', 'Failed to schedule meeting');
    } finally {
      setLoading(false);
    }
  };

  const addParticipant = () => {
    if (!newParticipant.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    if (!newParticipant.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (meetingData.participants.includes(newParticipant.trim())) {
      Alert.alert('Error', 'This email is already added');
      return;
    }

    setMeetingData(prev => ({
      ...prev,
      participants: [...prev.participants, newParticipant.trim()]
    }));
    setNewParticipant('');
  };

  const removeParticipant = (email: string) => {
    setMeetingData(prev => ({
      ...prev,
      participants: prev.participants.filter(p => p !== email)
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Schedule Meeting</Text>
          <TouchableOpacity 
            onPress={createMeeting}
            disabled={loading}
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          >
            <Text style={[styles.saveButtonText, loading && styles.saveButtonTextDisabled]}>
              {loading ? 'Creating...' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Meeting Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meeting Details</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter meeting title"
                value={meetingData.title}
                onChangeText={(text) => setMeetingData(prev => ({ ...prev, title: text }))}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Enter meeting description (optional)"
                value={meetingData.description}
                onChangeText={(text) => setMeetingData(prev => ({ ...prev, description: text }))}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          {/* Schedule */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Start Time *</Text>
              <TouchableOpacity style={styles.input}>
                <Text style={styles.placeholderText}>Select start time</Text>
                <Ionicons name="calendar" size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>End Time</Text>
              <TouchableOpacity style={styles.input}>
                <Text style={styles.placeholderText}>Select end time</Text>
                <Ionicons name="calendar" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Security */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Meeting Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password (optional)"
                value={meetingData.password}
                onChangeText={(text) => setMeetingData(prev => ({ ...prev, password: text }))}
                secureTextEntry
              />
            </View>
          </View>

          {/* Participants */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Participants</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Add Participant</Text>
              <View style={styles.participantInput}>
                <TextInput
                  style={[styles.input, styles.participantTextInput]}
                  placeholder="Enter email address"
                  value={newParticipant}
                  onChangeText={setNewParticipant}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onSubmitEditing={addParticipant}
                />
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={addParticipant}
                >
                  <Ionicons name="add" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            {meetingData.participants.length > 0 && (
              <View style={styles.participantsList}>
                {meetingData.participants.map((email, index) => (
                  <View key={index} style={styles.participantItem}>
                    <Text style={styles.participantEmail}>{email}</Text>
                    <TouchableOpacity
                      onPress={() => removeParticipant(email)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close" size={16} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))}
                <Text style={styles.participantCount}>
                  {meetingData.participants.length} participant{meetingData.participants.length !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Options */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Options</Text>
            
            <TouchableOpacity 
              style={styles.optionItem}
              onPress={() => setMeetingData(prev => ({ ...prev, enableRecording: !prev.enableRecording }))}
            >
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Enable Recording</Text>
                <Text style={styles.optionDescription}>Record the meeting for future reference</Text>
              </View>
              <View style={[styles.toggle, meetingData.enableRecording && styles.toggleActive]}>
                {meetingData.enableRecording && <View style={styles.toggleKnob} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.optionItem}
              onPress={() => setMeetingData(prev => ({ ...prev, enableTranscription: !prev.enableTranscription }))}
            >
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Enable Transcription</Text>
                <Text style={styles.optionDescription}>Generate automatic transcripts</Text>
              </View>
              <View style={[styles.toggle, meetingData.enableTranscription && styles.toggleActive]}>
                {meetingData.enableTranscription && <View style={styles.toggleKnob} />}
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#adb5bd',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  saveButtonTextDisabled: {
    color: '#6c757d',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    alignItems: 'flex-start',
    paddingTop: 12,
  },
  placeholderText: {
    color: '#6c757d',
    fontSize: 16,
  },
  participantInput: {
    flexDirection: 'row',
    gap: 8,
  },
  participantTextInput: {
    flex: 1,
  },
  addButton: {
    width: 44,
    height: 44,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  participantsList: {
    marginTop: 12,
  },
  participantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    marginBottom: 8,
  },
  participantEmail: {
    fontSize: 14,
    color: '#495057',
    flex: 1,
  },
  removeButton: {
    padding: 4,
  },
  participantCount: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
    marginTop: 8,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6c757d',
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: '#007AFF',
    alignItems: 'flex-end',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
});
