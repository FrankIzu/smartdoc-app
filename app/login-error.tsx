import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Deep-link target: grabdocs://login-error?error=...&description=...
 * AuthContext logs the error; this screen redirects to sign-in so the user can try again.
 */
export default function LoginErrorScreen() {
  return <Redirect href="/(auth)/sign-in" />;
}
