/**
 * Join Meeting - Deep link handler for grabdocs://join-meeting?meeting_id=...
 * Redirects to the Reach meeting prebuilt interface (100ms HMS).
 * Web uses /join-meeting with prejoin flow; mobile opens this and goes straight to the meeting.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function JoinMeetingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meeting_id?: string; passcode?: string; passcode_token?: string }>();
  const meetingId = params.meeting_id;

  useEffect(() => {
    if (!meetingId || typeof meetingId !== 'string' || !meetingId.trim()) {
      router.replace('/(tabs)');
      return;
    }

    // Redirect to Reach meeting prebuilt interface with meeting_id
    router.replace({
      pathname: '/quick-reach/hms-meeting-interface',
      params: {
        meetingId: meetingId.trim(),
        ...(params.passcode && { passcode: params.passcode }),
        ...(params.passcode_token && { passcode_token: params.passcode_token }),
      },
    });
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
