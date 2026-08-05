import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import {
  exchangeGoogleLoginToken,
  isLoginSuccessDeepLink,
  parseLoginSuccessToken,
} from '../utils/googleOAuthDeepLink';
import { navigateTabsThenDefaultHome, resolveDefaultHomeWebPath } from '../utils/defaultHomePath';
import { useAuth } from './context/auth';

/**
 * Deep-link target: grabdocs://login-success?code=...
 * Fallback when Android did not return the code to sign-in.tsx — this screen exchanges
 * the opaque code itself (from route params or Linking URL) instead of waiting on AuthContext.
 */
export default function LoginSuccessScreen() {
  const { user, setUserFromExternal } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; code?: string }>();
  const [giveUp, setGiveUp] = useState(false);
  const [error, setError] = useState(false);
  const navigatedRef = useRef(false);
  const exchangeStartedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setGiveUp(true), 12000);
    return () => clearTimeout(t);
  }, []);

  // Exchange token and establish session — do not rely on AuthContext's Linking listener.
  useEffect(() => {
    if (user?.id || exchangeStartedRef.current) return;
    exchangeStartedRef.current = true;

    void (async () => {
      let loginToken =
        (typeof params.code === 'string' ? params.code.trim() : '') ||
        (typeof params.token === 'string' ? params.token.trim() : '');

      if (!loginToken) {
        const initialUrl = await Linking.getInitialURL();
        loginToken = parseLoginSuccessToken(initialUrl) ?? '';
      }

      if (!loginToken) {
        // Deep link may arrive slightly after this screen mounts on Android.
        const waitedToken = await new Promise<string>((resolve) => {
          const timeout = setTimeout(() => {
            sub.remove();
            resolve('');
          }, 1500);
          const sub = Linking.addEventListener('url', ({ url }) => {
            if (isLoginSuccessDeepLink(url)) {
              clearTimeout(timeout);
              sub.remove();
              resolve(parseLoginSuccessToken(url) ?? '');
            }
          });
        });
        loginToken = waitedToken;
      }

      if (!loginToken) {
        setError(true);
        return;
      }

      const exchanged = await exchangeGoogleLoginToken(loginToken);
      if (!exchanged) {
        setError(true);
        return;
      }

      await setUserFromExternal(exchanged.user, exchanged.jwt, exchanged.refreshToken);
    })();
  }, [user?.id, params.token, params.code, setUserFromExternal]);

  useEffect(() => {
    if (!user?.id || navigatedRef.current) return;
    navigatedRef.current = true;
    void (async () => {
      const webPath = await resolveDefaultHomeWebPath();
      navigateTabsThenDefaultHome(router, webPath);
    })();
  }, [user?.id, router]);

  if ((giveUp && !user?.id) || error) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151718' }}>
      <ActivityIndicator size="large" color="#0ea5e9" />
    </View>
  );
}
