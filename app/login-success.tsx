import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { navigateTabsThenDefaultHome, resolveDefaultHomeWebPath } from '../utils/defaultHomePath';
import { useAuth } from './context/auth';

/**
 * Deep-link target: grabdocs://login-success?token=...&jwt=...&user_id=...
 * AuthContext handles the URL and sets the user; this screen is the SOLE driver of
 * post-auth navigation on Android (where openAuthSessionAsync returns {type:'dismiss'}
 * and the sign-in/sign-up screens intentionally do NOT navigate to avoid racing here).
 */
export default function LoginSuccessScreen() {
  const { user } = useAuth();
  const router = useRouter();
  // Increase give-up window to 10 s — token exchange on slow networks can take 2-4 s,
  // and the old 2 s timeout was redirecting unauthenticated users to /(tabs).
  const [giveUp, setGiveUp] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setGiveUp(true), 10000);
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

  // Give-up fallback: token exchange never resolved — send user back to sign-in
  // (not to /(tabs), which would show an unauthenticated dashboard).
  if (giveUp && !user?.id) {
    return <Redirect href="/(auth)/sign-in" />;
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
