import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Alert,
    FlatList,
    Platform,
    RefreshControl,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';
import { useAuth } from '../context/auth';

interface UploadLink {
  id: number;
  name: string;
  description?: string;
  token: string;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
  upload_count: number;
  max_uploads?: number;
  url: string;
}

export default function UploadLinksScreen() {
  const { user } = useAuth();
  const [uploadLinks, setUploadLinks] = useState<UploadLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadUploadLinks = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await apiService.getUploadLinks();
      if (response.success) {
        setUploadLinks(response.upload_links || []);
      } else {
        console.error('Get upload links error:', response.message || 'Failed to load upload links');
        Alert.alert('Error', response.message || 'Failed to load upload links');
      }
    } catch (error: any) {
      console.error('Load upload links error:', error);
      Alert.alert('Error', error.message || 'Failed to load upload links');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadUploadLinks();
      }
    }, [user])
  );

  const handleRefresh = () => {
    if (!user) return;
    setRefreshing(true);
    loadUploadLinks();
  };

  const handleCreateLink = () => {
    router.push('/upload-links/create');
  };

  const handleLinkPress = (link: UploadLink) => {
    router.push(`/upload-links/${link.id}`);
  };

  const handleShareLink = async (link: UploadLink) => {
    try {
      const message = `Upload files using this link: ${link.url}\n\nLink: ${link.name}\n${link.description ? `Description: ${link.description}` : ''}`;
      
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Share.share({
          message,
          url: link.url,
          title: `Upload Link: ${link.name}`,
        });
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleToggleActive = async (link: UploadLink) => {
    try {
      const response = await apiService.updateUploadLink(link.id, {
        is_active: !link.is_active
      });
      
      if (response.success) {
        setUploadLinks(prev => 
          prev.map(l => 
            l.id === link.id ? { ...l, is_active: !l.is_active } : l
          )
        );
      } else {
        Alert.alert('Error', response.message || 'Failed to update link');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update link');
    }
  };

  const handleDeleteLink = (link: UploadLink) => {
    Alert.alert(
      'Delete Upload Link',
      `Are you sure you want to delete "${link.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiService.deleteUploadLink(link.id);
              if (response.success) {
                setUploadLinks(prev => prev.filter(l => l.id !== link.id));
              } else {
                Alert.alert('Error', response.message || 'Failed to delete link');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete link');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const renderUploadLink = ({ item }: { item: UploadLink }) => {
    const expired = isExpired(item.expires_at);
    const limitReached = item.max_uploads && item.upload_count >= item.max_uploads;
    
    return (
      <TouchableOpacity
        style={[
          styles.linkCard,
          (!item.is_active || expired || limitReached) && styles.inactiveLinkCard
        ]}
        onPress={() => handleLinkPress(item)}
      >
        <View style={styles.linkHeader}>
          <View style={styles.linkInfo}>
            <Text style={styles.linkName}>{item.name}</Text>
            {item.description && (
              <Text style={styles.linkDescription}>{item.description}</Text>
            )}
          </View>
          <View style={styles.linkActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleShareLink(item)}
            >
              <Ionicons name="share" size={20} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleToggleActive(item)}
            >
              <Ionicons 
                name={item.is_active ? "pause" : "play"} 
                size={20} 
                color={item.is_active ? "#FF9500" : "#34C759"} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDeleteLink(item)}
            >
              <Ionicons name="trash" size={20} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.linkStats}>
          <View style={styles.statItem}>
            <Ionicons name="cloud-upload" size={16} color="#666" />
            <Text style={styles.statText}>
              {item.upload_count}{item.max_uploads ? `/${item.max_uploads}` : ''} uploads
            </Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time" size={16} color="#666" />
            <Text style={styles.statText}>
              {item.expires_at ? 
                `Expires ${formatDate(item.expires_at)}` : 
                'Never expires'
              }
            </Text>
          </View>
        </View>

        {(!item.is_active || expired || limitReached) && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {!item.is_active ? 'Inactive' : 
               expired ? 'Expired' : 
               'Limit Reached'}
            </Text>
          </View>
        )}

        <Text style={styles.createdDate}>
          Created {formatDate(item.created_at)}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Upload Links</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading upload links...</Text>
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
        <Text style={styles.title}>Upload Links</Text>
        <TouchableOpacity onPress={handleCreateLink}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {uploadLinks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="link" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No Upload Links</Text>
          <Text style={styles.emptyDescription}>
            Create upload links to receive files from others
          </Text>
          <TouchableOpacity style={styles.createButton} onPress={handleCreateLink}>
            <Text style={styles.createButtonText}>Create Your First Link</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={uploadLinks}
          renderItem={renderUploadLink}
          keyExtractor={(item) => `upload-link-${item.id}`}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#007AFF"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
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
  listContainer: {
    padding: 16,
  },
  linkCard: {
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
  inactiveLinkCard: {
    opacity: 0.6,
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  linkInfo: {
    flex: 1,
    marginRight: 12,
  },
  linkName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  linkDescription: {
    fontSize: 14,
    color: '#666',
  },
  linkActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  linkStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  createdDate: {
    fontSize: 12,
    color: '#999',
  },
}); 