import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DocumentViewer from '../../components/DocumentViewer';
import QuickFormViewer from '../../components/QuickFormViewer';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService } from '../../services/api';
import { getReachParticipantDisplayName } from '../../utils/reachDisplayName';
import { screenCache } from '../../utils/screenCache';
import {
  invalidateWorkspaceScreenCaches,
  workspaceActivitiesCacheKey,
  workspaceFilesSheetFirstPageKey,
  WORKSPACE_ACTIVITIES_CACHE_MS,
  WORKSPACE_FILES_SHEET_CACHE_MS,
  WORKSPACE_MEMBERS_CACHE_MS,
  workspaceMembersCacheKey,
  type WorkspaceActivitiesCachePayload,
  type WorkspaceFilesSheetCachePayload,
  type WorkspaceMembersCachePayload,
} from '../../utils/workspaceScreenCache';
import { useAuth } from '../context/auth';

interface WorkspaceSheetBookmark {
  bookmark_id: number;
  bookmark_name: string;
  file_count: number;
  is_locked: boolean;
}

type WorkspaceSheetListItem =
  | { kind: 'bookmark'; bookmark: WorkspaceSheetBookmark }
  | { kind: 'file'; file: any };

function normalizeWorkspaceSheetBookmarks(raw: any[]): WorkspaceSheetBookmark[] {
  return (raw ?? []).map((b: any) => ({
    bookmark_id: Number(b.bookmark_id ?? b.id),
    bookmark_name: String(b.bookmark_name ?? b.name ?? 'Bookmark'),
    file_count:
      Number(b.file_count ?? (Array.isArray(b.files) ? b.files.length : 0)) || 0,
    is_locked: Boolean(b.is_locked ?? b.isLocked),
  }));
}

function workspaceStandaloneFileSubtitle(f: any): string {
  const sizeLabel = formatBytes(f.file_size);
  return [f.file_kind, sizeLabel, f.created_at ? new Date(f.created_at).toLocaleDateString() : '']
    .filter(Boolean)
    .join(' • ');
}

function fileTypeFromFilename(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  if (['xls', 'xlsx'].includes(ext)) return 'xlsx';
  if (['ppt', 'pptx'].includes(ext)) return 'pptx';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return 'image';
  if (['txt', 'md'].includes(ext)) return 'txt';
  return 'other';
}

