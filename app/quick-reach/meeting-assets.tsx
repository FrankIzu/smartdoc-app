import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../services/api';

interface MeetingAsset {
  id: string;
  meetingId?: string; // Optional since backend uses meeting_id
  title: string;
  type: 'recording' | 'transcript' | 'chat_log' | 'shared_files' | 'whiteboard' | 'notes';
  date: string;
  duration?: number;
  participants?: string[]; // Optional since backend doesn't provide this
  fileSize?: number;
  downloadUrl?: string;
  summary?: string; // Optional since backend doesn't provide this
  keywords?: string[]; // Optional since backend doesn't provide this
  status?: 'processing' | 'ready' | 'error'; // Optional since backend doesn't provide this
  thumbnailUrl?: string;
  quality?: 'hd' | 'sd' | 'audio_only';
  // Backend-specific properties
  size?: string;
  url?: string;
  meeting_id?: string;
  meeting_title?: string;
}

interface AssetDetail {
  id: string;
  content: string;
  timestamp?: string;
  speaker?: string;
  metadata?: any;
}

export default function MeetingAssetsScreen() {
  const router = useRouter();
  const [assets, setAssets] = useState<MeetingAsset[]>([]);
  const [filteredAssets, setFilteredAssets] = useState<MeetingAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<MeetingAsset | null>(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetDetails, setAssetDetails] = useState<AssetDetail[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'recordings' | 'transcripts' | 'files' | 'recent'>('all');

  useEffect(() => {
    loadMeetingAssets();
  }, []);

  useEffect(() => {
    filterAssets();
  }, [searchQuery, activeFilter, assets]);

  const loadMeetingAssets = async () => {
    try {
      setLoading(true);
      
      // Load meeting assets from API
      const response = await apiClient.getMeetingAssets();
      if (response.success && response.data) {
        setAssets(response.data.assets || []);
      } else {
        console.warn('No meeting assets data returned');
        setAssets([]);
      }
    } catch (error) {
      console.error('Failed to load meeting assets:', error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAssets = () => {
    let filtered = assets;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(asset =>
        asset.title.toLowerCase().includes(query) ||
        (asset.summary && asset.summary.toLowerCase().includes(query)) ||
        (asset.keywords && asset.keywords.some(keyword => keyword.toLowerCase().includes(query))) ||
        (asset.meetingId && asset.meetingId.includes(query))
      );
    }

    // Apply type filter
    switch (activeFilter) {
      case 'recordings':
        filtered = filtered.filter(asset => asset.type === 'recording');
        break;
      case 'transcripts':
        filtered = filtered.filter(asset => asset.type === 'transcript');
        break;
      case 'files':
        filtered = filtered.filter(asset => 
          asset.type === 'shared_files' || asset.type === 'whiteboard' || asset.type === 'notes'
        );
        break;
      case 'recent':
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        filtered = filtered.filter(asset => 
          new Date(asset.date) > oneWeekAgo
        );
        break;
      default:
        break;
    }

    setFilteredAssets(filtered);
  };

  const viewAsset = async (asset: MeetingAsset) => {
    setSelectedAsset(asset);
    setShowAssetModal(true);
    
    try {
      // Load detailed asset content from backend
      const response = await apiClient.getMeetingAssetDetails(asset.id);
      if (response.success && response.data?.details) {
        setAssetDetails(response.data.details);
      } else {
        console.warn('No asset details returned');
        setAssetDetails([]);
      }
    } catch (error) {
      console.error('Failed to load asset details:', error);
      setAssetDetails([]);
    }
  };

  const downloadAsset = async (asset: MeetingAsset) => {
    try {
      Alert.alert('Download', `Downloading ${asset.title}...`);
      // In a real implementation, this would handle the download
    } catch (error) {
      Alert.alert('Error', 'Failed to download asset');
    }
  };

  const shareAsset = async (asset: MeetingAsset) => {
    try {
      Alert.alert('Share', `Sharing ${asset.title}...`);
      // In a real implementation, this would handle sharing
    } catch (error) {
      Alert.alert('Error', 'Failed to share asset');
    }
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'recording': return 'videocam';
      case 'transcript': return 'document-text';
      case 'chat_log': return 'chatbubbles';
      case 'shared_files': return 'folder';
      case 'whiteboard': return 'color-palette';
      case 'notes': return 'document';
      default: return 'document';
    }
  };

  const getAssetColor = (type: string) => {
    switch (type) {
      case 'recording': return '#FF3B30';
      case 'transcript': return '#007AFF';
      case 'chat_log': return '#34C759';
      case 'shared_files': return '#FF9500';
      case 'whiteboard': return '#AF52DE';
      case 'notes': return '#5856D6';
      default: return '#8E8E93';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Unknown date';
    }
  };

  const renderAssetItem = ({ item }: { item: MeetingAsset }) => (
    <TouchableOpacity style={styles.assetItem} onPress={() => viewAsset(item)}>
      <View style={[styles.assetIcon, { backgroundColor: `${getAssetColor(item.type)}20` }]}>
        <Ionicons name={getAssetIcon(item.type) as any} size={24} color={getAssetColor(item.type)} />
      </View>
      <View style={styles.assetContent}>
        <Text style={styles.assetTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.assetType}>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
        <View style={styles.assetDetails}>
          <Text style={styles.assetDate}>{formatDate(item.date)}</Text>
          {item.size && <Text style={styles.assetSize}>• {item.size}</Text>}
        </View>
      </View>
      <TouchableOpacity style={styles.moreButton}>
        <Ionicons name="ellipsis-vertical" size={20} color="#666" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderFilterButton = (filter: string, label: string) => (
    <TouchableOpacity
      style={[styles.filterButton, activeFilter === filter && styles.activeFilterButton]}
      onPress={() => setActiveFilter(filter as any)}
    >
      <Text style={[styles.filterButtonText, activeFilter === filter && styles.activeFilterButtonText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meeting Assets</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadMeetingAssets}>
          <Ionicons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search meeting assets..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Buttons */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { key: 'all', label: 'All' },
            { key: 'recordings', label: 'Recordings' },
            { key: 'transcripts', label: 'Transcripts' },
            { key: 'files', label: 'Files' },
            { key: 'recent', label: 'Recent' }
          ]}
          renderItem={({ item }) => renderFilterButton(item.key, item.label)}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {/* Assets List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading meeting assets...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAssets}
          renderItem={renderAssetItem}
          keyExtractor={(item) => item.id}
          style={styles.assetsList}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMeetingAssets} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'No assets match your search' : 'No meeting assets yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchQuery 
                  ? 'Try adjusting your search terms or filters' 
                  : 'Meeting recordings and transcripts will appear here'
                }
              </Text>
            </View>
          }
        />
      )}

      {/* Asset Details Modal */}
      <Modal
        visible={showAssetModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAssetModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAssetModal(false)}>
              <Text style={styles.modalCloseButton}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Asset Details</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => downloadAsset(selectedAsset!)}>
                <Ionicons name="download" size={24} color="#007AFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => shareAsset(selectedAsset!)}>
                <Ionicons name="share" size={24} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>
          
          {selectedAsset && (
            <View style={styles.modalContent}>
              <View style={styles.assetOverview}>
                <View style={[styles.assetIconLarge, { backgroundColor: `${getAssetColor(selectedAsset.type)}20` }]}>
                  <Ionicons name={getAssetIcon(selectedAsset.type) as any} size={32} color={getAssetColor(selectedAsset.type)} />
                </View>
                <View style={styles.assetInfo}>
                  <Text style={styles.assetTitleLarge}>{selectedAsset.title}</Text>
                  <Text style={styles.assetTypeLarge}>{selectedAsset.type.charAt(0).toUpperCase() + selectedAsset.type.slice(1)}</Text>
                  <View style={styles.assetMeta}>
                    <Text style={styles.assetDateLarge}>{formatDate(selectedAsset.date)}</Text>
                    {selectedAsset.size && <Text style={styles.assetSizeLarge}>• {selectedAsset.size}</Text>}
                  </View>
                </View>
              </View>
              
              {selectedAsset.meeting_title && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Meeting</Text>
                  <Text style={styles.detailValue}>{selectedAsset.meeting_title}</Text>
                </View>
              )}
              
              {selectedAsset.url && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>URL</Text>
                  <Text style={styles.detailValue} numberOfLines={2}>{selectedAsset.url}</Text>
                </View>
              )}
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  refreshButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },
  filtersContainer: {
    marginBottom: 12,
  },
  filtersContent: {
    paddingHorizontal: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  activeFilterButton: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeFilterButtonText: {
    color: '#fff',
  },
  assetsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  assetIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  assetContent: {
    flex: 1,
  },
  assetTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 4,
  },
  assetType: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  assetDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assetDate: {
    fontSize: 12,
    color: '#999',
  },
  assetSize: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
  moreButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCloseButton: {
    fontSize: 16,
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 16,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  assetOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  assetIconLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  assetInfo: {
    flex: 1,
  },
  assetTitleLarge: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  assetTypeLarge: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  assetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assetDateLarge: {
    fontSize: 14,
    color: '#999',
  },
  assetSizeLarge: {
    fontSize: 14,
    color: '#999',
    marginLeft: 4,
  },
  detailSection: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#000',
  },
});
