import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Platform,
    RefreshControl,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FRONTEND_URL } from '../../constants/Config';
import { useThemeColors } from '../../hooks/useThemeColors';
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
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const [uploadLinks, setUploadLinks] = useState<UploadLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedLink, setSelectedLink] = useState<UploadLink | null>(null);

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

  // Add debounce to prevent excessive reloads
  const lastLoadTimeRef = useRef<number>(0);
  const RELOAD_DEBOUNCE_MS = 2000; // Don't reload if less than 2 seconds since last load
  
  useFocusEffect(
    useCallback(() => {
      if (user) {
        const now = Date.now();
        if (now - lastLoadTimeRef.current > RELOAD_DEBOUNCE_MS) {
          lastLoadTimeRef.current = now;
          loadUploadLinks();
        }
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

  const getFullUrl = (url: string): string => {
    // Construct full URL if it's just a path
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Ensure the URL starts with / and prepend the frontend URL
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${FRONTEND_URL}${path}`;
  };

  const handleShareLink = async (link: UploadLink) => {
    try {
      const fullUrl = getFullUrl(link.url);
      const message = `Upload files using this link: ${fullUrl}\n\nLink: ${link.name}\n${link.description ? `Description: ${link.description}` : ''}`;
      
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Share.share({
          message,
          url: fullUrl,
          title: `File Request: ${link.name}`,
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
      'Delete File Request',
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

  const handleViewFiles = (link: UploadLink) => {
    router.push(`/upload-links/${link.id}`);
  };

  const openMenu = (link: UploadLink) => {
    setSelectedLink(link);
    setMenuVisible(true);
  };

  const closeMenu = () => {
    setMenuVisible(false);
    setSelectedLink(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
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
      color: colors.textSecondary,
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
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyDescription: {
      fontSize: 16,
      color: colors.textSecondary,
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
      backgroundColor: colors.card,
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
      color: colors.text,
      marginBottom: 4,
    },
    linkDescription: {
      fontSize: 14,
      color: colors.textSecondary,
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
      color: colors.textSecondary,
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
      color: colors.textLight,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuContainer: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 8,
      minWidth: 200,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 8,
    },
    menuItemDanger: {
      marginTop: 4,
    },
    menuItemText: {
      fontSize: 16,
      color: colors.text,
      marginLeft: 12,
    },
    menuItemTextDanger: {
      color: '#FF3B30',
    },
  }), [colors, selectedLink]);

  const renderUploadLink = ({ item }: { item: UploadLink }) => {
    const expired = isExpired(item.expires_at);
    const limitReached = item.max_uploads && item.upload_count >= item.max_uploads;
    
    return (
      <TouchableOpacity
        style={[
          dynamicStyles.linkCard,
          (!item.is_active || expired || limitReached) && dynamicStyles.inactiveLinkCard
        ]}
        onPress={() => handleLinkPress(item)}
      >
        <View style={dynamicStyles.linkHeader}>
          <View style={dynamicStyles.linkInfo}>
            <Text style={dynamicStyles.linkName} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
            {item.description && (
              <Text style={dynamicStyles.linkDescription}>{item.description}</Text>
            )}
          </View>
          <View style={dynamicStyles.linkActions}>
            <TouchableOpacity
              style={dynamicStyles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                openMenu(item);
              }}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={dynamicStyles.linkStats}>
          <View style={dynamicStyles.statItem}>
            <Ionicons name="cloud-upload" size={16} color={colors.textSecondary} />
            <Text style={dynamicStyles.statText}>
              {item.upload_count}{item.max_uploads ? `/${item.max_uploads}` : ''} uploads
            </Text>
          </View>
          <View style={dynamicStyles.statItem}>
            <Ionicons name="time" size={16} color={colors.textSecondary} />
            <Text style={dynamicStyles.statText}>
              {item.expires_at ? 
                `Expires ${formatDate(item.expires_at)}` : 
                'Never expires'
              }
            </Text>
          </View>
        </View>

        {(!item.is_active || expired || limitReached) && (
          <View style={dynamicStyles.statusBadge}>
            <Text style={dynamicStyles.statusText}>
              {!item.is_active ? 'Inactive' : 
               expired ? 'Expired' : 
               'Limit Reached'}
            </Text>
          </View>
        )}

        <Text style={dynamicStyles.createdDate}>
          Created {formatDate(item.created_at)}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={dynamicStyles.title}>File Request</Text>
          <View style={dynamicStyles.placeholder} />
        </View>
        <View style={dynamicStyles.centerContainer}>
          <Text style={dynamicStyles.loadingText}>Loading file requests...</Text>
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
        <Text style={dynamicStyles.title}>File Request</Text>
        <TouchableOpacity onPress={handleCreateLink}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {uploadLinks.length === 0 ? (
        <View style={dynamicStyles.emptyContainer}>
          <Ionicons name="link" size={64} color={colors.textLight} />
          <Text style={dynamicStyles.emptyTitle}>No File Requests</Text>
          <Text style={dynamicStyles.emptyDescription}>
            Create file requests to receive files from others
          </Text>
          <TouchableOpacity style={dynamicStyles.createButton} onPress={handleCreateLink}>
            <Text style={dynamicStyles.createButtonText}>Create Your First File Request</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={uploadLinks}
          renderItem={renderUploadLink}
          keyExtractor={(item) => `upload-link-${item.id}`}
          contentContainerStyle={dynamicStyles.listContainer}
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
