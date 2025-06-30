import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';
import { useAuth } from '../context/auth';

interface Workspace {
  id: number;
  name: string;
  description?: string;
  slug: string;
  owner_id: number;
  is_personal: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count: number;
  user_role: 'owner' | 'admin' | 'member' | 'viewer';
  can_manage: boolean;
  can_invite: boolean;
  can_edit: boolean;
}

interface WorkspaceMember {
  id: number;
  user_id: number;
  workspace_id: number;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
  user: {
    id: number;
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  can_manage: boolean;
  can_edit_role: boolean;
  can_remove: boolean;
}

export default function WorkspaceDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [inviteLoading, setInviteLoading] = useState(false);

  const loadWorkspaceDetails = async () => {
    if (!user) return;
    
    try {
      const [workspaceResponse, membersResponse] = await Promise.all([
        apiService.getWorkspace(Number(id)),
        apiService.getWorkspaceMembers(Number(id)),
      ]);

      if (workspaceResponse.success) {
        setWorkspace(workspaceResponse.workspace);
      } else {
        // Check if workspace is inactive
        if (workspaceResponse.workspace_status === 'inactive') {
          Alert.alert(
            'Workspace Inactive',
            workspaceResponse.message || 'This workspace has been paused and is not accessible at this time.',
            [
              { text: 'OK', onPress: () => router.back() }
            ]
          );
        } else {
          Alert.alert('Error', workspaceResponse.message || 'Failed to load workspace');
        }
      }

      if (membersResponse.success) {
        setMembers(membersResponse.members || []);
      }
    } catch (error: any) {
      console.error('Failed to load workspace:', error);
      
      // Check if error response indicates inactive workspace
      if (error.response?.data?.workspace_status === 'inactive') {
        Alert.alert(
          'Workspace Inactive', 
          error.response.data.message || 'This workspace has been paused and is not accessible at this time.',
          [
            { text: 'OK', onPress: () => router.back() }
          ]
        );
      } else {
        Alert.alert('Error', error.message || 'Failed to load workspace details');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user && id) {
        loadWorkspaceDetails();
      }
    }, [user, id])
  );

  const handleRefresh = () => {
    if (!user) return;
    setRefreshing(true);
    loadWorkspaceDetails();
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Error', 'Email is required');
      return;
    }

    setInviteLoading(true);
    try {
      const response = await apiService.addWorkspaceMember(Number(id), {
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      if (response.success) {
        Alert.alert('Success', 'Invitation sent successfully');
        setInviteModalVisible(false);
        setInviteEmail('');
        setInviteRole('member');
        loadWorkspaceDetails();
      } else {
        Alert.alert('Error', response.message || 'Failed to send invitation');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const renderMemberItem = ({ item: member }: { item: WorkspaceMember }) => (
    <View style={styles.memberCard}>
      <View style={styles.memberInfo}>
        <View style={styles.memberHeader}>
          <Text style={styles.memberName}>
            {member.user.first_name && member.user.last_name
              ? `${member.user.first_name} ${member.user.last_name}`
              : member.user.username}
          </Text>
          <View style={styles.roleContainer}>
            <Ionicons 
              name={member.role === 'owner' ? 'star' : 
                    member.role === 'admin' ? 'shield' : 
                    member.role === 'member' ? 'person' : 'eye'} 
              size={14} 
              color="#666" 
            />
            <Text style={styles.roleText}>{member.role}</Text>
          </View>
        </View>
        <Text style={styles.memberEmail}>{member.user.email}</Text>
        <Text style={styles.joinedDate}>
          Joined {new Date(member.joined_at).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workspace</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text>Loading workspace...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!workspace) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workspace Not Found</Text>
          <View style={{ width: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{workspace.name}</Text>
        {workspace.can_invite && (
          <TouchableOpacity onPress={() => setInviteModalVisible(true)}>
            <Ionicons name="person-add" size={24} color="#007AFF" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={members}
        renderItem={renderMemberItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.workspaceInfo}>
            <Text style={styles.workspaceName}>{workspace.name}</Text>
            {workspace.description && (
              <Text style={styles.workspaceDescription}>{workspace.description}</Text>
            )}
            <View style={styles.workspaceMeta}>
              <Text style={styles.memberCount}>
                {workspace.member_count} member{workspace.member_count !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.workspaceSlug}>/{workspace.slug}</Text>
            </View>
            <Text style={styles.sectionTitle}>Members</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Invite Member Modal */}
      <Modal
        visible={inviteModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setInviteModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Invite Member</Text>
            <TouchableOpacity
              onPress={handleInviteMember}
              disabled={inviteLoading || !inviteEmail.trim()}
            >
              <Text style={[
                styles.modalSave,
                (inviteLoading || !inviteEmail.trim()) && styles.modalSaveDisabled
              ]}>
                {inviteLoading ? 'Sending...' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="Enter email address"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleSelector}>
                {(['admin', 'member', 'viewer'] as const).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleOption,
                      inviteRole === role && styles.roleOptionSelected
                    ]}
                    onPress={() => setInviteRole(role)}
                  >
                    <Text style={[
                      styles.roleOptionText,
                      inviteRole === role && styles.roleOptionTextSelected
                    ]}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333', flex: 1, textAlign: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContainer: { padding: 16 },
  workspaceInfo: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 20 },
  workspaceName: { fontSize: 24, fontWeight: '700', color: '#333', marginBottom: 8 },
  workspaceDescription: { fontSize: 16, color: '#666', lineHeight: 22, marginBottom: 16 },
  workspaceMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  memberCount: { fontSize: 14, color: '#666' },
  workspaceSlug: { fontSize: 14, color: '#007AFF', fontFamily: 'monospace' },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  memberCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  memberInfo: { flex: 1 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  memberName: { fontSize: 16, fontWeight: '600', color: '#333', flex: 1 },
  roleContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  roleText: { fontSize: 12, color: '#666', marginLeft: 4, textTransform: 'capitalize' },
  memberEmail: { fontSize: 14, color: '#666', marginBottom: 4 },
  joinedDate: { fontSize: 12, color: '#999' },
  modalContainer: { flex: 1, backgroundColor: '#f8f9fa' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  modalCancel: { fontSize: 16, color: '#666' },
  modalSave: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  modalSaveDisabled: { color: '#ccc' },
  modalContent: { padding: 20 },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '500', color: '#333', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#333' },
  roleSelector: { flexDirection: 'row', gap: 12 },
  roleOption: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', alignItems: 'center' },
  roleOptionSelected: { borderColor: '#007AFF', backgroundColor: '#E3F2FD' },
  roleOptionText: { fontSize: 14, color: '#666' },
  roleOptionTextSelected: { color: '#007AFF', fontWeight: '600' },
}); 