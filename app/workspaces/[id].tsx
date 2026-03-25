import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService } from '../../services/api';
import { screenCache } from '../../utils/screenCache';
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
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
  const [invitations, setInvitations] = useState<any[]>([]);
  const [showInvitationKebab, setShowInvitationKebab] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<any>(null);
  const [showMemberActionSheet, setShowMemberActionSheet] = useState(false);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const WORKSPACE_DETAIL_CACHE_MS = 30_000;
  const WORKSPACES_LIST_CACHE_KEY = 'workspaces_list';
  const WORKSPACES_LIST_CACHE_MS = 30_000;
  const workspaceDetailCacheKey = `workspace_detail_${id}`;

  interface WorkspaceDetailCache {
    workspace: Workspace;
    members: WorkspaceMember[];
    invitations: any[];
    recentActivities: any[];
  }

  const loadWorkspaceDetails = async (forceRefresh = false) => {
    if (!user) return;

    if (!forceRefresh) {
      const cached = screenCache.get<WorkspaceDetailCache>(
        workspaceDetailCacheKey,
        WORKSPACE_DETAIL_CACHE_MS
      );
      if (cached) {
        setWorkspace(cached.workspace);
        setMembers(cached.members);
        setInvitations(cached.invitations);
        setRecentActivities(cached.recentActivities);
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }
    
    try {
      const wid = Number(id);
      let targetWorkspace: any = null;
      let workspacesListFailed = false;

      const listCached = screenCache.get<any[]>(WORKSPACES_LIST_CACHE_KEY, WORKSPACES_LIST_CACHE_MS);
      if (listCached?.length) {
        targetWorkspace = listCached.find((ws: any) => ws.id === wid) ?? null;
      }

      if (!targetWorkspace) {
        const workspacesResponse = await apiService.getMobileWorkspaces();
        if (workspacesResponse.success && workspacesResponse.data) {
          const workspacesData = Array.isArray(workspacesResponse.data)
            ? workspacesResponse.data
            : (workspacesResponse.data.workspaces || []);
          targetWorkspace = workspacesData.find((ws: any) => ws.id === wid) ?? null;
        } else {
          workspacesListFailed = true;
        }
      }

      if (workspacesListFailed) {
        console.log('❌ Failed to load workspaces list');
        Alert.alert('Error', 'Failed to load workspace details');
      } else if (targetWorkspace) {
          console.log('✅ Found workspace:', targetWorkspace.name);
          setWorkspace(targetWorkspace);

          const membersPromise = apiService.getWorkspaceMembers(wid).catch((error: any) => {
            if (error.response?.status === 404) {
              console.log('⚠️ Workspace members endpoint not found (404), endpoint may not be implemented yet');
            } else {
              console.error('❌ Failed to load workspace members:', error);
              if (error.response?.status !== 404) {
                Alert.alert('Error', error.message || 'Failed to load workspace members');
              }
            }
            return null;
          });

          const filesPromise = apiService
            .getWorkspaceFiles(wid, { perPage: 100, timeoutMs: 25000 })
            .catch((error: any) => {
              console.warn('⚠️ Failed to load workspace files for recent activity:', error);
              return null;
            });

          const [membersOutcome, filesOutcome] = await Promise.all([membersPromise, filesPromise]);

          let membersData: WorkspaceMember[] = [];
          let invitationsData: any[] = [];
          if (membersOutcome?.success && membersOutcome.data) {
            const responseData = membersOutcome.data;
            membersData = responseData.members || [];
            invitationsData = responseData.invitations || [];
            console.log('✅ Loaded workspace members:', membersData.length);
            console.log('✅ Loaded workspace invitations:', invitationsData.length);
          } else if (!membersOutcome) {
            membersData = [];
            invitationsData = [];
          } else {
            console.log('⚠️ No members data in response');
          }
          setMembers(membersData);
          setInvitations(invitationsData);

          let activities: any[] = [];
          if (filesOutcome?.success) {
            let files: any[] = [];
            if (filesOutcome.files && Array.isArray(filesOutcome.files)) {
              files = filesOutcome.files;
            } else if (Array.isArray(filesOutcome.data)) {
              files = filesOutcome.data;
            }
            activities = files
              .sort((a: any, b: any) => {
                const dateA = a.updated_at || a.created_at ? new Date(a.updated_at || a.created_at).getTime() : 0;
                const dateB = b.updated_at || b.created_at ? new Date(b.updated_at || b.created_at).getTime() : 0;
                return dateB - dateA;
              })
              .slice(0, 5)
              .map((file: any) => {
                const fileName = file.original_filename || file.filename || file.name || 'Unknown file';
                const timestamp = file.updated_at || file.created_at
                  ? new Date(file.updated_at || file.created_at)
                  : new Date();
                const owner = file.owner;
                const sharedBy = owner?.username
                  ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.username
                  : null;
                const subtitle = sharedBy
                  ? `${fileName} (shared by ${sharedBy})`
                  : fileName;

                return {
                  id: file.id?.toString() || `file-${Date.now()}`,
                  type: 'share',
                  title: 'File shared to workspace',
                  subtitle,
                  timestamp,
                  icon: 'share-outline',
                  file
                };
              });
            console.log('✅ Loaded workspace recent activities:', activities.length);
          }
          setRecentActivities(activities);

          screenCache.set<WorkspaceDetailCache>(workspaceDetailCacheKey, {
            workspace: targetWorkspace,
            members: membersData,
            invitations: invitationsData,
            recentActivities: activities,
          });
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
      if (user && id) loadWorkspaceDetails();
    }, [user, id])
  );

  const handleRefresh = () => {
    if (!user) return;
    setRefreshing(true);
    screenCache.invalidate(workspaceDetailCacheKey);
    loadWorkspaceDetails(true);
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
        screenCache.invalidate(workspaceDetailCacheKey);
        loadWorkspaceDetails(true);
      } else {
        Alert.alert('Error', response.message || 'Failed to send invitation');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleExitWorkspace = () => {
    if (!workspace || !user) return;

    Alert.alert(
      'Exit Workspace',
      `Are you sure you want to exit "${workspace.name}"? You will lose access to this workspace.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: async () => {
            try {
              // Find current user's member ID
              const currentUserMember = members.find(m => m.user_id === Number(user.id));
              if (!currentUserMember) {
                Alert.alert('Error', 'Could not find your membership in this workspace');
                return;
              }

              const response = await apiService.removeWorkspaceMember(Number(id), currentUserMember.id);
              if (response.success) {
                Alert.alert('Success', 'You have exited the workspace', [
                  { text: 'OK', onPress: () => router.back() }
                ]);
              } else {
                Alert.alert('Error', response.message || 'Failed to exit workspace');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to exit workspace');
            }
          },
        },
      ]
    );
  };

  const handleResendInvitation = async () => {
    if (!selectedInvitation) return;
    
    setShowInvitationKebab(false);
    
    try {
      const response = await apiService.resendWorkspaceInvitation(Number(id), selectedInvitation.id);
      if (response.success) {
        Alert.alert('Success', 'Invitation resent successfully');
        screenCache.invalidate(workspaceDetailCacheKey);
        loadWorkspaceDetails(true);
      } else {
        Alert.alert('Error', response.message || 'Failed to resend invitation');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resend invitation');
    }
  };

  const handleCancelInvitation = async () => {
    if (!selectedInvitation) return;
    
    setShowInvitationKebab(false);
    
    Alert.alert(
      'Cancel Invitation',
      `Are you sure you want to cancel the invitation for ${selectedInvitation.email}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiService.cancelWorkspaceInvitation(Number(id), selectedInvitation.id);
              if (response.success) {
                Alert.alert('Success', 'Invitation cancelled');
                screenCache.invalidate(workspaceDetailCacheKey);
                loadWorkspaceDetails(true);
              } else {
                Alert.alert('Error', response.message || 'Failed to cancel invitation');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel invitation');
            }
          }
        }
      ]
    );
  };

  const handleChangeMemberRole = async (newRole: 'owner' | 'admin' | 'member' | 'viewer') => {
    if (!selectedMember) return;
    
    try {
      const response = await apiService.updateWorkspaceMemberRole(Number(id), selectedMember.id, newRole);
      if (response.success) {
        Alert.alert('Success', `Member role updated to ${newRole}`);
        screenCache.invalidate(workspaceDetailCacheKey);
        loadWorkspaceDetails(true);
        setSelectedMember(null);
      } else {
        Alert.alert('Error', response.message || 'Failed to update member role');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update member role');
    }
  };

  const handleShowRoleSelector = () => {
    if (!selectedMember) return;
    
    const memberName = selectedMember.user?.username || selectedMember.user?.email || 'this member';
    
    Alert.alert(
      'Change Role',
      `Select new role for ${memberName}:`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setShowMemberActionSheet(false) },
        { 
          text: 'Viewer', 
          onPress: () => {
            handleChangeMemberRole('viewer');
            setShowMemberActionSheet(false);
          }
        },
        { 
          text: 'Member', 
          onPress: () => {
            handleChangeMemberRole('member');
            setShowMemberActionSheet(false);
          }
        },
        { 
          text: 'Admin', 
          onPress: () => {
            handleChangeMemberRole('admin');
            setShowMemberActionSheet(false);
          }
        },
      ]
    );
  };

  const handleRemoveMember = async () => {
    if (!selectedMember) return;
    
    setShowMemberActionSheet(false);
    
    const memberName = selectedMember.user?.username || selectedMember.user?.email || 'this member';
    
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from this workspace?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiService.removeWorkspaceMember(Number(id), selectedMember.user_id);
              if (response.success) {
                Alert.alert('Success', 'Member removed from workspace');
                screenCache.invalidate(workspaceDetailCacheKey);
                loadWorkspaceDetails(true);
              } else {
                Alert.alert('Error', response.message || 'Failed to remove member');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove member');
            }
          }
        }
      ]
    );
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle: { fontSize: 18, fontWeight: '600', color: colors.text, flex: 1, textAlign: 'center' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollView: { flex: 1 },
    listContainer: { padding: 16 },
    infoCard: { backgroundColor: colors.card, borderRadius: 12, padding: 20, margin: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    infoHeader: { flexDirection: 'row', alignItems: 'center' },
    workspaceIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    workspaceInfo: { flex: 1 },
    workspaceName: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
    workspaceDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 8 },
    workspaceMeta: { fontSize: 12, color: colors.textLight },
    workspaceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    defaultTag: { backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    defaultText: { fontSize: 12, color: '#007AFF', fontWeight: '500' },
    actionsSection: { paddingHorizontal: 16, marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    actionButton: { width: '47%', backgroundColor: colors.card, borderRadius: 8, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    actionIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    actionText: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
    section: { paddingHorizontal: 16, marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    sectionAction: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
    tabContainer: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, padding: 4, marginBottom: 16 },
    tab: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center' },
    activeTab: { backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    tabText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    activeTabText: { color: '#007AFF', fontWeight: '600' },
    membersList: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },
    memberItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    memberAvatarText: { fontSize: 16, fontWeight: '700', color: colors.tint },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
    memberRole: { fontSize: 14, color: colors.textSecondary, textTransform: 'capitalize' },
    memberActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    memberActionButton: { padding: 4 },
    youBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    youBadgeText: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
    kebabMenuContainer: { backgroundColor: colors.card, borderRadius: 12, padding: 8, minWidth: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    kebabMenuItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
    kebabMenuText: { fontSize: 16, color: colors.text },
    actionSheetContainer: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, position: 'absolute', bottom: 0, left: 0, right: 0, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    actionSheetItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    actionSheetItemDanger: { borderBottomWidth: 0 },
    actionSheetText: { fontSize: 16, color: colors.text },
    actionSheetCancel: { marginTop: 8, padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border },
    actionSheetCancelText: { fontSize: 16, color: colors.textSecondary, fontWeight: '600' },
    emptyState: { alignItems: 'center', padding: 40 },
    emptyStateText: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
    emptyStateSubtext: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    memberCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12 },
    memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    roleContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    roleText: { fontSize: 12, color: colors.textSecondary, marginLeft: 4, textTransform: 'capitalize' },
    memberEmail: { fontSize: 12, color: colors.textLight, marginTop: 2 },
    joinedDate: { fontSize: 12, color: colors.textLight },
    memberCount: { fontSize: 14, color: colors.textSecondary },
    workspaceSlug: { fontSize: 14, color: '#007AFF', fontFamily: 'monospace' },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
    modalCancel: { fontSize: 16, color: colors.textSecondary },
    modalSave: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
    modalSaveDisabled: { color: '#ccc' },
    modalContent: { padding: 20 },
    inputGroup: { marginBottom: 24 },
    label: { fontSize: 16, fontWeight: '500', color: colors.text, marginBottom: 8 },
    input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text },
    roleSelector: { flexDirection: 'row', gap: 12 },
    roleOption: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
    roleOptionSelected: { borderColor: '#007AFF', backgroundColor: '#E3F2FD' },
    roleOptionText: { fontSize: 14, color: colors.textSecondary },
    roleOptionTextSelected: { color: '#007AFF', fontWeight: '600' },
  }), [colors]);

  const renderMemberItem = ({ item: member }: { item: WorkspaceMember }) => (
    <View style={dynamicStyles.memberCard}>
      <View style={dynamicStyles.memberInfo}>
        <View style={dynamicStyles.memberHeader}>
          <Text style={dynamicStyles.memberName}>
            {member.user.first_name && member.user.last_name
              ? `${member.user.first_name} ${member.user.last_name}`
              : member.user.username}
          </Text>
          <View style={dynamicStyles.roleContainer}>
            <Ionicons 
              name={member.role === 'owner' ? 'star' : 
                    member.role === 'admin' ? 'shield' : 
                    member.role === 'member' ? 'person' : 'eye'} 
              size={14} 
              color={colors.textSecondary} 
            />
            <Text style={dynamicStyles.roleText}>{member.role}</Text>
          </View>
        </View>
        <Text style={dynamicStyles.memberEmail}>{member.user.email}</Text>
        <Text style={dynamicStyles.joinedDate}>
          Joined {new Date(member.joined_at).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>Workspace</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={dynamicStyles.loadingContainer}>
          <Text style={{ color: colors.textSecondary }}>Loading workspace...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!workspace) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>Workspace Not Found</Text>
          <View style={{ width: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle} numberOfLines={1} ellipsizeMode="tail">{workspace.name}</Text>
        {workspace.user_role !== 'owner' && workspace.user_role !== 'admin' && (
          <TouchableOpacity onPress={handleExitWorkspace}>
            <Ionicons name="exit-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        )}
        {workspace.user_role === 'owner' || workspace.user_role === 'admin' ? (
          <View style={{ width: 24 }} />
        ) : null}
      </View>

      <ScrollView style={dynamicStyles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Workspace Info Card */}
        <View style={dynamicStyles.infoCard}>
          <View style={dynamicStyles.infoHeader}>
            <View style={dynamicStyles.workspaceIcon}>
              <Ionicons name="business" size={24} color="#007AFF" />
            </View>
            <View style={dynamicStyles.workspaceInfo}>
              <Text style={dynamicStyles.workspaceName} numberOfLines={1} ellipsizeMode="tail">{workspace.name}</Text>
              <Text style={dynamicStyles.workspaceDescription}>{workspace.description || 'No description'}</Text>
              <View style={dynamicStyles.workspaceMetaRow}>
                <Text style={dynamicStyles.workspaceMeta}>
                  {workspace.member_count} member{workspace.member_count !== 1 ? 's' : ''} • {workspace.user_role}
                </Text>
                {workspace.is_personal && (
                  <View style={dynamicStyles.defaultTag}>
                    <Text style={dynamicStyles.defaultText}>Default</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={dynamicStyles.actionsSection}>
          <Text style={dynamicStyles.sectionTitle}>Quick Actions</Text>
          <View style={dynamicStyles.actionsGrid}>
            <TouchableOpacity 
              style={[dynamicStyles.actionButton, creatingMeeting && { opacity: 0.6 }]} 
              onPress={async () => {
                if (creatingMeeting || !workspace) return;
                
                try {
                  setCreatingMeeting(true);
                  
                  // Get all workspace member emails (excluding current user)
                  const participantEmails = members
                    .filter(member => member.user && member.user.email && member.user.email !== user?.email)
                    .map(member => member.user.email)
                    .filter((email): email is string => !!email);
                  
                  console.log(`📞 Adding ${participantEmails.length} workspace members as participants`);
                  
                  // Create a meeting with workspace context
                  const meetingPayload = {
                    roomName: `${workspace.name} Meeting`,
                    title: `${workspace.name} Meeting`,
                    description: `Meeting in ${workspace.name} workspace`,
                    isPrivate: false,
                    enableRecording: false,
                    enableTranscription: false,
                    workspace_id: workspace.id,
                    participants: participantEmails, // Add all workspace members as participants
                    participant_count: participantEmails.length
                  };

                  const response = await apiService.client.post('/api/v1/video/room/create', meetingPayload);
                  
                  console.log('📱 Create meeting response:', response.data);
                  
                  if (response.data.success) {
                    // Handle different response structures:
                    // 1. Persistent meeting response: { success: true, room: { meeting_id: "...", ... }, is_existing: true }
                    // 2. New meeting response: { success: true, data: { meetingId: "...", ... } }
                    const roomData = response.data.room;
                    const dataMeeting = response.data.data;
                    const directData = response.data;
                    
                    // Get meeting title from various possible locations
                    const meetingTitle = 
                      roomData?.name || 
                      roomData?.title || 
                      dataMeeting?.title || 
                      dataMeeting?.name || 
                      dataMeeting?.roomName || 
                      directData?.title ||
                      directData?.name ||
                      `${workspace.name} Meeting`;
                    
                    // Show success message - meeting will appear in the list
                    // User can now join the meeting from the meeting list or send it to others
                    Alert.alert('Success', `Meeting "${meetingTitle}" created successfully! You can join it from the meeting list or send it to others.`, [
                      {
                        text: 'OK',
                        onPress: () => {
                          // Optionally navigate to meeting list, or just stay on workspace
                          // The meeting will appear in the meeting list when user navigates there
                        }
                      }
                    ]);
                  } else {
                    Alert.alert('Error', response.data.message || 'Failed to create meeting');
                  }
                } catch (error: any) {
                  console.error('Failed to create meeting:', error);
                  
                  // Handle conflict - existing active meeting
                  if (error.response?.status === 409) {
                    const activeMeeting = error.response?.data?.activeMeeting;
                    Alert.alert(
                      'Active Meeting Exists',
                      `You already have an active meeting: "${activeMeeting?.name || 'Unknown'}". Would you like to join it?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Join Meeting', 
                          onPress: () => {
                            const q = new URLSearchParams({
                              meetingId: String(activeMeeting?.meetingId || activeMeeting?.id || ''),
                              title: String(activeMeeting?.name || 'Active Meeting'),
                              userName: String(user?.name || user?.email?.split('@')[0] || 'Mobile User')
                            });
                            router.push(`/quick-reach/hms-meeting-interface?${q.toString()}` as any);
                          }
                        }
                      ]
                    );
                  } else {
                    Alert.alert('Error', error.response?.data?.message || 'Failed to create meeting. Please try again.');
                  }
                } finally {
                  setCreatingMeeting(false);
                }
              }}
              disabled={creatingMeeting}
            >
              <View style={[dynamicStyles.actionIcon, { backgroundColor: '#007AFF' }]}>
                {creatingMeeting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="videocam" size={24} color="#fff" />
                )}
              </View>
              <Text style={dynamicStyles.actionText}>
                {creatingMeeting ? 'Creating...' : 'Start Call'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={dynamicStyles.actionButton} 
              onPress={() => {
                // Navigate directly to user-chat screen with workspace context
                router.push({
                  pathname: '/user-chat',
                  params: { 
                    workspaceId: id.toString(), 
                    workspaceName: workspace.name
                  }
                });
              }}
            >
              <View style={[dynamicStyles.actionIcon, { backgroundColor: '#34C759' }]}>
                <Ionicons name="chatbubbles" size={24} color="#fff" />
              </View>
              <Text style={dynamicStyles.actionText}>Start Chat</Text>
            </TouchableOpacity>

            {workspace.can_invite && (
              <TouchableOpacity 
                style={dynamicStyles.actionButton} 
                onPress={() => setInviteModalVisible(true)}
              >
                <View style={[dynamicStyles.actionIcon, { backgroundColor: '#FF9500' }]}>
                  <Ionicons name="person-add" size={24} color="#fff" />
                </View>
                <Text style={dynamicStyles.actionText}>Send Invite</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={dynamicStyles.actionButton} 
              onPress={() => router.push({
                pathname: '/(tabs)/documents',
                params: { workspaceId: id.toString() }
              })}
            >
              <View style={[dynamicStyles.actionIcon, { backgroundColor: '#AF52DE' }]}>
                <Ionicons name="folder-open" size={24} color="#fff" />
              </View>
              <Text style={dynamicStyles.actionText}>View Files</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Members and Invitations Tabs */}
        <View style={dynamicStyles.section}>
          <View style={dynamicStyles.sectionHeader}>
            <Text style={dynamicStyles.sectionTitle}>Team</Text>
            {workspace.can_invite && (
              <TouchableOpacity onPress={() => setInviteModalVisible(true)}>
                <Text style={dynamicStyles.sectionAction}>Invite</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* Tab Navigation */}
          <View style={dynamicStyles.tabContainer}>
            <TouchableOpacity
              style={[dynamicStyles.tab, activeTab === 'members' && dynamicStyles.activeTab]}
              onPress={() => setActiveTab('members')}
            >
              <Text style={[dynamicStyles.tabText, activeTab === 'members' && dynamicStyles.activeTabText]}>
                Members ({workspace.member_count})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dynamicStyles.tab, activeTab === 'invitations' && dynamicStyles.activeTab]}
              onPress={() => setActiveTab('invitations')}
            >
              <Text style={[dynamicStyles.tabText, activeTab === 'invitations' && dynamicStyles.activeTabText]}>
                Invitations ({invitations.length})
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Tab Content */}
          {activeTab === 'members' ? (
            members.length > 0 ? (
              <View style={dynamicStyles.membersList}>
                {members.map((member) => (
                  <View key={member.id} style={dynamicStyles.memberItem}>
                    <View style={dynamicStyles.memberAvatar}>
                      {(() => {
                        const first = (member.user?.first_name || '').trim();
                        const last = (member.user?.last_name || '').trim();
                        const initials = (first.charAt(0) + last.charAt(0)).toUpperCase();
                        if (initials) {
                          return <Text style={dynamicStyles.memberAvatarText}>{initials}</Text>;
                        }
                        return <Ionicons name="person" size={20} color={colors.textSecondary} />;
                      })()}
                    </View>
                    <View style={dynamicStyles.memberInfo}>
                      <Text style={dynamicStyles.memberName}>
                        {member.user?.first_name && member.user?.last_name
                          ? `${member.user.first_name} ${member.user.last_name}`
                          : member.user?.username || member.user?.email || 'Unknown User'}
                      </Text>
                      <Text style={dynamicStyles.memberRole}>{member.role}</Text>
                      {member.user?.email && (
                        <Text style={dynamicStyles.memberEmail}>{member.user.email}</Text>
                      )}
                    </View>
                    <View style={dynamicStyles.memberActions}>
                      {member.user_id === Number(user?.id) && (
                        <View style={dynamicStyles.youBadge}>
                          <Text style={dynamicStyles.youBadgeText}>You</Text>
                        </View>
                      )}
                      {workspace?.can_manage && member.user_id !== Number(user?.id) && member.can_remove && (
                        <TouchableOpacity
                          style={dynamicStyles.memberActionButton}
                          onPress={() => {
                            setSelectedMember(member);
                            setShowMemberActionSheet(true);
                          }}
                        >
                          <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={dynamicStyles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.textLight} />
                <Text style={dynamicStyles.emptyStateText}>No members found</Text>
                <Text style={dynamicStyles.emptyStateSubtext}>Invite users to collaborate</Text>
              </View>
            )
          ) : (
            invitations.length > 0 ? (
              <View style={dynamicStyles.membersList}>
                {invitations.map((invitation: any) => (
                  <View key={invitation.id || invitation.email} style={dynamicStyles.memberItem}>
                    <View style={dynamicStyles.memberAvatar}>
                      <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                    </View>
                    <View style={dynamicStyles.memberInfo}>
                      <Text style={dynamicStyles.memberName}>{invitation.email || invitation.user?.email || 'Unknown'}</Text>
                      <Text style={dynamicStyles.memberRole}>{invitation.role || 'member'}</Text>
                      {invitation.status && (
                        <Text style={dynamicStyles.memberEmail}>Status: {invitation.status}</Text>
                      )}
                    </View>
                    {workspace?.can_invite && (
                      <TouchableOpacity
                        style={dynamicStyles.memberActionButton}
                        onPress={() => {
                          setSelectedInvitation(invitation);
                          setShowInvitationKebab(true);
                        }}
                      >
                        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={dynamicStyles.emptyState}>
                <Ionicons name="mail-outline" size={48} color={colors.textLight} />
                <Text style={dynamicStyles.emptyStateText}>No pending invitations</Text>
                <Text style={dynamicStyles.emptyStateSubtext}>Invitations will appear here</Text>
              </View>
            )
          )}
        </View>

        {/* Recent Activity Section */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Recent Activity</Text>
          {recentActivities.length > 0 ? (
            <View style={{ gap: 8 }}>
              {recentActivities.map((activity) => {
                const timeAgo = activity.timestamp 
                  ? (() => {
                      const diff = Date.now() - activity.timestamp.getTime();
                      const minutes = Math.floor(diff / 60000);
                      const hours = Math.floor(diff / 3600000);
                      const days = Math.floor(diff / 86400000);
                      if (days > 0) return `${days}d ago`;
                      if (hours > 0) return `${hours}h ago`;
                      if (minutes > 0) return `${minutes}m ago`;
                      return 'Just now';
                    })()
                  : '';

                return (
                  <TouchableOpacity
                    key={activity.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      backgroundColor: colors.backgroundSecondary,
                      borderRadius: 8,
                      gap: 12
                    }}
                    onPress={() => {
                      if (activity.file) {
                        router.push({
                          pathname: '/documents',
                          params: { workspaceId: id, fileId: activity.file.id }
                        });
                      }
                    }}
                  >
                    <Ionicons 
                      name={activity.icon as any} 
                      size={24} 
                      color={colors.primary} 
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ 
                        fontSize: 14, 
                        fontWeight: '500', 
                        color: colors.text,
                        marginBottom: 2
                      }}>
                        {activity.title}
                      </Text>
                      <Text style={{ 
                        fontSize: 12, 
                        color: colors.textSecondary 
                      }} numberOfLines={1}>
                        {activity.subtitle}
                      </Text>
                    </View>
                    {timeAgo && (
                      <Text style={{ 
                        fontSize: 11, 
                        color: colors.textLight 
                      }}>
                        {timeAgo}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={dynamicStyles.emptyState}>
              <Ionicons name="time-outline" size={48} color={colors.textLight} />
              <Text style={dynamicStyles.emptyStateText}>No recent activity</Text>
              <Text style={dynamicStyles.emptyStateSubtext}>Files shared to this workspace will appear here</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Invitation Kebab Menu */}
      <Modal
        visible={showInvitationKebab}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowInvitationKebab(false);
          setSelectedInvitation(null);
        }}
      >
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowInvitationKebab(false);
            setSelectedInvitation(null);
          }}
        >
          <View style={dynamicStyles.kebabMenuContainer}>
            <TouchableOpacity
              style={dynamicStyles.kebabMenuItem}
              onPress={handleResendInvitation}
            >
              <Ionicons name="send-outline" size={20} color="#007AFF" />
              <Text style={dynamicStyles.kebabMenuText}>Resend Invite</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={dynamicStyles.kebabMenuItem}
              onPress={handleCancelInvitation}
            >
              <Ionicons name="close-circle-outline" size={20} color="#FF3B30" />
              <Text style={[dynamicStyles.kebabMenuText, { color: '#FF3B30' }]}>Cancel Invite</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Member Action Sheet */}
      <Modal
        visible={showMemberActionSheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowMemberActionSheet(false);
          setSelectedMember(null);
        }}
      >
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowMemberActionSheet(false);
            setSelectedMember(null);
          }}
        >
          <View style={dynamicStyles.actionSheetContainer}>
            <TouchableOpacity
              style={dynamicStyles.actionSheetItem}
              onPress={handleShowRoleSelector}
            >
              <Ionicons name="person-outline" size={20} color="#007AFF" />
              <Text style={dynamicStyles.actionSheetText}>Change Role</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[dynamicStyles.actionSheetItem, dynamicStyles.actionSheetItemDanger]}
              onPress={() => {
                setShowMemberActionSheet(false);
                handleRemoveMember();
              }}
            >
              <Ionicons name="person-remove-outline" size={20} color="#FF3B30" />
              <Text style={[dynamicStyles.actionSheetText, { color: '#FF3B30' }]}>Remove Member</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={dynamicStyles.actionSheetCancel}
              onPress={() => {
                setShowMemberActionSheet(false);
                setSelectedMember(null);
              }}
            >
              <Text style={dynamicStyles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invite Member Modal */}
      <Modal
        visible={inviteModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <SafeAreaView style={dynamicStyles.modalContainer} edges={['left', 'right', 'bottom']}>
          <View style={[dynamicStyles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => setInviteModalVisible(false)}>
              <Text style={dynamicStyles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Invite Member</Text>
            <TouchableOpacity
              onPress={handleInviteMember}
              disabled={inviteLoading || !inviteEmail.trim()}
            >
              <Text style={[
                dynamicStyles.modalSave,
                (inviteLoading || !inviteEmail.trim()) && dynamicStyles.modalSaveDisabled
              ]}>
                {inviteLoading ? 'Sending...' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={dynamicStyles.modalContent}>
            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Email Address</Text>
              <TextInput
                style={dynamicStyles.input}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="Enter email address"
                placeholderTextColor={colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Role</Text>
              <View style={dynamicStyles.roleSelector}>
                {(['admin', 'member', 'viewer'] as const).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      dynamicStyles.roleOption,
                      inviteRole === role && dynamicStyles.roleOptionSelected
                    ]}
                    onPress={() => setInviteRole(role)}
                  >
                    <Text style={[
                      dynamicStyles.roleOptionText,
                      inviteRole === role && dynamicStyles.roleOptionTextSelected
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
