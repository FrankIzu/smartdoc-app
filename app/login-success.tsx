import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { navigateTabsThenDefaultHome, resolveDefaultHomeWebPath } from '../utils/defaultHomePath';
import { useAuth } from './context/auth';

/**
 * Deep-link target: grabdocs://login-success?token=...&jwt=...&user_id=...
 * AuthContext handles the URL and sets the user; this screen redirects to main app with default-home routing.
 */
export default function LoginSuccessScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [giveUp, setGiveUp] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setGiveUp(true), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!user?.id || navigatedRef.current) return;
    navigatedRef.current = true;
    void (async () => {
      const webPath = await resolveDefaultHomeWebPath();
      navigateTabsThenDefaultHome(router, webPath);
    })();
  }, [user?.id, router]);

  if (giveUp && !user?.id) {
    return <Redirect href="/(tabs)" />;
  }

  if (user?.id) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151718' }}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151718' }}>
      <ActivityIndicator size="large" color="#0ea5e9" />
    </View>
  );
}
