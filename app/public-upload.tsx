import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

/**
 * Legacy route — public upload now lives at /upload-by-link (web upload-to API).
 */
export default function PublicUploadScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  useEffect(() => {
    if (token) {
      router.replace({ pathname: '/upload-by-link', params: { token } });
    } else {
      router.replace('/upload-by-link-code');
    }
  }, [token, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}
