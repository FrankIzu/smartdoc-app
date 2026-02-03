import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from './context/auth';

/**
 * Deep-link target: grabdocs://login-success?token=...&jwt=...&user_id=...
 * AuthContext handles the URL and sets the user; this screen redirects to home
 * so the user doesn't see "Unmatched Route".
 */
export default function LoginSuccessScreen() {
  const { user } = useAuth();
  const [giveUp, setGiveUp] = useState(false);

  useEffect(() => {
    // Redirect after auth context sets user, or after 2s max so we don't hang
    const t = setTimeout(() => setGiveUp(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Redirect to home as soon as user is set (auth context processed deep link), or after timeout
  if (user?.id || giveUp) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151718' }}>
      <ActivityIndicator size="large" color="#0ea5e9" />
    </View>
  );
}
