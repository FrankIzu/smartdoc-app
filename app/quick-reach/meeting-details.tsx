import { Ionicons } from '@expo/vector-icons';
import { Audio, ResizeMode, Video } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import DocumentViewer from '../../components/DocumentViewer';
import { API_BASE_URL } from '../../constants/Config';
import { useThemeColors } from '../../hooks/useThemeColors';
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
  // File ID for DocumentViewer
  file_id?: number | string;
  // Session information
  video_call_id?: string | number;
  session_number?: number;
}

interface AssetDetail {
  id: string;
  content: string;
  timestamp?: string;
  speaker?: string;
  metadata?: any;
}

interface SessionGroup {
  sessionId: string;
  sessionNumber?: number;
  sessionTitle?: string;
  date: string;
  assets: MeetingAsset[];
  isExpanded: boolean;
}

export default function MeetingDetailsScreen() {
  const router = useRouter();
  const themeColors = useThemeColors();
  const { meetingId, meetingTitle, roomCode } = useLocalSearchParams<{
    meetingId: string;
    meetingTitle: string;
    roomCode: string;
  }>();
  
  const [assets, setAssets] = useState<MeetingAsset[]>([]);
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<MeetingAsset | null>(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetDetails, setAssetDetails] = useState<AssetDetail[]>([]);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [selectedFileForViewing, setSelectedFileForViewing] = useState<{fileId: string; fileName: string; fileType: string; fileCategory?: string} | null>(null);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [videoRef, setVideoRef] = useState<Video | null>(null);
  const [menuAsset, setMenuAsset] = useState<MeetingAsset | null>(null);

  useEffect(() => {
    if (meetingId) {
      loadMeetingAssets();
    }
  }, [meetingId]);

  useEffect(() => {
    organizeAssetsBySession();
  }, [assets, searchQuery]);

  useEffect(() => {
    // Cleanup video when component unmounts
    return () => {
      if (videoRef) {
        videoRef.unloadAsync().catch(console.error);
      }
    };
  }, [videoRef]);

  const loadMeetingAssets = async () => {
    try {
      setLoading(true);
      
      // Try to get assets for this specific meeting using the meeting ID
      console.log('📁 Loading assets for meeting ID:', meetingId);
      
      // First try the general assets endpoint
      const response = await apiClient.getMeetingAssets();
      if (response.success && response.data) {
        // Handle both response structures: data.assets or data.meetings
        let allAssets: MeetingAsset[] = [];
        
        if (response.data.assets && Array.isArray(response.data.assets)) {
          // Direct assets array - map to ensure file_id is properly extracted
          allAssets = response.data.assets.map((asset: any, index: number) => {
            // Try to find the actual file ID (numeric ID from backend)
            // Check multiple possible property names, but prioritize file_id/fileId
            const fileId = asset.file_id || asset.fileId || asset.file_id_num || 
                          (typeof asset.id === 'number' ? asset.id : null) ||
                          (typeof asset.id === 'string' && /^\d+$/.test(asset.id.trim()) ? parseInt(asset.id.trim(), 10) : null);
            
            // Generate a unique React key/id that's different from file_id
            const reactId = asset.id || (fileId ? `asset_${fileId}` : `asset_${asset.type}_${index}_${Date.now()}`);
            
            if (index < 3) {
              console.log(`📁 Asset ${index} mapping:`, {
                original_id: asset.id,
                file_id: asset.file_id,
                fileId: asset.fileId,
                extracted_file_id: fileId,
                react_id: reactId,
                type: asset.type,
                allKeys: Object.keys(asset)
              });
            }
            
            return {
              ...asset,
              file_id: fileId || undefined, // Only set if we found a valid file ID
              id: reactId, // Use separate id for React keys
            };
          });
          console.log('📁 Found assets array with', allAssets.length, 'assets');
        } else if (response.data.meetings && Array.isArray(response.data.meetings)) {
          // Assets nested in meetings array - flatten them
          console.log('📁 Found meetings array with', response.data.meetings.length, 'meetings');
          
          // First, try to find the matching meeting to understand its structure
          const currentTitleNormalized = (meetingTitle || '').toLowerCase().trim();
          const currentIdNormalized = (meetingId || '').toString();
          
          let matchingMeeting: any = null;
          response.data.meetings.forEach((meeting: any, index: number) => {
            const dbId = meeting.id || meeting.meeting_id;
            const dbTitle = (meeting.title || meeting.meeting_title || '').toLowerCase().trim();
            const hmsMeetingId = meeting.meetingId || meeting.hms_meeting_id;
            
            // Check if this meeting matches
            const idMatch = dbId?.toString() === currentIdNormalized || 
                          hmsMeetingId?.toString() === currentIdNormalized;
            const titleMatch = dbTitle === currentTitleNormalized;
            
            if (idMatch || titleMatch) {
              matchingMeeting = meeting;
              console.log(`📁 Found matching meeting at index ${index}:`, {
                dbId,
                hmsMeetingId,
                title: meeting.title || meeting.meeting_title,
                idMatch,
                titleMatch
              });
            }
            
            console.log(`📁 Meeting ${index} full object keys:`, Object.keys(meeting));
            console.log(`📁 Meeting ${index} structure:`, {
              id: dbId,
              hmsMeetingId: hmsMeetingId,
              title: meeting.title || meeting.meeting_title,
              hasAssets: !!meeting.assets,
              assetsCount: meeting.assets?.length || 0,
              hasFiles: !!meeting.files,
              filesCount: meeting.files?.length || 0,
              allKeys: Object.keys(meeting)
            });
            
            // Check if assets are in a different property
            if (meeting.assets && Array.isArray(meeting.assets)) {
              // Map assets to ensure file_id is properly extracted
              const mappedAssets = meeting.assets.map((asset: any, assetIndex: number) => {
                // Try to find the actual file ID (numeric ID from backend)
                const fileId = asset.file_id || asset.fileId || asset.file_id_num || 
                              (typeof asset.id === 'number' ? asset.id : null) ||
                              (typeof asset.id === 'string' && /^\d+$/.test(asset.id.trim()) ? parseInt(asset.id.trim(), 10) : null);
                
                // Generate a unique React key/id
                const reactId = asset.id || (fileId ? `asset_${fileId}` : `asset_${asset.type}_${assetIndex}_${Date.now()}`);
                
                return {
                  ...asset,
                  file_id: fileId || undefined, // Only set if we found a valid file ID
                  id: reactId, // Use separate id for React keys
                };
              });
              allAssets = allAssets.concat(mappedAssets);
            } else if (meeting.files && Array.isArray(meeting.files)) {
              // Maybe assets are called "files"?
              const mappedFiles = meeting.files.map((file: any, fileIndex: number) => {
                const fileId = file.file_id || file.fileId || file.file_id_num || 
                              (typeof file.id === 'number' ? file.id : null) ||
                              (typeof file.id === 'string' && /^\d+$/.test(file.id.trim()) ? parseInt(file.id.trim(), 10) : null);
                
                const reactId = file.id || (fileId ? `file_${fileId}` : `file_${file.type || 'file'}_${fileIndex}_${Date.now()}`);
                
                return {
                  ...file,
                  file_id: fileId || undefined,
                  id: reactId,
                };
              });
              allAssets = allAssets.concat(mappedFiles);
            }
          });
          
          console.log('📁 Flattened', allAssets.length, 'assets from meetings');
          
          // If no assets found, log a sample meeting and the matching meeting to debug
          if (allAssets.length === 0 && response.data.meetings.length > 0) {
            console.log('📁 Sample meeting object (first meeting):', JSON.stringify(response.data.meetings[0], null, 2));
            if (matchingMeeting) {
              console.log('📁 Matching meeting full object:', JSON.stringify(matchingMeeting, null, 2));
            } else {
              console.log('📁 No matching meeting found in the array - this might be why assets are empty');
            }
          }
        }
        
        console.log('📁 All assets from backend:', allAssets);
        console.log('📁 Asset types found:', allAssets.map((a: any) => a.type));
        
        // Log sample asset to see actual structure
        if (allAssets.length > 0) {
          console.log('📁 Sample asset (first one):', JSON.stringify(allAssets[0], null, 2));
        }
        console.log('📁 Meeting title filter:', meetingTitle);
        console.log('📁 Current meeting ID:', meetingId);
        console.log('📁 Current meeting title:', meetingTitle);
        
        // Filter assets for this specific meeting
        // Note: meetingId might be HMS meeting ID (like 85506248) while backend uses database ID
        // So we need to match by both ID and title
        const meetingAssets = allAssets.filter((asset: MeetingAsset) => {
          // Check if this asset belongs to the current meeting
          // Try multiple matching strategies:
          // 1. Direct ID matches (HMS meeting ID or database ID)
          // 2. Title match (normalized for comparison)
          const assetMeetingId = asset.meeting_id || asset.meetingId || '';
          const assetTitle = (asset.meeting_title || asset.title || '').toLowerCase().trim();
          const currentTitle = (meetingTitle || '').toLowerCase().trim();
          
          const idMatch = assetMeetingId === meetingId || assetMeetingId.toString() === meetingId?.toString();
          const titleMatch = assetTitle === currentTitle && currentTitle !== '';
          
          const belongsToMeeting = idMatch || titleMatch;
          
          console.log(`📁 Asset ${asset.id} (${asset.type}): meetingId=${asset.meetingId}, meeting_id=${asset.meeting_id}, meeting_title=${asset.meeting_title}, title=${asset.title}, idMatch=${idMatch}, titleMatch=${titleMatch}, belongsToMeeting=${belongsToMeeting}`);
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

  const organizeAssetsBySession = () => {
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

    // Group by meeting name AND session number
    // Assets should be grouped by session like in the web version
    const groupedBySessions: { [sessionKey: string]: MeetingAsset[] } = {};
    
    filteredAssets.forEach(asset => {
      // Use meeting title + session number as the grouping key
      const meetingTitle = (asset.meeting_title || asset.title || 'Unknown Meeting').trim();
      const sessionNumber = asset.session_number || 0; // 0 for legacy assets without session
      const sessionKey = `${meetingTitle.toLowerCase()}_session_${sessionNumber}`;
      
      if (!groupedBySessions[sessionKey]) {
        groupedBySessions[sessionKey] = [];
        console.log(`📁 Creating new session group: ${meetingTitle} - Session ${sessionNumber}`);
      }
      groupedBySessions[sessionKey].push(asset);
    });
    
    console.log(`📁 Total session groups created: ${Object.keys(groupedBySessions).length}`);

    // Convert to SessionGroup array
    const groups: SessionGroup[] = Object.keys(groupedBySessions)
      .map(sessionKey => {
        const sessionAssets = groupedBySessions[sessionKey];
        
        // Sort assets within session by date (newest first)
        sessionAssets.sort((a, b) => {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        
        // Get the first asset to extract meeting and session info
        const firstAsset = sessionAssets[0];
        
        // Use the meeting title (properly cased) from the first asset
        const meetingTitle = firstAsset.meeting_title || firstAsset.title || 'Unknown Meeting';
        const sessionNumber = firstAsset.session_number || 0;
        
        // Use the earliest date in the session for consistent display
        const sessionDate = sessionAssets.reduce((earliest, asset) => {
          const assetDate = new Date(asset.date).getTime();
          const earliestDate = new Date(earliest).getTime();
          return assetDate < earliestDate ? asset.date : earliest;
        }, firstAsset.date);
        
        return {
          sessionId: sessionKey, // Using sessionKey as unique identifier
          sessionNumber: sessionNumber,
          sessionTitle: `Session ${sessionNumber}`,
          date: sessionDate,
          assets: sessionAssets,
          isExpanded: false  // Start collapsed by default
        };
      })
      .sort((a, b) => {
        // Sort sessions by date (newest first)
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

    setSessionGroups(groups);
  };

  const toggleSessionGroup = (sessionId: string) => {
    setSessionGroups(prev => 
      prev.map(group => 
        group.sessionId === sessionId 
          ? { ...group, isExpanded: !group.isExpanded }
          : group
      )
    );
  };

  const playRecording = async (asset: MeetingAsset) => {
    try {
      // Check if this is audio-only or video
      const isAudioOnly = asset.quality === 'audio_only';
      
      // Try to get the URL from various sources
      let mediaUrl = asset.url || asset.downloadUrl || asset.local_recording_path;
      
      if (!mediaUrl) {
        Alert.alert('Error', 'No recording URL available');
        return;
      }

      // If it's a file with file_id, use the backend view endpoint
      if (asset.file_id) {
        const viewUrl = `${API_BASE_URL}/api/v1/mobile/file/${asset.file_id}/view`;
        
        if (isAudioOnly) {
          // For audio files, use Audio component
          try {
            const { sound } = await Audio.Sound.createAsync(
              { uri: viewUrl },
              { shouldPlay: true }
            );
            // Store sound reference for cleanup
            Alert.alert(
              'Audio Playing',
              'Audio is now playing. The player will close when finished.',
              [
                {
                  text: 'Stop',
                  onPress: async () => {
                    await sound.unloadAsync();
                  }
                },
                { text: 'OK', style: 'cancel' }
              ]
            );
          } catch (audioError) {
            console.error('Audio playback error:', audioError);
            // Fallback to external player
            const canOpen = await Linking.canOpenURL(viewUrl);
            if (canOpen) {
              await Linking.openURL(viewUrl);
            } else {
              Alert.alert('Error', 'Cannot play audio. Please try opening in an external player.');
            }
          }
        } else {
          // For video files, use the video player
          setSelectedVideoUrl(viewUrl);
          setShowVideoPlayer(true);
        }
        return;
      }

      // For cloud URLs or direct URLs
      if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
        if (isAudioOnly) {
          // Try to play audio
          try {
            const { sound } = await Audio.Sound.createAsync(
              { uri: mediaUrl },
              { shouldPlay: true }
            );
            Alert.alert(
              'Audio Playing',
              'Audio is now playing.',
              [
                {
                  text: 'Stop',
                  onPress: async () => {
                    await sound.unloadAsync();
                  }
                },
                { text: 'OK', style: 'cancel' }
              ]
            );
          } catch (audioError) {
            console.error('Audio playback error:', audioError);
            Alert.alert('Error', 'Failed to play audio. Please try opening in an external player.');
          }
        } else {
          setSelectedVideoUrl(mediaUrl);
          setShowVideoPlayer(true);
        }
      } else {
        // Try to open in external player for local paths
        const canOpen = await Linking.canOpenURL(mediaUrl);
        if (canOpen) {
          await Linking.openURL(mediaUrl);
        } else {
          Alert.alert('Error', 'Cannot open this recording. Please check the file path.');
        }
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
    // Check if this asset has a file_id - if so, use DocumentViewer
    if (asset.file_id) {
      try {
        // Determine file type from asset type and filename
        const fileType = asset.original_filename 
          ? getFileTypeFromFilename(asset.original_filename)
          : (asset.type === 'transcript' ? 'text/plain' : 'document');
        
        setSelectedFileForViewing({
          fileId: String(asset.file_id),
          fileName: asset.title || asset.original_filename || 'Unknown file',
          fileType: fileType,
          fileCategory: asset.type
        });
        setShowDocumentViewer(true);
        return;
      } catch (error) {
        console.error('Failed to open file with DocumentViewer:', error);
        Alert.alert('Error', 'Failed to open file');
      }
    }

    setSelectedAsset(asset);
    setShowAssetModal(true);
    
    try {
      let details: AssetDetail[] = [];
      
      switch (asset.type) {
        case 'recording':
        case 'video':
          // For recordings, play video/audio
          await playRecording(asset);
          return; // Don't show modal for recordings
        
        case 'transcript':
        case 'call_transcript':
          // Open in DocumentViewer if file_id exists
          if (asset.file_id) {
            const fileType = asset.original_filename 
              ? getFileTypeFromFilename(asset.original_filename)
              : 'text/plain';
            
            setSelectedFileForViewing({
              fileId: String(asset.file_id),
              fileName: asset.title || asset.original_filename || 'Transcript',
              fileType: fileType,
              fileCategory: asset.type
            });
            setShowDocumentViewer(true);
            return;
          }
          
          // Fallback: fetch transcript content or try to open file
          if (asset.local_transcript_path || asset.local_file_path || asset.url) {
            await openFile(asset);
            return;
          } else {
            const transcriptResponse = await apiClient.getMeetingTranscript(asset.meetingId || asset.id);
            if (transcriptResponse.success && transcriptResponse.data) {
              details = transcriptResponse.data.transcript || [];
            }
          }
          break;
        
        case 'meeting_summary':
        case 'summary':
        case 'report':
        case 'meeting_report':
          // Open in DocumentViewer if file_id exists
          if (asset.file_id) {
            const fileType = asset.original_filename 
              ? getFileTypeFromFilename(asset.original_filename)
              : 'text/plain';
            
            setSelectedFileForViewing({
              fileId: String(asset.file_id),
              fileName: asset.title || asset.original_filename || 'Summary',
              fileType: fileType,
              fileCategory: asset.type
            });
            setShowDocumentViewer(true);
            return;
          }
          
          // Fallback: show summary content in modal or try to open file
          if (asset.type === 'meeting_summary') {
            details = [{
              id: '1',
              content: `Summary: ${asset.title}\n\nThis is a meeting summary generated by AI. The content is stored on the server and can be viewed through the web interface.\n\nFile: ${asset.original_filename || 'Unknown'}\nDate: ${formatDate(asset.date)}`,
              timestamp: asset.date,
              speaker: 'AI Summary'
            }];
          } else {
            if (asset.local_file_path || asset.local_report_path || asset.url) {
              await openFile(asset);
              return;
            }
          }
          break;
        
        case 'chat_log':
        case 'chat':
        case 'meeting_chat':
          // Open in DocumentViewer if file_id exists
          if (asset.file_id) {
            const fileType = asset.original_filename 
              ? getFileTypeFromFilename(asset.original_filename)
              : 'text/plain';
            
            setSelectedFileForViewing({
              fileId: String(asset.file_id),
              fileName: asset.title || asset.original_filename || 'Chat',
              fileType: fileType,
              fileCategory: asset.type
            });
            setShowDocumentViewer(true);
            return;
          }
          
          // Fallback: fetch chat content
          const chatResponse = await apiClient.getMeetingChat(asset.meetingId || asset.id);
          if (chatResponse.success && chatResponse.data) {
            details = chatResponse.data.messages || [];
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

  const getFileTypeFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    const pdfExts = ['pdf'];
    const docExts = ['doc', 'docx'];
    const xlsExts = ['xls', 'xlsx', 'csv'];
    const textExts = ['txt', 'md'];
    const videoExts = ['mp4', 'mov', 'avi', 'mkv'];
    const audioExts = ['mp3', 'wav', 'm4a', 'aac'];
    
    if (imageExts.includes(ext)) return 'image';
    if (pdfExts.includes(ext)) return 'application/pdf';
    if (docExts.includes(ext)) return 'application/msword';
    if (xlsExts.includes(ext)) return 'application/vnd.ms-excel';
    if (textExts.includes(ext)) return 'text/plain';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    
    return 'document';
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

  const deleteAsset = async (asset: MeetingAsset) => {
    // Log full asset structure for debugging
    console.log('🗑️ Delete asset called with full asset object:', JSON.stringify(asset, null, 2));
    console.log('🗑️ Asset keys:', Object.keys(asset));
    
    // Try to get file_id from various possible properties
    // Check multiple property names that might contain the file ID
    const assetAny = asset as any;
    
    // Log the actual file_id value to debug
    console.log('🗑️ asset.file_id value:', asset.file_id, 'type:', typeof asset.file_id);
    console.log('🗑️ asset.fileId value:', assetAny.fileId, 'type:', typeof assetAny.fileId);
    
    // Check if file_id exists and is valid (not null, undefined, or empty string)
    let fileId: number | string | undefined = undefined;
    
    if (asset.file_id !== null && asset.file_id !== undefined && asset.file_id !== '') {
      fileId = asset.file_id;
      console.log('🗑️ Using asset.file_id:', fileId);
    } else if (assetAny.fileId !== null && assetAny.fileId !== undefined && assetAny.fileId !== '') {
      fileId = assetAny.fileId;
      console.log('🗑️ Using assetAny.fileId:', fileId);
    } else if (assetAny.file_id_num !== null && assetAny.file_id_num !== undefined && assetAny.file_id_num !== '') {
      fileId = assetAny.file_id_num;
      console.log('🗑️ Using assetAny.file_id_num:', fileId);
    } else if (assetAny.file_record_id !== null && assetAny.file_record_id !== undefined && assetAny.file_record_id !== '') {
      fileId = assetAny.file_record_id;
      console.log('🗑️ Using assetAny.file_record_id:', fileId);
    } else if (assetAny.fileRecordId !== null && assetAny.fileRecordId !== undefined && assetAny.fileRecordId !== '') {
      fileId = assetAny.fileRecordId;
      console.log('🗑️ Using assetAny.fileRecordId:', fileId);
    } else if (assetAny.record_id !== null && assetAny.record_id !== undefined && assetAny.record_id !== '') {
      fileId = assetAny.record_id;
      console.log('🗑️ Using assetAny.record_id:', fileId);
    } else if (assetAny.recordId !== null && assetAny.recordId !== undefined && assetAny.recordId !== '') {
      fileId = assetAny.recordId;
      console.log('🗑️ Using assetAny.recordId:', fileId);
    }
    
    // For old format assets, try to extract numeric ID from various sources
    // Only do this if we haven't found a valid file_id above
    if (!fileId || fileId === 0 || fileId === '0') {
      // PRIORITY 1: For meeting assets (recordings, transcripts, reports), use video_call_id or extract from ID
      // The asset.id format varies:
      // - "recording_1125" or "call_recording_123" -> recording ID
      // - "transcript_1125" or "call_transcript_456" -> transcript ID  
      // - "report_202" -> MeetingReport.id = 202
      // - "meeting_report_789" -> MeetingReport.id = 789
      
      if (typeof asset.id === 'string') {
        // Extract numeric ID from formatted IDs
        const numericMatch = asset.id.match(/\d+/);
        if (numericMatch) {
          fileId = parseInt(numericMatch[0], 10);
          
          // Determine what this ID represents based on asset type
          if (asset.id.startsWith('recording_')) {
            console.log('🗑️ Extracted ID from asset.id:', fileId, '(VideoCall.id or CallRecording.id)');
          } else if (asset.id.startsWith('call_recording_')) {
            console.log('🗑️ Extracted ID from asset.id:', fileId, '(CallRecording.id)');
          } else if (asset.id.startsWith('transcript_')) {
            console.log('🗑️ Extracted ID from asset.id:', fileId, '(VideoCall.id or CallTranscript.id)');
          } else if (asset.id.startsWith('call_transcript_')) {
            console.log('🗑️ Extracted ID from asset.id:', fileId, '(CallTranscript.id)');
          } else if (asset.id.startsWith('report_') || asset.id.startsWith('meeting_report_')) {
            console.log('🗑️ Extracted ID from asset.id:', fileId, '(MeetingReport.id)');
          } else {
            console.log('🗑️ Extracted ID from asset.id:', fileId);
          }
        }
      } else if (typeof asset.id === 'number') {
        fileId = asset.id;
        console.log('🗑️ Using asset.id as number:', fileId);
      }
      
      // PRIORITY 2: For legacy recordings/transcripts, prefer video_call_id if available
      if ((!fileId || fileId === 0 || fileId === '0') && assetAny.video_call_id) {
        fileId = assetAny.video_call_id;
        console.log('🗑️ Using video_call_id as fallback:', fileId);
      }
      
      // PRIORITY 3: Try to extract from URL path (least reliable - this is just directory structure)
      if ((!fileId || fileId === 0 || fileId === '0') && asset.url) {
        // Match pattern: /{numeric_id}/ followed by a filename with extension
        const urlMatch = asset.url.match(/\/(\d+)\/[^\/]+\.\w+$/);
        if (urlMatch) {
          fileId = parseInt(urlMatch[1], 10);
          console.warn('🗑️ Extracted file ID from URL path (before filename):', fileId);
          console.warn('🗑️ WARNING: This may be a directory ID, not the actual record ID!');
        }
      }
    }

    Alert.alert(
      'Delete Asset',
      `Are you sure you want to delete "${asset.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            let fileIdNum: number | undefined = undefined;
            try {
              // If we still don't have a file_id, show error
              if (!fileId) {
                console.warn('🗑️ No file_id found for asset');
                Alert.alert('Cannot Delete', 'This asset does not have a valid file ID and cannot be deleted.');
                return;
              }
              
              // Convert file_id to number if it's a string
              if (typeof fileId === 'string') {
                // Check if string is numeric
                const trimmed = fileId.trim();
                if (!/^\d+$/.test(trimmed)) {
                  console.error('🗑️ Invalid file_id format (not numeric):', fileId);
                  Alert.alert('Error', 'Invalid file ID format. Cannot delete this asset.');
                  return;
                }
                fileIdNum = parseInt(trimmed, 10);
                if (isNaN(fileIdNum)) {
                  console.error('🗑️ Failed to parse file_id:', fileId);
                  Alert.alert('Error', 'Invalid file ID. Cannot delete this asset.');
                  return;
                }
              } else if (typeof fileId === 'number') {
                fileIdNum = fileId;
              } else {
                console.error('🗑️ file_id is not a string or number:', typeof fileId, fileId);
                Alert.alert('Error', 'Invalid file ID type. Cannot delete this asset.');
                return;
              }
              
              console.log('🗑️ Deleting asset with file_id:', fileIdNum, 'for asset:', asset.title, 'type:', asset.type);
              
              // Check if this is a legacy asset (not in File table)
              if (assetAny.is_legacy_recording) {
                console.warn('🗑️ This is a legacy asset from VideoCall table, not File table');
              }
              
              // Log which table this asset is likely in
              if (asset.type === 'recording') {
                console.log('🗑️ Recording assets may be in: File, CallRecording, or VideoCall table');
              } else if (asset.type === 'transcript') {
                console.log('🗑️ Transcript assets may be in: File, CallTranscript, or VideoCall table');
              } else if (asset.type === 'meeting_report' || asset.type === 'report') {
                console.log('🗑️ Report assets are in: MeetingReport table');
              }
              
              await apiClient.deleteFile(fileIdNum);
              
              // Remove asset from state
              setAssets(prevAssets => prevAssets.filter(a => a.id !== asset.id));
              
              Alert.alert('Success', 'Asset deleted successfully');
            } catch (error: any) {
              console.error('🗑️ Delete asset error:', error);
              console.error('🗑️ Error details:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                fileId: fileIdNum,
                assetType: asset.type,
                assetId: asset.id
              });
              
              let errorMessage = error.response?.data?.message || error.message || 'Failed to delete asset';
              
              // Provide more specific error messages
              if (error.message?.includes('File not found') || error.response?.status === 404) {
                errorMessage = `File not found. This asset (${asset.type}) may not be deletable, or the file ID (${fileIdNum ?? 'unknown'}) is incorrect.`;
              } else if (error.response?.status === 403) {
                errorMessage = 'You do not have permission to delete this asset.';
              }
              
              Alert.alert('Error', errorMessage);
            }
          }
        }
      ]
    );
  };

  const deleteAllAssets = async () => {
    if (assets.length === 0) {
      Alert.alert('No Assets', 'There are no assets for this meeting.');
      return;
    }

    // Filter assets that have valid file IDs
    const assetsWithFileIds = assets.filter(asset => {
      const fileId = asset.file_id || asset.id;
      return fileId !== undefined && fileId !== null;
    });
    
    if (assetsWithFileIds.length === 0) {
      Alert.alert(
        'Cannot Delete Assets',
        'Assets do not have file IDs. Individual asset deletion is not available.'
      );
      return;
    }

    Alert.alert(
      'Delete All Assets',
      `Are you sure you want to delete all ${assetsWithFileIds.length} asset${assetsWithFileIds.length !== 1 ? 's' : ''} for this meeting? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              // Try to use the bulk delete endpoint first (like web version)
              try {
                console.log('🗑️ Attempting bulk delete of all assets for meeting:', meetingId);
                await apiClient.deleteMeetingAssets(meetingId);
                console.log('✅ Bulk delete successful');
                
                // Clear assets from state
                setAssets([]);
                
                // Reload assets to refresh the list
                await loadMeetingAssets();
                
                Alert.alert('Success', `All ${assetsWithFileIds.length} asset${assetsWithFileIds.length !== 1 ? 's' : ''} deleted successfully.`);
              } catch (bulkError: any) {
                // If bulk delete fails (e.g., endpoint doesn't exist), fall back to individual deletions
                if (bulkError.response?.status === 404 || bulkError.message?.includes('not found')) {
                  console.log('⚠️ Bulk delete endpoint not available, falling back to individual deletions');
                  
                  // Delete all assets in parallel
                  const deletePromises = assetsWithFileIds.map(async (asset) => {
                    try {
                      const fileId = asset.file_id || asset.id;
                      const fileIdNum = typeof fileId === 'string' ? parseInt(fileId, 10) : fileId;
                      
                      if (!fileIdNum || isNaN(fileIdNum)) {
                        return { success: false, assetId: asset.id, error: 'Invalid file ID' };
                      }
                      
                      await apiClient.deleteFile(fileIdNum);
                      return { success: true, assetId: asset.id };
                    } catch (error: any) {
                      console.error(`Failed to delete asset ${asset.id}:`, error);
                      return { success: false, assetId: asset.id, error: error.message };
                    }
                  });

                  const results = await Promise.all(deletePromises);
                  const successful = results.filter(r => r.success).length;
                  const failed = results.filter(r => !r.success).length;

                  // Clear assets from state
                  setAssets([]);
                  
                  // Reload assets to refresh the list
                  await loadMeetingAssets();

                  if (failed === 0) {
                    Alert.alert('Success', `All ${successful} asset${successful !== 1 ? 's' : ''} deleted successfully.`);
                  } else {
                    Alert.alert(
                      'Partial Success',
                      `${successful} asset${successful !== 1 ? 's' : ''} deleted successfully. ${failed} asset${failed !== 1 ? 's' : ''} failed to delete.`
                    );
                  }
                } else {
                  // Re-throw other errors
                  throw bulkError;
                }
              }
            } catch (error: any) {
              console.error('Delete all assets error:', error);
              const errorMessage = error.response?.data?.message || error.message || 'Failed to delete assets';
              Alert.alert('Error', errorMessage);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const showAssetMenu = (asset: MeetingAsset) => {
    setMenuAsset(asset);
    
    Alert.alert(
      asset.title,
      'Choose an action',
      [
        {
          text: 'View',
          onPress: () => {
            viewAsset(asset);
            setMenuAsset(null);
          }
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAsset(asset);
            setMenuAsset(null);
          }
        },
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => setMenuAsset(null)
        }
      ]
    );
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

  const extractFilenameFromUrl = (url: string | undefined): string | null => {
    if (!url) return null;
    
    try {
      // If it's an S3 URL or file path, extract the filename
      // S3 URLs: https://bucket.s3.region.amazonaws.com/path/to/file.ext
      // File paths: /path/to/file.ext or C:\path\to\file.ext
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || pathname.split('\\').pop();
      if (filename && filename.includes('.')) {
        return filename;
      }
    } catch {
      // If URL parsing fails, try to extract from path string
      const parts = url.split('/');
      const filename = parts[parts.length - 1];
      if (filename && filename.includes('.')) {
        return filename;
      }
      
      // Try Windows path format
      const winParts = url.split('\\');
      const winFilename = winParts[winParts.length - 1];
      if (winFilename && winFilename.includes('.')) {
        return winFilename;
      }
    }
    
    return null;
  };

  const getAssetDisplayTitle = (asset: MeetingAsset) => {
    // Priority 1: Use original_filename (exact S3 filename from backend)
    if (asset.original_filename) {
      return asset.original_filename;
    }
    
    // Priority 2: Extract filename from URL (S3 URL or file path)
    const urlFilename = extractFilenameFromUrl(asset.url || asset.downloadUrl || asset.local_file_path || asset.local_recording_path || asset.local_transcript_path);
    if (urlFilename) {
      return urlFilename;
    }
    
    // Priority 3: Use title if it looks like a filename (contains extension)
    if (asset.title && (asset.title.includes('.') || asset.title !== asset.type)) {
      // Check if title looks like a filename (has extension) or is not just the type
      const hasExtension = /\.\w{2,4}$/.test(asset.title);
      if (hasExtension || asset.title !== asset.type) {
        return asset.title;
      }
    }
    
    // Fallback: Use mapped display names only if no filename available
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
        return asset.title || String(asset.type).charAt(0).toUpperCase() + String(asset.type).slice(1);
    }
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: themeColors.headerBackground || themeColors.card,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
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
      color: themeColors.text,
    },
    headerSubtitle: {
      fontSize: 14,
      color: themeColors.textSecondary,
      marginTop: 2,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    deleteAllButton: {
      padding: 4,
      marginRight: 8,
    },
    refreshButton: {
      padding: 4,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.inputBackground || themeColors.surface,
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
      color: themeColors.text,
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
      backgroundColor: themeColors.surface,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    dateGroupInfo: {
      flex: 1,
    },
    dateGroupTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: themeColors.text,
    },
    dateGroupCount: {
      fontSize: 14,
      color: themeColors.textSecondary,
      marginTop: 2,
    },
    dateGroupContent: {
      backgroundColor: themeColors.background,
    },
    assetWrapper: {
      borderBottomWidth: 1,
      borderBottomColor: themeColors.borderLight || themeColors.border,
    },
    assetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: themeColors.card,
      position: 'relative',
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
      color: themeColors.text,
      marginBottom: 4,
    },
    assetType: {
      fontSize: 14,
      color: themeColors.textSecondary,
      marginBottom: 4,
    },
    assetDetails: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    assetDate: {
      fontSize: 12,
      color: themeColors.textLight,
    },
    assetSize: {
      fontSize: 12,
      color: themeColors.textLight,
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
      color: themeColors.textSecondary,
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
      color: themeColors.textSecondary,
      marginTop: 16,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      color: themeColors.textLight,
      marginTop: 8,
      textAlign: 'center',
      paddingHorizontal: 32,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: themeColors.headerBackground || themeColors.card,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    modalCloseButton: {
      fontSize: 16,
      color: themeColors.tint || '#007AFF',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: themeColors.text,
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
      color: themeColors.text,
      marginBottom: 4,
    },
    assetTypeLarge: {
      fontSize: 16,
      color: themeColors.textSecondary,
      marginBottom: 8,
    },
    assetMeta: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    assetDateLarge: {
      fontSize: 14,
      color: themeColors.textLight,
    },
    assetSizeLarge: {
      fontSize: 14,
      color: themeColors.textLight,
      marginLeft: 4,
    },
    detailSection: {
      marginBottom: 16,
    },
    detailLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: themeColors.textSecondary,
      marginBottom: 4,
    },
    detailValue: {
      fontSize: 16,
      color: themeColors.text,
    },
  }), [themeColors]);

  const renderAssetItem = ({ item }: { item: MeetingAsset }) => (
    <View style={dynamicStyles.assetItem}>
      <TouchableOpacity 
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        onPress={() => viewAsset(item)}
      >
        <View style={[dynamicStyles.assetIcon, { backgroundColor: `${getAssetColor(item.type)}20` }]}>
          <Ionicons name={getAssetIcon(item.type) as any} size={20} color={getAssetColor(item.type)} />
        </View>
        <View style={dynamicStyles.assetContent}>
          <Text style={dynamicStyles.assetTitle} numberOfLines={2}>{getAssetDisplayTitle(item)}</Text>
          <Text style={dynamicStyles.assetType}>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
          <View style={dynamicStyles.assetDetails}>
            <Text style={dynamicStyles.assetDate}>{formatDate(item.date)}</Text>
            {item.size && <Text style={dynamicStyles.assetSize}>• {item.size}</Text>}
          </View>
        </View>
      </TouchableOpacity>
      <TouchableOpacity 
        style={dynamicStyles.moreButton}
        onPress={() => showAssetMenu(item)}
      >
        <Ionicons name="ellipsis-vertical" size={16} color={themeColors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  const renderSessionGroup = ({ item }: { item: SessionGroup }) => {
    // Display meeting title (no session numbers since we're grouping by meeting)
    const meetingTitle = item.sessionTitle || 'Unknown Meeting';
    
    return (
      <View style={dynamicStyles.dateGroup}>
        <TouchableOpacity 
          style={dynamicStyles.dateGroupHeader} 
          onPress={() => toggleSessionGroup(item.sessionId)}
        >
          <View style={dynamicStyles.dateGroupInfo}>
            <Text style={dynamicStyles.dateGroupTitle}>
              {meetingTitle}
            </Text>
            <Text style={dynamicStyles.dateGroupCount}>
              {formatGroupDate(item.date)} • {item.assets.length} asset{item.assets.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Ionicons 
            name={item.isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color={themeColors.textSecondary} 
          />
        </TouchableOpacity>
      
      {item.isExpanded && (
        <View style={dynamicStyles.dateGroupContent}>
          {item.assets.map((asset) => (
            <View key={asset.id} style={dynamicStyles.assetWrapper}>
              {renderAssetItem({ item: asset })}
            </View>
          ))}
        </View>
      )}
    </View>
    );
  };

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity style={dynamicStyles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={themeColors.tint || '#007AFF'} />
        </TouchableOpacity>
        <View style={dynamicStyles.headerContent}>
          <Text style={dynamicStyles.headerTitle} numberOfLines={1}>
            {meetingTitle || 'Meeting Details'}
          </Text>
          <Text style={dynamicStyles.headerSubtitle}>Room: {roomCode}</Text>
        </View>
        <View style={dynamicStyles.headerActions}>
          {assets.length > 0 && (
            <TouchableOpacity 
              style={dynamicStyles.deleteAllButton} 
              onPress={deleteAllAssets}
            >
              <Ionicons name="trash-outline" size={24} color="#FF3B30" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={dynamicStyles.refreshButton} onPress={loadMeetingAssets}>
            <Ionicons name="refresh" size={24} color={themeColors.tint || '#007AFF'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={dynamicStyles.searchContainer}>
        <Ionicons name="search" size={20} color={themeColors.textSecondary} style={dynamicStyles.searchIcon} />
        <TextInput
          style={dynamicStyles.searchInput}
          placeholder="Search assets..."
          placeholderTextColor={themeColors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Assets List */}
      {loading ? (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.tint || '#007AFF'} />
          <Text style={dynamicStyles.loadingText}>Loading meeting assets...</Text>
        </View>
      ) : (
        <FlatList
          data={sessionGroups}
          renderItem={renderSessionGroup}
          keyExtractor={(item) => item.sessionId}
          style={dynamicStyles.assetsList}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMeetingAssets} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={dynamicStyles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={64} color={themeColors.textLight} />
              <Text style={dynamicStyles.emptyText}>
                {searchQuery ? 'No assets match your search' : 'No assets for this meeting'}
              </Text>
              <Text style={dynamicStyles.emptySubtext}>
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
        <SafeAreaView style={dynamicStyles.modalContainer}>
          <View style={dynamicStyles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAssetModal(false)}>
              <Text style={dynamicStyles.modalCloseButton}>Close</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Asset Details</Text>
            <View style={dynamicStyles.modalActions}>
              <TouchableOpacity onPress={() => downloadAsset(selectedAsset!)}>
                <Ionicons name="download" size={24} color={themeColors.tint || '#007AFF'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => shareAsset(selectedAsset!)}>
                <Ionicons name="share" size={24} color={themeColors.tint || '#007AFF'} />
              </TouchableOpacity>
            </View>
          </View>
          
          {selectedAsset && (
            <View style={dynamicStyles.modalContent}>
              <View style={dynamicStyles.assetOverview}>
                <View style={[dynamicStyles.assetIconLarge, { backgroundColor: `${getAssetColor(selectedAsset.type)}20` }]}>
                  <Ionicons name={getAssetIcon(selectedAsset.type) as any} size={32} color={getAssetColor(selectedAsset.type)} />
                </View>
                <View style={dynamicStyles.assetInfo}>
                  <Text style={dynamicStyles.assetTitleLarge}>{getAssetDisplayTitle(selectedAsset)}</Text>
                  <Text style={dynamicStyles.assetTypeLarge}>{selectedAsset.type.charAt(0).toUpperCase() + selectedAsset.type.slice(1)}</Text>
                  <View style={dynamicStyles.assetMeta}>
                    <Text style={dynamicStyles.assetDateLarge}>{formatDate(selectedAsset.date)}</Text>
                    {selectedAsset.size && <Text style={dynamicStyles.assetSizeLarge}>• {selectedAsset.size}</Text>}
                  </View>
                </View>
              </View>
              
              {selectedAsset.meeting_title && (
                <View style={dynamicStyles.detailSection}>
                  <Text style={dynamicStyles.detailLabel}>Meeting</Text>
                  <Text style={dynamicStyles.detailValue}>{selectedAsset.meeting_title}</Text>
                </View>
              )}
              
              {selectedAsset.url && (
                <View style={dynamicStyles.detailSection}>
                  <Text style={dynamicStyles.detailLabel}>URL</Text>
                  <Text style={dynamicStyles.detailValue} numberOfLines={2}>{selectedAsset.url}</Text>
                </View>
              )}
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Document Viewer */}
      {showDocumentViewer && selectedFileForViewing && (
        <DocumentViewer
          fileId={selectedFileForViewing.fileId}
          fileName={selectedFileForViewing.fileName}
          fileType={selectedFileForViewing.fileType}
          fileCategory={selectedFileForViewing.fileCategory}
          onClose={() => {
            setShowDocumentViewer(false);
            setSelectedFileForViewing(null);
          }}
        />
      )}

      {/* Video Player Modal */}
      <Modal
        visible={showVideoPlayer}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setShowVideoPlayer(false);
          if (videoRef) {
            videoRef.unloadAsync().catch(console.error);
          }
          setSelectedVideoUrl(null);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            {selectedVideoUrl && (
              <>
                <TouchableOpacity
                  style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }}
                  onPress={() => {
                    setShowVideoPlayer(false);
                    if (videoRef) {
                      videoRef.unloadAsync().catch(console.error);
                    }
                    setSelectedVideoUrl(null);
                  }}
                >
                  <Ionicons name="close" size={32} color="#fff" />
                </TouchableOpacity>
                <Video
                  ref={(ref) => setVideoRef(ref)}
                  source={{ uri: selectedVideoUrl }}
                  style={{ width: '100%', height: '100%' }}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  onError={(error) => {
                    console.error('Video playback error:', error);
                    Alert.alert('Error', 'Failed to play video');
                  }}
                />
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

