import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
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
  meetingId?: string;
  title: string;
  type: 'recording' | 'transcript' | 'chat_log' | 'shared_files' | 'whiteboard' | 'notes' | 'meeting_report' | 'video' | 'call_transcript' | 'summary' | 'report' | 'chat' | 'meeting_chat' | 'files' | 'meeting_summary';
  date: string;
  duration?: number;
  participants?: string[];
  fileSize?: number;
  downloadUrl?: string;
  summary?: string;
  keywords?: string[];
  status?: 'processing' | 'ready' | 'error';
  thumbnailUrl?: string;
  quality?: 'hd' | 'sd' | 'audio_only';
  size?: string;
  url?: string;
  meeting_id?: string;
  meeting_title?: string;
  // Local file paths from database
  local_recording_path?: string;
  local_file_path?: string;
  local_transcript_path?: string;
  local_chat_path?: string;
  local_report_path?: string;
  original_filename?: string;
}

interface AssetDetail {
  id: string;
  content: string;
  timestamp?: string;
  speaker?: string;
  metadata?: any;
}

interface DateGroup {
  date: string;
  assets: MeetingAsset[];
  isExpanded: boolean;
}

export default function MeetingDetailsScreen() {
  const router = useRouter();
  const { meetingId, meetingTitle, roomCode } = useLocalSearchParams<{
    meetingId: string;
    meetingTitle: string;
    roomCode: string;
  }>();
  
  const [assets, setAssets] = useState<MeetingAsset[]>([]);
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<MeetingAsset | null>(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetDetails, setAssetDetails] = useState<AssetDetail[]>([]);

  useEffect(() => {
    if (meetingId) {
      loadMeetingAssets();
    }
  }, [meetingId]);

  useEffect(() => {
    organizeAssetsByDate();
  }, [assets, searchQuery]);

  const loadMeetingAssets = async () => {
    try {
      setLoading(true);
      
      // Try to get assets for this specific meeting using the meeting ID
      console.log('📁 Loading assets for meeting ID:', meetingId);
      
      // First try the general assets endpoint
      const response = await apiClient.getMeetingAssets();
      if (response.success && response.data) {
        console.log('📁 All assets from backend:', response.data.assets);
        console.log('📁 Asset types found:', response.data.assets?.map((a: any) => a.type));
        console.log('📁 Meeting title filter:', meetingTitle);
        
        // Filter assets for this specific meeting
        console.log('📁 Current meeting ID:', meetingId);
        console.log('📁 Current meeting title:', meetingTitle);
        
        const meetingAssets = (response.data.assets || []).filter((asset: MeetingAsset) => {
          // Check if this asset belongs to the current meeting
          // Priority: meeting_id match, then meetingId match, then title match
          const belongsToMeeting = asset.meeting_id === meetingId || 
                                  asset.meetingId === meetingId ||
                                  (asset.meeting_title === meetingTitle && asset.meeting_id === meetingId);
          
          console.log(`📁 Asset ${asset.id} (${asset.type}): meetingId=${asset.meetingId}, meeting_id=${asset.meeting_id}, meeting_title=${asset.meeting_title}, belongsToMeeting=${belongsToMeeting}`);
          return belongsToMeeting;
        });
        console.log('📁 Filtered assets for meeting:', meetingAssets);
        console.log('📁 Filtered asset types:', meetingAssets.map((a: MeetingAsset) => a.type));
        
        // Check if we have Summary assets
        const hasSummary = meetingAssets.some((asset: MeetingAsset) => 
          asset.type === 'meeting_report' || 
          asset.type === 'summary' || 
          asset.type === 'report' ||
          asset.type === 'meeting_summary'
        );
        
        console.log('📁 Has Summary assets:', hasSummary);
        if (!hasSummary) {
          console.log('📁 No Summary assets found for this meeting');
          console.log('📁 This suggests the backend is not returning Summary assets for this specific meeting');
          console.log('📁 Meeting Summaries are stored in the File table with file_type="meeting_summary" and file_kind="ai_summary"');
          console.log('📁 The backend mobile endpoint may not be querying the File table for these assets');
        }
        
        setAssets(meetingAssets);
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

  const organizeAssetsByDate = () => {
    let filteredAssets = assets;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredAssets = filteredAssets.filter(asset =>
        asset.title.toLowerCase().includes(query) ||
        (asset.summary && asset.summary.toLowerCase().includes(query)) ||
        (asset.keywords && asset.keywords.some(keyword => keyword.toLowerCase().includes(query))) ||
        asset.type.toLowerCase().includes(query)
      );
    }

    // Group assets by date
    const groupedByDate: { [key: string]: MeetingAsset[] } = {};
    
    filteredAssets.forEach(asset => {
      const date = new Date(asset.date).toDateString();
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push(asset);
    });

    // Convert to DateGroup array and sort by date (newest first)
    const groups: DateGroup[] = Object.keys(groupedByDate)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .map(date => ({
        date,
        assets: groupedByDate[date].sort((a, b) => {
          // Sort by date first, then by asset type for consistent ordering
          const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateCompare !== 0) return dateCompare;
          
          // If same date, sort by asset type priority
          const typePriority = {
            'meeting_report': 1,
            'summary': 1,
            'report': 1,
            'meeting_summary': 1,
            'recording': 2,
            'video': 2,
            'transcript': 3,
            'call_transcript': 3,
            'chat_log': 4,
            'chat': 4,
            'meeting_chat': 4
          };
          const aPriority = typePriority[a.type as keyof typeof typePriority] || 5;
          const bPriority = typePriority[b.type as keyof typeof typePriority] || 5;
          return aPriority - bPriority;
        }),
        isExpanded: true // Start with all groups expanded
      }));

    setDateGroups(groups);
  };

  const toggleDateGroup = (date: string) => {
    setDateGroups(prev => 
      prev.map(group => 
        group.date === date 
          ? { ...group, isExpanded: !group.isExpanded }
          : group
      )
    );
  };

  const playRecording = async (asset: MeetingAsset) => {
    try {
      if (!asset.url) {
        Alert.alert('Error', 'No recording URL available');
        return;
      }

      // For now, we'll open the recording URL in the device's default video player
      // In a production app, you might want to use a video player component
      
      const canOpen = await Linking.canOpenURL(asset.url);
      if (canOpen) {
        await Linking.openURL(asset.url);
      } else {
        Alert.alert(
          'Play Recording',
          `Recording: ${asset.title}\n\nURL: ${asset.url}\n\nDuration: ${asset.duration || 'Unknown'}`,
          [
            { text: 'Copy URL', onPress: async () => {
              // Copy to clipboard
              await Clipboard.setStringAsync(asset.url || '');
              Alert.alert('Copied', 'Recording URL copied to clipboard');
            }},
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
    } catch (error) {
      console.error('Play recording error:', error);
      Alert.alert('Error', 'Failed to play recording');
    }
  };

  const openFile = async (asset: MeetingAsset) => {
    try {
      // Use fallback values since config endpoint is not available
      const basePath = 'C:\\llm\\projects\\grabdocs-app\\grabdocs\\manager-francis\\data';
      const username = 'francis';
      console.log('Using fallback values:', { basePath, username });
      
      let localPath = '';
      
      // Get the filename from the asset (should be in format: {file_type}_{video_call_id}_{timestamp}_{uuid}.{ext})
      const filename = asset.title || asset.id || 'unknown';
      
      switch (asset.type) {
        case 'recording':
          // Private recordings: {base_path}/{username}/recordings/
          localPath = `${basePath}/${username}/recordings/${filename}`;
          break;
        case 'transcript':
          // Private transcripts: {base_path}/{username}/transcripts/
          localPath = `${basePath}/${username}/transcripts/${filename}`;
          break;
        case 'meeting_report':
          // Reports stored with transcripts: {base_path}/{username}/transcripts/
          localPath = `${basePath}/${username}/transcripts/${filename}`;
          break;
        case 'chat_log':
          // Shared chat logs: {base_path}/shared_chats/
          localPath = `${basePath}/shared_chats/${filename}`;
          break;
        case 'shared_files':
          // Shared meeting files: {base_path}/shared_meeting_files/
          localPath = `${basePath}/shared_meeting_files/${filename}`;
          break;
        case 'notes':
        case 'whiteboard':
          // These might be stored as shared files or in transcripts
          localPath = `${basePath}/shared_meeting_files/${filename}`;
          break;
        default:
          // Fallback to shared files
          localPath = `${basePath}/shared_meeting_files/${filename}`;
      }

      // If we have a direct local path from the database, use that instead
      if (asset.local_recording_path) {
        localPath = asset.local_recording_path;
        console.log(`📁 Using database local_recording_path: ${localPath}`);
      } else if (asset.local_file_path) {
        localPath = asset.local_file_path;
        console.log(`📁 Using database local_file_path: ${localPath}`);
      } else if (asset.local_transcript_path) {
        localPath = asset.local_transcript_path;
        console.log(`📁 Using database local_transcript_path: ${localPath}`);
      } else if (asset.local_chat_path) {
        localPath = asset.local_chat_path;
        console.log(`📁 Using database local_chat_path: ${localPath}`);
      } else if (asset.local_report_path) {
        localPath = asset.local_report_path;
        console.log(`📁 Using database local_report_path: ${localPath}`);
      } else {
        console.log(`📁 No local paths found, using constructed path: ${localPath}`);
        // Don't use asset.url as it's likely a cloud URL
      }

      if (!localPath) {
        Alert.alert('Error', 'No file path available for this asset');
        return;
      }

      // Check if this is a cloud URL (not a local path)
      if (localPath.startsWith('http://') || localPath.startsWith('https://') || localPath.startsWith('gcp-')) {
        Alert.alert(
          'Cloud URL Detected',
          `This file is stored in the cloud and cannot be opened locally.\n\nURL: ${localPath}\n\nPlease contact support to download the file locally.`,
          [
            { text: 'Copy URL', onPress: async () => {
              await Clipboard.setStringAsync(localPath);
              Alert.alert('Copied', 'Cloud URL copied to clipboard');
            }},
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        return;
      }

      console.log(`🔍 Opening file: ${localPath} for asset type: ${asset.type}`);
      console.log(`📁 Asset details:`, {
        title: asset.title,
        type: asset.type,
        id: asset.id,
        filename: filename,
        url: asset.url,
        local_recording_path: asset.local_recording_path,
        local_file_path: asset.local_file_path
      });

      // Try to open the file in the device's default app
      const canOpen = await Linking.canOpenURL(localPath);
      if (canOpen) {
        await Linking.openURL(localPath);
      } else {
        // If we can't open the file directly, show file info
        Alert.alert(
          'View File',
          `File: ${asset.title}\n\nType: ${asset.type}\nPath: ${localPath}\nSize: ${asset.size || 'Unknown'}`,
          [
            { text: 'Copy Path', onPress: async () => {
              // Copy to clipboard
              await Clipboard.setStringAsync(localPath);
              Alert.alert('Copied', 'File path copied to clipboard');
            }},
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
    } catch (error) {
      console.error('Open file error:', error);
      Alert.alert('Error', 'Failed to open file');
    }
  };

  const viewAsset = async (asset: MeetingAsset) => {
    setSelectedAsset(asset);
    setShowAssetModal(true);
    
    try {
      let details: AssetDetail[] = [];
      
      switch (asset.type) {
        case 'transcript':
        case 'call_transcript':
          // For transcripts, try to open the file directly or show content
          if (asset.local_transcript_path || asset.local_file_path || asset.url) {
            await openFile(asset);
            return; // Don't show modal for file viewing
          } else {
            const transcriptResponse = await apiClient.getMeetingTranscript(asset.meetingId || asset.id);
            if (transcriptResponse.success && transcriptResponse.data) {
              details = transcriptResponse.data.transcript || [];
            }
          }
          break;
        case 'chat_log':
        case 'chat':
        case 'meeting_chat':
          const chatResponse = await apiClient.getMeetingChat(asset.meetingId || asset.id);
          if (chatResponse.success && chatResponse.data) {
            details = chatResponse.data.messages || [];
          }
          break;
        case 'recording':
        case 'video':
          // For recordings, we'll handle playback directly
          await playRecording(asset);
          return; // Don't show modal for recordings
        case 'meeting_report':
        case 'summary':
        case 'report':
        case 'meeting_summary':
          // For Summary assets, show content in modal instead of trying to open file
          if (asset.type === 'meeting_summary') {
            // Show summary content in modal
            details = [{
              id: '1',
              content: `Summary: ${asset.title}\n\nThis is a meeting summary generated by AI. The content is stored on the server and can be viewed through the web interface.\n\nFile: ${asset.original_filename || 'Unknown'}\nDate: ${formatDate(asset.date)}`,
              timestamp: asset.date,
              speaker: 'AI Summary'
            }];
          } else {
            // For other file types, try to open them directly
            if (asset.local_file_path || asset.local_report_path || asset.url) {
              await openFile(asset);
              return; // Don't show modal for file viewing
            }
          }
          break;
        case 'shared_files':
        case 'files':
        case 'whiteboard':
        case 'notes':
          // For other file types, try to open them directly
          if (asset.local_file_path || asset.local_report_path || asset.url) {
            await openFile(asset);
            return; // Don't show modal for file viewing
          }
          break;
        default:
          details = [{
            id: '1',
            content: `Asset: ${asset.title}\nType: ${asset.type}\nDate: ${asset.date}`,
            timestamp: asset.date,
            speaker: 'System'
          }];
      }
      
      setAssetDetails(details);
    } catch (error) {
      console.error('Failed to load asset details:', error);
      setAssetDetails([]);
    }
  };

  const downloadAsset = async (asset: MeetingAsset) => {
    try {
      Alert.alert('Download', `Downloading ${asset.title}...`);
      
      const downloadInfo = await apiClient.downloadMeetingAsset(
        asset.meetingId || asset.id, 
        asset.type
      );
      
      if (downloadInfo.url) {
        Alert.alert('Download Ready', `Download URL: ${downloadInfo.url}`);
      }
    } catch (error) {
      console.error('Download failed:', error);
      Alert.alert('Error', 'Failed to download asset');
    }
  };

  const shareAsset = async (asset: MeetingAsset) => {
    try {
      Alert.alert('Share', `Sharing ${asset.title}...`);
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
      case 'meeting_summary': return 'sparkles';
      case 'meeting_report': return 'analytics';
      case 'summary': return 'sparkles';
      case 'report': return 'analytics';
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
      case 'meeting_summary': return '#FF6B35';
      case 'meeting_report': return '#5AC8FA';
      case 'summary': return '#FF6B35';
      case 'report': return '#5AC8FA';
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

  const formatGroupDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (date.toDateString() === today.toDateString()) {
        return 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      } else {
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });
      }
    } catch {
      return 'Unknown date';
    }
  };

  const getAssetDisplayTitle = (asset: MeetingAsset) => {
    // Use simple, consistent naming like the web version
    switch (asset.type) {
      case 'transcript':
      case 'call_transcript':
        return 'Call Transcript';
      case 'meeting_report':
      case 'summary':
      case 'report':
      case 'meeting_summary':
        return 'Summary';
      case 'recording':
      case 'video':
        return 'Video';
      case 'chat_log':
      case 'chat':
      case 'meeting_chat':
        return 'Meeting Chat Export';
      case 'shared_files':
      case 'files':
        return 'Shared Files';
      case 'whiteboard':
        return 'Whiteboard';
      case 'notes':
        return 'Notes';
      default:
        console.log('📁 Unknown asset type:', asset.type);
        return String(asset.type).charAt(0).toUpperCase() + String(asset.type).slice(1);
    }
  };

  const renderAssetItem = ({ item }: { item: MeetingAsset }) => (
    <TouchableOpacity style={styles.assetItem} onPress={() => viewAsset(item)}>
      <View style={[styles.assetIcon, { backgroundColor: `${getAssetColor(item.type)}20` }]}>
        <Ionicons name={getAssetIcon(item.type) as any} size={20} color={getAssetColor(item.type)} />
      </View>
      <View style={styles.assetContent}>
        <Text style={styles.assetTitle} numberOfLines={2}>{getAssetDisplayTitle(item)}</Text>
        <Text style={styles.assetType}>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
        <View style={styles.assetDetails}>
          <Text style={styles.assetDate}>{formatDate(item.date)}</Text>
          {item.size && <Text style={styles.assetSize}>• {item.size}</Text>}
        </View>
      </View>
      <TouchableOpacity style={styles.moreButton}>
        <Ionicons name="ellipsis-vertical" size={16} color="#666" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderDateGroup = ({ item }: { item: DateGroup }) => (
    <View style={styles.dateGroup}>
      <TouchableOpacity 
        style={styles.dateGroupHeader} 
        onPress={() => toggleDateGroup(item.date)}
      >
        <View style={styles.dateGroupInfo}>
          <Text style={styles.dateGroupTitle}>{formatGroupDate(item.date)}</Text>
          <Text style={styles.dateGroupCount}>{item.assets.length} assets</Text>
        </View>
        <Ionicons 
          name={item.isExpanded ? "chevron-up" : "chevron-down"} 
          size={20} 
          color="#666" 
        />
      </TouchableOpacity>
      
      {item.isExpanded && (
        <View style={styles.dateGroupContent}>
          {item.assets.map((asset) => (
            <View key={asset.id} style={styles.assetWrapper}>
              {renderAssetItem({ item: asset })}
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {meetingTitle || 'Meeting Details'}
          </Text>
          <Text style={styles.headerSubtitle}>Room: {roomCode}</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={loadMeetingAssets}>
          <Ionicons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search assets..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Assets List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading meeting assets...</Text>
        </View>
      ) : (
        <FlatList
          data={dateGroups}
          renderItem={renderDateGroup}
          keyExtractor={(item) => item.date}
          style={styles.assetsList}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMeetingAssets} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'No assets match your search' : 'No assets for this meeting'}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchQuery 
                  ? 'Try adjusting your search terms' 
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
                  <Text style={styles.assetTitleLarge}>{getAssetDisplayTitle(selectedAsset)}</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  refreshButton: {
    padding: 4,
    marginLeft: 8,
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
  assetsList: {
    flex: 1,
  },
  dateGroup: {
    marginBottom: 8,
  },
  dateGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateGroupInfo: {
    flex: 1,
  },
  dateGroupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  dateGroupCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  dateGroupContent: {
    backgroundColor: '#fff',
  },
  assetWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
