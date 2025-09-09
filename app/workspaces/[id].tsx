import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
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
  const router = useRouter();
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
      // Get all workspaces and find the one with matching ID
      const workspacesResponse = await apiService.getMobileWorkspaces();
      
      if (workspacesResponse.success && workspacesResponse.data) {
        const workspacesData = Array.isArray(workspacesResponse.data) 
          ? workspacesResponse.data 
          : (workspacesResponse.data.workspaces || []);
        
        // Find the workspace with matching ID
        const targetWorkspace = workspacesData.find((ws: any) => ws.id === Number(id));
        
        if (targetWorkspace) {
          console.log('✅ Found workspace:', targetWorkspace.name);
          setWorkspace(targetWorkspace);
          
          // For now, set empty members array since we don't have a members endpoint
          // TODO: Implement workspace members endpoint in backend
          setMembers([]);
        } else {
          console.log('❌ Workspace not found with ID:', id);
          Alert.alert(
            'Workspace Not Found',
            'This workspace could not be found or you may not have access to it.',
            [
              { text: 'OK', onPress: () => router.back() }
            ]
          );
        }
      } else {
        console.log('❌ Failed to load workspaces list');
        Alert.alert('Error', 'Failed to load workspace details');
      }
    } catch (error: any) {
      console.error('❌ Failed to load workspace:', error);
      Alert.alert('Error', error.message || 'Failed to load workspace details');
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
      const response = await apiService.inviteToWorkspace(Number(id), inviteEmail.trim(), inviteRole);

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

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Workspace Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={styles.workspaceIcon}>
              <Ionicons name="business" size={24} color="#007AFF" />
            </View>
            <View style={styles.workspaceInfo}>
              <Text style={styles.workspaceName}>{workspace.name}</Text>
              <Text style={styles.workspaceDescription}>{workspace.description || 'No description'}</Text>
              <Text style={styles.workspaceMeta}>
                {workspace.member_count} member{workspace.member_count !== 1 ? 's' : ''} • {workspace.user_role}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => router.push('/quick-reach/meeting-call')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#007AFF' }]}>
                <Ionicons name="videocam" size={24} color="#fff" />
              </View>
              <Text style={styles.actionText}>Start Call</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => router.push('/(tabs)/chats')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#34C759' }]}>
                <Ionicons name="chatbubbles" size={24} color="#fff" />
              </View>
              <Text style={styles.actionText}>Message</Text>
            </TouchableOpacity>

            {workspace.can_invite && (
              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={() => setInviteModalVisible(true)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#FF9500' }]}>
                  <Ionicons name="person-add" size={24} color="#fff" />
                </View>
                <Text style={styles.actionText}>Send Invite</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => router.push('/(tabs)/documents')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#AF52DE' }]}>
                <Ionicons name="folder-open" size={24} color="#fff" />
              </View>
              <Text style={styles.actionText}>View Files</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Members ({workspace.member_count})</Text>
            {workspace.can_invite && (
              <TouchableOpacity onPress={() => setInviteModalVisible(true)}>
                <Text style={styles.sectionAction}>Invite</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {members.length > 0 ? (
            <View style={styles.membersList}>
              {members.map((member) => (
                <View key={member.id} style={styles.memberItem}>
                  <View style={styles.memberAvatar}>
                    <Ionicons name="person" size={20} color="#666" />
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.user?.name || member.user?.email || 'Unknown User'}</Text>
                    <Text style={styles.memberRole}>{member.role}</Text>
                  </View>
                  {member.user_id === user?.id && (
                    <View style={styles.youBadge}>
                      <Text style={styles.youBadgeText}>You</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>No members found</Text>
              <Text style={styles.emptyStateSubtext}>Invite users to collaborate</Text>
            </View>
          )}
        </View>

        {/* Recent Activity Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No recent activity</Text>
            <Text style={styles.emptyStateSubtext}>Activity will appear here</Text>
          </View>
        </View>
      </ScrollView>

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
  scrollView: { flex: 1 },
  listContainer: { padding: 16 },
  
  // Workspace Info Card
  infoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, margin: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  infoHeader: { flexDirection: 'row', alignItems: 'center' },
  workspaceIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  workspaceInfo: { flex: 1 },
  workspaceName: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 4 },
  workspaceDescription: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 8 },
  workspaceMeta: { fontSize: 12, color: '#999' },
  
  // Actions Section
  actionsSection: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 16 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionButton: { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionText: { fontSize: 14, fontWeight: '600', color: '#333', textAlign: 'center' },
  
  // Section
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionAction: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  
  // Members
  membersList: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  memberItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 2 },
  memberRole: { fontSize: 14, color: '#666', textTransform: 'capitalize' },
  youBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  youBadgeText: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  
  // Empty State
  emptyState: { alignItems: 'center', padding: 40 },
  emptyStateText: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 4 },
  emptyStateSubtext: { fontSize: 14, color: '#666', textAlign: 'center' },
  
  // Legacy styles (keeping for compatibility)
  memberCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  roleContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  roleText: { fontSize: 12, color: '#666', marginLeft: 4, textTransform: 'capitalize' },
  memberEmail: { fontSize: 14, color: '#666', marginBottom: 4 },
  joinedDate: { fontSize: 12, color: '#999' },
  memberCount: { fontSize: 14, color: '#666' },
  workspaceSlug: { fontSize: 14, color: '#007AFF', fontFamily: 'monospace' },
  
  // Modal styles
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