import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from './context/auth';

export default function Page() {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // or a loading component
  }

  // Redirect based on authentication status
  if (user) {
    return <Redirect href="/(tabs)" />;
  } else {
    return <Redirect href="/(auth)" />;
  }
}

 