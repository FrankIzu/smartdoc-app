import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
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
  const [startDateTime, setStartDateTime] = useState(new Date());
  const [endDateTime, setEndDateTime] = useState(new Date(Date.now() + 60 * 60 * 1000)); // 1 hour later
  const [meetingData, setMeetingData] = useState({
    title: '',
    description: '',
    startTime: startDateTime.toISOString(),
    endTime: endDateTime.toISOString(),
    timezone: 'UTC',
    passcode: '',
    enableRecording: false,
    enableTranscription: false,
    isPrivate: false,
    participants: [] as string[]
  });
  const [newParticipant, setNewParticipant] = useState('');
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const createMeeting = async () => {
    if (!meetingData.title.trim()) {
      Alert.alert('Error', 'Please enter a meeting name');
      return;
    }

    if (!meetingData.startTime) {
      Alert.alert('Error', 'Please select a start date/time');
      return;
    }

    if (meetingData.isPrivate && !meetingData.passcode.trim()) {
      Alert.alert('Error', 'Please enter a passcode for private meetings');
      return;
    }

    // Prepare meeting data with formatted dates and email notifications
    const meetingPayload = {
      // Room information
      roomName: meetingData.title,
      room_name: meetingData.title,
      name: meetingData.title,
      title: meetingData.title,
      
      // Let backend generate the room URL - don't send room_url for scheduled meetings
      // room_url: `https://meet.grabdocs.com/${meetingData.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      
      description: meetingData.description,
      
      // Date and time information
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      scheduled_time: startDateTime.toISOString(),
      scheduled_at: startDateTime.toISOString(),
      
      timezone: meetingData.timezone,
      meeting_duration_minutes: Math.round((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60)),
      
      // Meeting settings
      isPrivate: meetingData.isPrivate,
      passcode: meetingData.isPrivate ? meetingData.passcode : undefined,
      passcode_required: meetingData.isPrivate,
      enableRecording: meetingData.enableRecording,
      enableTranscription: meetingData.enableTranscription,
      
      // Participants and email
      participants: meetingData.participants,
      invited_participants: meetingData.participants,
      participant_count: meetingData.participants.length,
      
      // Email integration with Resend
      sendEmailInvites: true,
      send_email_invites: true,
      email_invites: true,
      notify_participants: true,
      use_resend: true,
      email_provider: 'resend',
      
      // Meeting metadata
      meeting_type: 'general',
      meeting_status: 'scheduled',
      status: 'scheduled',
      max_participants: 10
    };

    console.log('📱 Sending meeting payload:', JSON.stringify(meetingPayload, null, 2));

    try {
      setLoading(true);

      // Use the mobile schedule endpoint as specified
      const response = await apiClient.client.post('/api/v1/mobile/meetings/schedule', meetingPayload);
      
      console.log('📱 Meeting creation response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success) {
        Alert.alert('Success', 'Meeting scheduled successfully! Email invitations have been sent to all participants.', [
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
      console.error('Create meeting failed:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Full error object:', error);
      
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
                  const response = await apiClient.client.post('/api/v1/mobile/meetings/schedule', meetingPayload);
                  
                  if (response.data.success) {
                    Alert.alert('Success', 'Meeting scheduled successfully! Email invitations have been sent to all participants.', [
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
                } catch (endError) {
                  console.error('Failed to end existing meeting:', endError);
                  Alert.alert('Error', 'Failed to end existing meeting. Please try again.');
                }
              }
            }
          ]
        );
      } else if (error.response?.status === 500) {
        Alert.alert('Server Error', 'There was a server error while scheduling the meeting. Please try again or contact support.');
      } else {
        Alert.alert('Error', error.response?.data?.message || 'Failed to schedule meeting');
      }
    } finally {
      setLoading(false);
    }
  };

  const onStartDateChange = (event: any, selectedDate?: Date) => {
    // Don't close the modal automatically - let user close it manually
    if (selectedDate) {
      // Prevent selecting past dates
      const now = new Date();
      if (selectedDate < now) {
        Alert.alert('Invalid Date', 'Please select a future date and time for the meeting.');
        return;
      }
      
      setStartDateTime(selectedDate);
      setMeetingData(prev => ({ ...prev, startTime: selectedDate.toISOString() }));
      
      // Auto-update end time to be 1 hour after start time
      const newEndTime = new Date(selectedDate.getTime() + 60 * 60 * 1000);
      setEndDateTime(newEndTime);
      setMeetingData(prev => ({ ...prev, endTime: newEndTime.toISOString() }));
    }
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    // Don't close the modal automatically - let user close it manually
    if (selectedDate) {
      // Prevent selecting end time before or equal to start time
      if (selectedDate <= startDateTime) {
        Alert.alert('Invalid Time', 'End time must be after start time. Please select a later date and time.');
        return;
      }
      
      setEndDateTime(selectedDate);
      setMeetingData(prev => ({ ...prev, endTime: selectedDate.toISOString() }));
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
          <Text style={styles.headerTitle}>Schedule Meeting</Text>
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

            {/* Start Date/Time */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Start Date & Time *</Text>
              <TouchableOpacity 
                style={styles.datePickerContainer}
                onPress={() => {
                  setShowStartDatePicker(true);
                  setShowEndDatePicker(false);
                }}
              >
                <Text style={styles.datePickerLabel}>
                  {startDateTime.toLocaleString([], { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            {/* End Date/Time */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>End Date & Time *</Text>
              <TouchableOpacity 
                style={styles.datePickerContainer}
                onPress={() => {
                  setShowEndDatePicker(true);
                  setShowStartDatePicker(false);
                }}
              >
                <Text style={styles.datePickerLabel}>
                  {endDateTime.toLocaleString([], { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
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
            style={styles.cancelButtonContainer}
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
              {loading ? 'Scheduling...' : 'Schedule Meeting'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Start Date/Time Picker Modal */}
      <Modal
        visible={showStartDatePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStartDatePicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStartDatePicker(false)}
        >
          <TouchableOpacity 
            style={styles.modalContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowStartDatePicker(false)}>
                <Text style={styles.modalCancelButton}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select Start Date & Time</Text>
              <TouchableOpacity onPress={() => setShowStartDatePicker(false)}>
                <Text style={styles.doneButton}>Done</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalContent}>
            <DateTimePicker
              value={startDateTime}
              mode="datetime"
              display="spinner"
              onChange={onStartDateChange}
              style={styles.modalDatePicker}
              textColor="#000000"
              accentColor="#007AFF"
              minimumDate={new Date()}
            />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* End Date/Time Picker Modal */}
      <Modal
        visible={showEndDatePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEndDatePicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEndDatePicker(false)}
        >
          <TouchableOpacity 
            style={styles.modalContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowEndDatePicker(false)}>
                <Text style={styles.modalCancelButton}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select End Date & Time</Text>
              <TouchableOpacity onPress={() => setShowEndDatePicker(false)}>
                <Text style={styles.doneButton}>Done</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalContent}>
            <DateTimePicker
              value={endDateTime}
              mode="datetime"
              display="spinner"
              onChange={onEndDateChange}
              style={styles.modalDatePicker}
              textColor="#000000"
              accentColor="#007AFF"
              minimumDate={startDateTime}
            />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  cancelButtonContainer: {
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
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  datePickerLabel: {
    fontSize: 16,
    color: '#212529',
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    marginBottom: 8,
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
  datePicker: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 20,
    maxHeight: '80%',
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  modalCancelButton: {
    fontSize: 16,
    color: '#6c757d',
  },
  doneButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'center',
  },
  modalDatePicker: {
    width: '100%',
    height: 200,
  },
});