import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
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

export default function WorkspacesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadWorkspaces = async () => {
    if (!user) return;
    
    try {
      const response = await apiService.getMobileWorkspaces();
      if (response.success) {
        setWorkspaces(response.workspaces || []);
      } else {
        Alert.alert('Error', response.message || 'Failed to load workspaces');
      }
    } catch (error: any) {
      console.error('Load workspaces error:', error);
      Alert.alert('Error', error.message || 'Failed to load workspaces');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadWorkspaces();
      }
    }, [user])
  );

  const handleRefresh = () => {
    if (!user) return;
    setRefreshing(true);
    loadWorkspaces();
  };

  const handleDeleteWorkspace = (workspace: Workspace) => {
    Alert.alert(
      'Delete Workspace',
      `Are you sure you want to delete "${workspace.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiService.deleteWorkspace(workspace.id);
              if (response.success) {
                Alert.alert('Success', 'Workspace deleted successfully');
                loadWorkspaces();
              } else {
                Alert.alert('Error', response.message || 'Failed to delete workspace');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete workspace');
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (workspace: Workspace) => {
    try {
      const response = await apiService.updateWorkspace(workspace.id, {
        is_active: !workspace.is_active
      });
      if (response.success) {
        loadWorkspaces();
      } else {
        Alert.alert('Error', response.message || 'Failed to update workspace');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update workspace');
    }
  };

  const handleLinkPress = (workspace: Workspace) => {
    // Check if workspace is inactive
    if (!workspace.is_active) {
      Alert.alert(
        'Workspace Inactive',
        'This workspace is currently paused and cannot be accessed. Contact the workspace owner to activate it.',
        [
          { text: 'OK' }
        ]
      );
      return;
    }
    
    router.push(`/workspaces/${workspace.id}`);
  };

  const renderWorkspaceItem = ({ item: workspace }: { item: Workspace }) => (
    <TouchableOpacity
      style={styles.workspaceCard}
      onPress={() => handleLinkPress(workspace)}
    >
      <View style={styles.workspaceHeader}>
        <View style={styles.workspaceInfo}>
          <Text style={styles.workspaceName}>{workspace.name}</Text>
          {workspace.description && (
            <Text style={styles.workspaceDescription}>{workspace.description}</Text>
          )}
          <View style={styles.workspaceMeta}>
            <View style={styles.roleContainer}>
              <Ionicons 
                name={workspace.user_role === 'owner' ? 'star' : 
                      workspace.user_role === 'admin' ? 'shield' : 
                      workspace.user_role === 'member' ? 'person' : 'eye'} 
                size={14} 
                color="#666" 
              />
              <Text style={styles.roleText}>{workspace.user_role}</Text>
            </View>
            <Text style={styles.memberCount}>
              {workspace.member_count} member{workspace.member_count !== 1 ? 's' : ''}
            </Text>
            {!workspace.is_active && (
              <View style={styles.inactiveTag}>
                <Text style={styles.inactiveText}>Inactive</Text>
              </View>
            )}
          </View>
        </View>
        
        {workspace.can_manage && (
          <View style={styles.workspaceActions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: workspace.is_active ? '#FF6B6B' : '#4ECDC4' }]}
              onPress={() => handleToggleActive(workspace)}
            >
              <Ionicons 
                name={workspace.is_active ? 'pause' : 'play'} 
                size={16} 
                color="#fff" 
              />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#FF6B6B' }]}
              onPress={() => handleDeleteWorkspace(workspace)}
            >
              <Ionicons name="trash" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="business" size={64} color="#ccc" />
      <Text style={styles.emptyStateTitle}>No Workspaces</Text>
      <Text style={styles.emptyStateText}>
        You don't belong to any workspaces yet. Create one to get started!
      </Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => router.push('/workspaces/create')}
      >
        <Text style={styles.createButtonText}>Create Workspace</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Team Workspace</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text>Loading workspaces...</Text>
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
        <Text style={styles.headerTitle}>Team Workspace</Text>
        <TouchableOpacity onPress={() => router.push('/workspaces/create')}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={workspaces}
        renderItem={renderWorkspaceItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={workspaces.length === 0 ? styles.emptyContainer : styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
  },
  workspaceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  workspaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  workspaceInfo: {
    flex: 1,
    marginRight: 12,
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  workspaceDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  workspaceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
    textTransform: 'capitalize',
  },
  memberCount: {
    fontSize: 12,
    color: '#666',
  },
  inactiveTag: {
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inactiveText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  workspaceActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 