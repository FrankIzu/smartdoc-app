import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useThemeColors } from '../hooks/useThemeColors';
import { apiService as api } from '../services/api';
import { useAuth } from './context/auth';
import {
  clearMobilePendingInviteIntent,
  saveMobilePendingInviteIntent,
} from './secure-message-invite';

/**
 * Mobile recipient flow for workspace email invites (parity with web /workspace-invite).
 */
export default function WorkspaceInviteScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user, isLoading: authLoading } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('Workspace');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Missing invitation token');
      return;
    }
    void (async () => {
      await saveMobilePendingInviteIntent('workspace_invite', token);
      if (!user && !authLoading) {
        setLoading(false);
        router.replace({
          pathname: '/(auth)/sign-in',
          params: {
            redirect: `/workspace-invite?token=${encodeURIComponent(token)}`,
            workspace_invite_token: token,
          },
        } as any);
        return;
      }
      if (!user) return;
      try {
        const res = await api.getWorkspaceInvitationByToken(token);
        const inv = (res as any)?.invitation;
        if (inv?.workspace?.name) setWorkspaceName(inv.workspace.name);
      } catch (e: any) {
        setError(e?.response?.data?.error || e?.message || 'Invalid invitation');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, user, authLoading, router]);

  const onAccept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      let res: any;
      try {
        res = await api.acceptWorkspaceInvitationByToken(token);
      } catch {
        res = await api.processWorkspaceInvitationByToken(token);
      }
      if (res?.success || res?.workspace) {
        await clearMobilePendingInviteIntent();
        Toast.show({ type: 'success', text1: 'Joined workspace' });
        const wsId = res?.workspace?.id;
        router.replace(wsId ? `/workspaces/${wsId}` : '/workspaces');
      } else {
        Toast.show({ type: 'error', text1: res?.error || 'Could not accept' });
      }
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: e?.response?.data?.error || e?.message || 'Could not accept',
      });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.card}>
        {loading || authLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={[styles.body, { color: colors.textSecondary }]}>{error}</Text>
        ) : user ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Workspace invitation</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              You have been invited to join {workspaceName}.
            </Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              disabled={accepting}
              onPress={onAccept}
            >
              <Text style={styles.btnText}>{accepting ? 'Joining…' : 'Accept invitation'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[styles.body, { color: colors.textSecondary }]}>Redirecting to sign in…</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { gap: 16 },
  title: { fontSize: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  btn: { marginTop: 8, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
