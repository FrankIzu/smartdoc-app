import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { bootstrapAuthenticatedNavigation } from '../utils/defaultHomePath';
import { useAuth } from './context/auth';

export default function Page() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const didBootstrapRef = useRef(false);

  useEffect(() => {
    if (loading || !user?.id) {
      didBootstrapRef.current = false;
      return;
    }
    if (didBootstrapRef.current) {
      return;
    }
    didBootstrapRef.current = true;
    void bootstrapAuthenticatedNavigation(router);
  }, [loading, user?.id, router]);

  if (loading) {
    return null;
  }

  if (!user?.id) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Logged-in: bootstrap navigates away (tabs + optional push). Redirect-only to a tab leaf left no home under stack → GO_BACK failed.
  return null;
}
