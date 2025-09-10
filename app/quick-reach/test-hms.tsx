import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hmsService } from '../../services/hmsService';

export default function TestHMSScreen() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [userName, setUserName] = useState('Test User');
  const [isLoading, setIsLoading] = useState(false);

  const testHMSConnection = async () => {
    if (!roomCode.trim()) {
      Alert.alert('Error', 'Please enter a room code');
      return;
    }

    try {
      setIsLoading(true);
      
      // Initialize HMS service
      await hmsService.initialize();
      
      // Test joining a meeting
      await hmsService.joinMeeting({
        roomCode: roomCode.trim(),
        userName: userName.trim(),
        enableAudio: true,
        enableVideo: true,
        role: 'viewer'
      });

      Alert.alert(
        'Success',
        'GrabDocs meeting service initialized successfully! You can now navigate to the meeting interface.',
        [
          {
            text: 'Go to Meeting',
            onPress: () => {
              router.push({
                pathname: './hms-meeting-interface',
                params: {
                  meetingId: roomCode.trim(),
                  title: 'Test Meeting',
                  userName: userName.trim()
                }
              });
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } catch (error) {
      console.error('HMS test failed:', error);
      Alert.alert(
        'Test Failed',
        `Failed to test GrabDocs connection: ${error instanceof Error ? error.message : 'Unknown error'}\n\nNote: Make sure your backend is running and GrabDocs meeting credentials are configured.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>GrabDocs Integration Test</Text>
        <Text style={styles.subtitle}>
          Test the GrabDocs meeting SDK integration before using the meeting interface
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Room Code</Text>
          <TextInput
            style={styles.input}
            value={roomCode}
            onChangeText={setRoomCode}
            placeholder="Enter room code"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>User Name</Text>
          <TextInput
            style={styles.input}
            value={userName}
            onChangeText={setUserName}
            placeholder="Enter your name"
            placeholderTextColor="#666"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={testHMSConnection}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Testing...' : 'Test GrabDocs Connection'}
          </Text>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Prerequisites:</Text>
          <Text style={styles.infoText}>
            • Backend server must be running{'\n'}
            • GrabDocs meeting credentials must be configured in .env{'\n'}
            • Valid room code must be provided{'\n'}
            • Network connection required
          </Text>
        </View>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
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
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#555',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 30,
  },
  buttonDisabled: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  infoContainer: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 30,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  backButton: {
    backgroundColor: 'transparent',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
