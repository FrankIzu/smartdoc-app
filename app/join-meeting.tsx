/**
 * Join Meeting - Deep link handler for grabdocs://join-meeting?meeting_id=...
 * Redirects to the Reach meeting prebuilt interface (100ms HMS).
 * Web uses /join-meeting with prejoin flow; mobile opens this and goes straight to the meeting.
 *
 * Optional warm room: If user is owner and meeting not started, call schedule/start before
 * navigating so the HMS room exists when hms-meeting-interface requests the token.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { apiClient } from '../services/api';

export default function JoinMeetingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meeting_id?: string; passcode?: string; passcode_token?: string }>();
  const meetingId = params.meeting_id;

  useEffect(() => {
    if (!meetingId || typeof meetingId !== 'string' || !meetingId.trim()) {
      router.replace('/(tabs)');
      return;
    }

    const warmRoomAndNavigate = async () => {
      const trimmedId = meetingId.trim();
      try {
        // Check requirements (same as web) - warms room for owner if not started
        const checkRes = await apiClient.client.post('/api/v1/video/room/check-requirements', {
          meeting_id: trimmedId,
        });
        const data = checkRes?.data;
        if (data?.success && (data.is_owner || data.is_current_host) && data.status !== 'active') {
          const roomId = data.room_id;
          if (roomId) {
            try {
              await apiClient.client.post('/api/v1/video/room/schedule/start', {
                scheduled_meeting_id: roomId,
              });
            } catch (startErr) {
              console.warn('App warm: schedule/start failed (proceeding anyway):', startErr);
            }
          }
        }
      } catch (err) {
        console.warn('App warm: check-requirements failed (proceeding anyway):', err);
      }

      router.replace({
        pathname: '/quick-reach/hms-meeting-interface',
        params: {
          meetingId: trimmedId,
          ...(params.passcode && { passcode: params.passcode }),
          ...(params.passcode_token && { passcode_token: params.passcode_token }),
        },
      });
    };

    warmRoomAndNavigate();
  }, [meetingId, params.passcode, params.passcode_token, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
