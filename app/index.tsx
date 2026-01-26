import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from './context/auth';

export default function Page() {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // or a loading component
  }

  // Redirect based on authentication status
  // Only redirect to tabs if user exists AND has a valid ID
  // This prevents redirecting when login fails but user state might be stale
  if (user && user.id) {
    return <Redirect href="/(tabs)" />;
  } else {
    return <Redirect href="/(auth)" />;
  }
}

 