function formatBytes(bytes: number | undefined | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

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
  const [workspaceFilesSheetVisible, setWorkspaceFilesSheetVisible] = useState(false);
  const [workspaceFilesLoading, setWorkspaceFilesLoading] = useState(false);
  const [workspaceFilesLoadingMore, setWorkspaceFilesLoadingMore] = useState(false);
  const [workspaceSheetBookmarks, setWorkspaceSheetBookmarks] = useState<WorkspaceSheetBookmark[]>([]);
  const [workspaceSheetFiles, setWorkspaceSheetFiles] = useState<any[]>([]);
  const [workspaceFilesHasMore, setWorkspaceFilesHasMore] = useState(false);
  const [workspaceFilesNextOffset, setWorkspaceFilesNextOffset] = useState<number | null>(null);
  const [viewerFile, setViewerFile] = useState<{
    id: string;
    name: string;
    type: string;
    category?: string;
    workspaceId: number;
  } | null>(null);
  const [workspaceQuickForm, setWorkspaceQuickForm] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const workspaceSheetListItems = useMemo((): WorkspaceSheetListItem[] => {
    const items: WorkspaceSheetListItem[] = [];
    workspaceSheetBookmarks.forEach((b) => items.push({ kind: 'bookmark', bookmark: b }));
    workspaceSheetFiles.forEach((f) => items.push({ kind: 'file', file: f }));
    return items;
  }, [workspaceSheetBookmarks, workspaceSheetFiles]);

  const WORKSPACE_DETAIL_CACHE_MS = 30_000;
  const workspaceDetailCacheKey = `workspace_detail_${id}`;

  interface WorkspaceDetailCache {
    workspace: Workspace;
    members: WorkspaceMember[];
    invitations: any[];
    recentActivities: any[];
  }

  const loadMembersInBackground = useCallback(
    async (
      wid: number,
      currentWorkspace: any,
      currentActivities: any[]
    ) => {
      const mk = workspaceMembersCacheKey(wid);
      const cached = screenCache.get<WorkspaceMembersCachePayload>(mk, WORKSPACE_MEMBERS_CACHE_MS);
      if (cached) {
        setMembers(cached.members as WorkspaceMember[]);
        setInvitations(cached.invitations);
        screenCache.set<WorkspaceDetailCache>(workspaceDetailCacheKey, {
          workspace: currentWorkspace,
          members: cached.members as WorkspaceMember[],
          invitations: cached.invitations,
          recentActivities: currentActivities,
        });
        return;
      }
      try {
        const res = await apiService.getWorkspaceMembers(wid, 100, 0);
        if (!res?.success || !res.data) return;
        const membersData: WorkspaceMember[] = res.data.members || [];
        const invitationsData: any[] = res.data.invitations || [];
        setMembers(membersData);
        setInvitations(invitationsData);
        screenCache.set<WorkspaceMembersCachePayload>(mk, {
          members: membersData,
          invitations: invitationsData,
        });
        screenCache.set<WorkspaceDetailCache>(workspaceDetailCacheKey, {
          workspace: currentWorkspace,
          members: membersData,
          invitations: invitationsData,
          recentActivities: currentActivities,
        });
      } catch (err: any) {
        console.warn('⚠️ Background members load failed:', err?.message);
      }
    },
    [workspaceDetailCacheKey]
  );

  const loadActivitiesInBackground = useCallback(
    async (
      wid: number,
      currentWorkspace: any,
      currentMembers: WorkspaceMember[],
      currentInvitations: any[]
    ) => {
      const ak = workspaceActivitiesCacheKey(wid);
      const cached = screenCache.get<WorkspaceActivitiesCachePayload>(ak, WORKSPACE_ACTIVITIES_CACHE_MS);
      if (cached) {
        setRecentActivities(cached.activities);
        screenCache.set<WorkspaceDetailCache>(workspaceDetailCacheKey, {
          workspace: currentWorkspace,
          members: currentMembers,
          invitations: currentInvitations,
          recentActivities: cached.activities,
        });
        return;
      }
      try {
        const res = await apiService.getWorkspaceFiles(wid, { perPage: 40, timeoutMs: 25000 });
        if (!res?.success) return;
        const files: any[] = (res.files && Array.isArray(res.files) ? res.files : Array.isArray((res as any).data) ? (res as any).data : []);
        const activities = files
          .sort((a: any, b: any) => {
            const ta = a.updated_at || a.created_at ? new Date(a.updated_at || a.created_at).getTime() : 0;
            const tb = b.updated_at || b.created_at ? new Date(b.updated_at || b.created_at).getTime() : 0;
            return tb - ta;
          })
          .slice(0, 5)
          .map((file: any) => {
            const fileName = file.original_filename || file.filename || file.name || 'Unknown file';
            const timestamp = file.updated_at || file.created_at ? new Date(file.updated_at || file.created_at) : new Date();
            const owner = file.owner;
            const sharedBy = owner?.username
              ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.username
              : null;
            return {
              id: file.id?.toString() || `file-${Date.now()}`,
              type: 'share',
              title: 'File shared to workspace',
              subtitle: sharedBy ? `${fileName} (shared by ${sharedBy})` : fileName,
              timestamp,
              icon: 'share-outline',
              file,
            };
          });
        setRecentActivities(activities);
        screenCache.set<WorkspaceActivitiesCachePayload>(ak, { activities });
        screenCache.set<WorkspaceDetailCache>(workspaceDetailCacheKey, {
          workspace: currentWorkspace,
          members: currentMembers,
          invitations: currentInvitations,
          recentActivities: activities,
        });
      } catch (err: any) {
        console.warn('⚠️ Background activities load failed:', err?.message);
      }
    },
    [workspaceDetailCacheKey]
  );

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

    const wid = Number(id);
    try {
      // Single-workspace fetch: fast, doesn't load the full list.
      const wsRes = await apiService.getWorkspace(wid);
      const wsPayload = wsRes as typeof wsRes & { workspace?: unknown };
      const rawWs: any =
        wsPayload.workspace ?? (wsPayload.data as any)?.workspace ?? wsPayload.data ?? null;
      if (!rawWs?.id) {
        Alert.alert(
          'Workspace Not Found',
          'This workspace could not be found or you may not have access to it.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      // Normalise shape to match what the list endpoint returns so the rest of the screen works.
      const targetWorkspace: Workspace = {
        id: rawWs.id,
        name: rawWs.name,
        description: rawWs.description,
        slug: rawWs.slug ?? '',
        owner_id: rawWs.owner_id,
        is_personal: rawWs.is_personal ?? false,
        is_active: rawWs.is_active ?? true,
        created_at: rawWs.created_at ?? '',
        updated_at: rawWs.updated_at ?? '',
        member_count: rawWs.member_count ?? 0,
        user_role: rawWs.user_role ?? 'member',
        can_manage: rawWs.can_manage ?? false,
        can_invite: rawWs.can_invite ?? false,
        can_edit: rawWs.can_edit ?? false,
      };
      setWorkspace(targetWorkspace);

      // Show the screen immediately — members and activities load in the background.
      setLoading(false);
      setRefreshing(false);

      const priorCache = screenCache.get<WorkspaceDetailCache>(
        workspaceDetailCacheKey,
        WORKSPACE_DETAIL_CACHE_MS
      );
      let priorMembers =
        priorCache?.workspace?.id === wid ? (priorCache.members ?? []) : [];
      let priorInvitations =
        priorCache?.workspace?.id === wid ? (priorCache.invitations ?? []) : [];
      if (priorMembers.length === 0) {
        const mc = screenCache.get<WorkspaceMembersCachePayload>(
          workspaceMembersCacheKey(wid),
          WORKSPACE_MEMBERS_CACHE_MS
        );
        if (mc) {
          priorMembers = mc.members as WorkspaceMember[];
          priorInvitations = mc.invitations;
        }
      }
      let priorActivities =
        priorCache?.workspace?.id === wid ? (priorCache.recentActivities ?? []) : [];
      if (priorActivities.length === 0) {
        const ac = screenCache.get<WorkspaceActivitiesCachePayload>(
          workspaceActivitiesCacheKey(wid),
          WORKSPACE_ACTIVITIES_CACHE_MS
        );
        if (ac?.activities?.length) priorActivities = ac.activities;
      }
      setMembers(priorMembers);
      setInvitations(priorInvitations);
      setRecentActivities(priorActivities);

      screenCache.set<WorkspaceDetailCache>(workspaceDetailCacheKey, {
        workspace: targetWorkspace,
        members: priorMembers,
        invitations: priorInvitations,
        recentActivities: priorActivities,
      });

      // Background: members then activities (fire-and-forget, each independently).
      void loadMembersInBackground(wid, targetWorkspace, priorActivities);
      void loadActivitiesInBackground(wid, targetWorkspace, priorMembers, priorInvitations);
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
    invalidateWorkspaceScreenCaches(String(id), Number(id));
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
        invalidateWorkspaceScreenCaches(String(id), Number(id));
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
        invalidateWorkspaceScreenCaches(String(id), Number(id));
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
                invalidateWorkspaceScreenCaches(String(id), Number(id));
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
        invalidateWorkspaceScreenCaches(String(id), Number(id));
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

  const loadWorkspaceFilesSheet = useCallback(
    async (append = false) => {
      const wid = Number(id);
      if (!user || !Number.isFinite(wid)) return;
      const offset = append ? workspaceFilesNextOffset ?? 0 : 0;
      const sheetKey = workspaceFilesSheetFirstPageKey(wid);
      if (!append) {
        const fc = screenCache.get<WorkspaceFilesSheetCachePayload>(
          sheetKey,
          WORKSPACE_FILES_SHEET_CACHE_MS
        );
        if (fc) {
          setWorkspaceSheetBookmarks(normalizeWorkspaceSheetBookmarks(fc.bookmarks));
          setWorkspaceSheetFiles(fc.files);
          setWorkspaceFilesHasMore(fc.hasMore);
          setWorkspaceFilesNextOffset(fc.nextOffset);
          setWorkspaceFilesLoading(false);
          return;
        }
      }
      if (append) {
        setWorkspaceFilesLoadingMore(true);
      } else {
        setWorkspaceFilesLoading(true);
      }
      try {
        const res = await apiService.getWorkspaceFiles(wid, {
          perPage: 50,
          timeoutMs: 30000,
          offset,
        });
        if (res.success === false) {
          throw new Error((res as any).message || 'Failed to load workspace files');
        }
        const rawFiles: any[] = (res as any).files ?? (res as any).data ?? [];
        const rawBookmarks: any[] = (res as any).bookmarks ?? [];
        const normBm = normalizeWorkspaceSheetBookmarks(rawBookmarks);
        const hasMore = !!(res as any).has_more;
        const nextOff =
          (res as any).next_offset != null ? Number((res as any).next_offset) : null;
        const nextOffNum = Number.isFinite(nextOff as number) ? nextOff : null;

        if (append) {
          setWorkspaceSheetBookmarks((prev) => [...prev, ...normBm]);
          setWorkspaceSheetFiles((prev) => [...prev, ...rawFiles]);
          screenCache.invalidate(sheetKey);
        } else {
          setWorkspaceSheetBookmarks(normBm);
          setWorkspaceSheetFiles(rawFiles);
          screenCache.set<WorkspaceFilesSheetCachePayload>(sheetKey, {
            bookmarks: normBm,
            files: rawFiles,
            hasMore,
            nextOffset: nextOffNum,
          });
        }
        setWorkspaceFilesHasMore(hasMore);
        setWorkspaceFilesNextOffset(nextOffNum);
      } catch (e: any) {
        if (!append) {
          Alert.alert('Error', e?.message || 'Failed to load workspace files');
          setWorkspaceSheetBookmarks([]);
          setWorkspaceSheetFiles([]);
          setWorkspaceFilesHasMore(false);
          setWorkspaceFilesNextOffset(null);
          screenCache.invalidate(sheetKey);
        } else {
          Alert.alert('Error', e?.message || 'Failed to load more');
        }
      } finally {
        if (append) setWorkspaceFilesLoadingMore(false);
        else setWorkspaceFilesLoading(false);
      }
    },
    [user, id, workspaceFilesNextOffset]
  );

  const loadMoreWorkspaceFiles = useCallback(async () => {
    if (!workspaceFilesHasMore || workspaceFilesLoadingMore) return;
    await loadWorkspaceFilesSheet(true);
  }, [workspaceFilesHasMore, workspaceFilesLoadingMore, loadWorkspaceFilesSheet]);

  const openWorkspaceFilesSheet = () => {
    setWorkspaceFilesSheetVisible(true);
    void loadWorkspaceFilesSheet(false);
  };

  const openFileFromWorkspaceSheet = useCallback(
    (file: any) => {
      const fid = file?.id;
      if (fid == null) return;
      const originalName = file.original_filename || file.filename || 'File';
      const fk = (file.file_kind || '').toString().toLowerCase();
      const ps = (file.processing_status || '').toString().toLowerCase();
      if (fk === 'pending' || ps === 'pending' || ps === 'processing') {
        Alert.alert(
          'Document Processing',
          `"${originalName}" is still being processed. Please wait a few moments and try again.`
        );
        return;
      }

      // Close sheet first so DocumentViewer’s Modal stacks above (same UX as leaving the list on Files).
      setWorkspaceFilesSheetVisible(false);

      if (fk === 'draft') {
        router.push(`/drafts/edit/${fid}` as any);
        return;
      }

      const cat = fk || (file.receipt_category || '').toString().toLowerCase();
      if (cat === 'form' || cat === 'forms') {
        setWorkspaceQuickForm({ id: String(fid), name: originalName });
        return;
      }

      setViewerFile({
        id: String(fid),
        name: originalName,
        type: fileTypeFromFilename(originalName),
        category: file.file_kind,
        workspaceId: Number(id),
      });
    },
    [id, router]
  );

  const onWorkspaceSheetBookmarkPress = useCallback(() => {
    Toast.show({
      type: 'info',
      text1: 'View in web',
      text2: 'Open GrabDocs in your browser to open this shared bookmark and its files.',
      visibilityTime: 4500,
    });
  }, []);

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
              const response = await apiService.removeWorkspaceMember(Number(id), selectedMember.id);
              if (response.success) {
                Alert.alert('Success', 'Member removed from workspace');
                invalidateWorkspaceScreenCaches(String(id), Number(id));
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
    filesSheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    filesSheetPanel: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '88%',
      width: '100%',
      paddingTop: 8,
    },
    filesSheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 10,
    },
    filesSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    filesSheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
    filesSheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    filesSheetRowText: { flex: 1 },
    filesSheetRowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    filesSheetRowSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    filesSheetEmpty: { padding: 32, alignItems: 'center' },
    filesSheetEmptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    filesSheetBookmarkCard: { borderBottomWidth: 1, borderBottomColor: colors.border },
    filesSheetBookmarkHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      paddingHorizontal: 16,
      gap: 8,
    },
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

  const isViewer = workspace.user_role === 'viewer';

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

        {/* Action Buttons — hidden for viewers */}
        {!isViewer && (
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
                              userName: getReachParticipantDisplayName(user)
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
              onPress={openWorkspaceFilesSheet}
            >
              <View style={[dynamicStyles.actionIcon, { backgroundColor: '#AF52DE' }]}>
                <Ionicons name="folder-open" size={24} color="#fff" />
              </View>
              <Text style={dynamicStyles.actionText}>View Files</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}

        {/* Team / members — hidden for viewers */}
        {!isViewer && (
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
        )}

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
                      backgroundColor: colors.surface,
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

      {/* Workspace shared files — bottom sheet (only content shared in this workspace) */}
      <Modal
        visible={workspaceFilesSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWorkspaceFilesSheetVisible(false)}
      >
        <View style={dynamicStyles.filesSheetBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setWorkspaceFilesSheetVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View
            style={[dynamicStyles.filesSheetPanel, { paddingBottom: insets.bottom + 16 }]}
          >
            <View style={dynamicStyles.filesSheetHandle} />
            <View style={dynamicStyles.filesSheetHeader}>
              <Text style={dynamicStyles.filesSheetTitle} numberOfLines={1}>
                Files in {workspace.name}
              </Text>
              <TouchableOpacity
                onPress={() => setWorkspaceFilesSheetVisible(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close files list"
              >
                <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {workspaceFilesLoading &&
            workspaceSheetBookmarks.length === 0 &&
            workspaceSheetFiles.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={[dynamicStyles.filesSheetEmptyText, { marginTop: 12 }]}>
                  Loading…
                </Text>
              </View>
            ) : (
              <FlatList
                data={workspaceSheetListItems}
                keyExtractor={(item) =>
                  item.kind === 'bookmark'
                    ? `b-${item.bookmark.bookmark_id}`
                    : `f-${item.file.id}`
                }
                refreshControl={
                  <RefreshControl
                    refreshing={workspaceFilesLoading && !workspaceFilesLoadingMore}
                    onRefresh={() => {
                      screenCache.invalidate(workspaceFilesSheetFirstPageKey(Number(id)));
                      void loadWorkspaceFilesSheet(false);
                    }}
                    tintColor="#007AFF"
                  />
                }
                renderItem={({ item }) => {
                  if (item.kind === 'bookmark') {
                    const { bookmark } = item;
                    const countLabel =
                      bookmark.file_count === 1
                        ? 'Shared bookmark · 1 file'
                        : `Shared bookmark · ${bookmark.file_count} files`;
                    const subLabel = bookmark.is_locked ? `${countLabel} · Locked` : countLabel;
                    return (
                      <View style={dynamicStyles.filesSheetBookmarkCard}>
                        <TouchableOpacity
                          style={dynamicStyles.filesSheetBookmarkHeader}
                          onPress={onWorkspaceSheetBookmarkPress}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={
                            bookmark.is_locked
                              ? `${bookmark.bookmark_name}, locked shared bookmark`
                              : bookmark.bookmark_name
                          }
                          accessibilityHint="Opens a message to use the web app for bookmark contents"
                        >
                          <View style={dynamicStyles.filesSheetRowText}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {bookmark.is_locked ? (
                                <Ionicons
                                  name="lock-closed"
                                  size={18}
                                  color={colors.textSecondary}
                                  accessibilityElementsHidden
                                  importantForAccessibility="no"
                                />
                              ) : null}
                              <Text
                                style={[dynamicStyles.filesSheetRowTitle, { flex: 1 }]}
                                numberOfLines={2}
                              >
                                {bookmark.bookmark_name}
                              </Text>
                            </View>
                            <Text style={dynamicStyles.filesSheetRowSub} numberOfLines={1}>
                              {subLabel}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
                        </TouchableOpacity>
                      </View>
                    );
                  }
                  const f = item.file;
                  const originalName = f.original_filename || f.filename || 'File';
                  return (
                    <TouchableOpacity
                      style={dynamicStyles.filesSheetRow}
                      onPress={() => openFileFromWorkspaceSheet(f)}
                      activeOpacity={0.7}
                    >
                      <View style={dynamicStyles.filesSheetRowText}>
                        <Text style={dynamicStyles.filesSheetRowTitle} numberOfLines={2}>
                          {originalName}
                        </Text>
                        <Text style={dynamicStyles.filesSheetRowSub} numberOfLines={1}>
                          {workspaceStandaloneFileSubtitle(f)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={dynamicStyles.filesSheetEmpty}>
                    <Ionicons name="folder-open-outline" size={48} color={colors.textLight} />
                    <Text style={[dynamicStyles.filesSheetEmptyText, { marginTop: 12 }]}>
                      No files shared in this workspace yet
                    </Text>
                  </View>
                }
                ListFooterComponent={
                  workspaceFilesHasMore ? (
                    <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => void loadMoreWorkspaceFiles()}
                        disabled={workspaceFilesLoadingMore}
                        hitSlop={8}
                      >
                        {workspaceFilesLoadingMore ? (
                          <ActivityIndicator size="small" color="#007AFF" />
                        ) : (
                          <Text style={{ color: '#007AFF', fontWeight: '600', fontSize: 16 }}>
                            Load more
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null
                }
                style={{
                  maxHeight: Math.round(Dimensions.get('window').height * 0.58),
                }}
                contentContainerStyle={
                  workspaceSheetListItems.length === 0 ? { flexGrow: 1 } : { paddingBottom: 8 }
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {viewerFile && (
        <DocumentViewer
          fileId={viewerFile.id}
          fileName={viewerFile.name}
          fileType={viewerFile.type}
          fileCategory={viewerFile.category}
          workspaceId={viewerFile.workspaceId}
          onClose={() => setViewerFile(null)}
        />
      )}

      {workspaceQuickForm && (
        <QuickFormViewer
          formId={workspaceQuickForm.id}
          formName={workspaceQuickForm.name}
          onClose={() => setWorkspaceQuickForm(null)}
        />
      )}

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
