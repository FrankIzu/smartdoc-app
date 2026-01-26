import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { useProgressStore } from '../../services/progressService';
import { useFileStore } from '../../stores/fileStore';
import { useAuth } from '../context/auth';

// Debug functions removed for production build

interface DashboardStats {
  totalDocuments: number;
  totalForms: number;
  formResponses: number;
  chatSessions: number;
  processingFiles: number;
  unreadNotifications?: number;
  recentAnalytics?: number;
}

interface RecentActivity {
  id: string;
  type: 'upload' | 'chat' | 'scan' | 'process' | 'form' | 'analytics' | 'share';
  title: string;
  subtitle: string;
  timestamp: Date | undefined;
  icon: string;
}

function DashboardScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { uploadFromGallery, uploadFromDocuments } = useFileStore();
  const colors = useThemeColors();
  const isAuthenticated = !!user;
  const [stats, setStats] = useState({
    totalDocuments: 0,
    totalForms: 0,
    formResponses: 0,
    chatSessions: 0,
    processingFiles: 0,
    unreadNotifications: 0,
    recentAnalytics: 0,
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadTimeout, setUploadTimeout] = useState<number | null>(null);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);

  const AUTO_REFRESH_INTERVAL = 120000; // Auto-refresh every 2 minutes for dashboard

  // Helper function to safely set upload state with timeout
  const setUploadStateWithTimeout = (uploading: boolean) => {
    setIsUploading(uploading);
    
    if (uploading) {
      // Clear any existing timeout
      if (uploadTimeout) {
        clearTimeout(uploadTimeout);
      }
      
      // Set a timeout to automatically reset upload state after 30 seconds
      const timeout = setTimeout(() => {
        console.log('⏰ Upload timeout reached, resetting upload state');
        setIsUploading(false);
        setUploadTimeout(null);
      }, 30000);
      
      setUploadTimeout(timeout);
    } else {
      // Clear timeout when upload is complete
      if (uploadTimeout) {
        clearTimeout(uploadTimeout);
        setUploadTimeout(null);
      }
    }
  };

  const loadDashboardData = useCallback(async () => {
    // console.log('🏠 Starting dashboard data load...');
    
    // Check if user is authenticated before making API calls
    if (!isAuthenticated || !user) {
      console.log('⚠️ User not authenticated, skipping API calls');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // Set default fallback data immediately to prevent crashes
      const defaultStats = {
        totalDocuments: 0,
        totalForms: 0,
        formResponses: 0,
        chatSessions: 0,
        processingFiles: 0,
        unreadNotifications: 0,
        recentAnalytics: 0,
      };
      const defaultActivities: RecentActivity[] = [];
      
      // First test backend connectivity
      // console.log('🔍 Testing backend connectivity before loading dashboard...');
      let connectivityTest;
      try {
        connectivityTest = await apiClient.checkAuth();
        // console.log('🔍 Dashboard connectivity test result:', connectivityTest);
        setConnectionStatus({
          success: connectivityTest.success,
          message: connectivityTest.message || 'Auth check completed'
        });
      } catch (error) {
        // console.error('❌ Connectivity test failed:', error);
        connectivityTest = { success: false, message: 'Connection test failed' };
        setConnectionStatus(connectivityTest);
      }
      
      if (!connectivityTest.success) {
        // console.error('❌ Dashboard connectivity test failed:', connectivityTest);
        console.log('⚠️ Using fallback data due to connectivity issues');
        // Set fallback data for development
        setStats({
          totalDocuments: 5,
          totalForms: 2,
          formResponses: 3,
          chatSessions: 2,
          processingFiles: 1,
          unreadNotifications: 0,
          recentAnalytics: 8,
        });
        setRecentActivities([
          {
            id: '1',
            type: 'upload',
            title: 'File uploaded',
            subtitle: 'sample.pdf',
            timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
            icon: 'document-outline'
          },
          {
            id: '2',
            type: 'chat',
            title: 'Chat session',
            subtitle: 'AI analysis',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
            icon: 'chatbubble-outline'
          }
        ]);
        return; // Exit early with fallback data
      }
      
      // console.log('✅ Backend connectivity OK, loading dashboard data...');
      
      // Load dashboard stats and recent activities in parallel for better performance
      const startTime = Date.now();
      
      // Start both requests in parallel
      const statsPromise = (async () => {
        try {
          // console.log('📊 Attempting to load dashboard stats...');
          const dashboardResponse = await (apiClient as any).getDashboardStats();
          // console.log('📊 Dashboard stats response:', dashboardResponse);
          
          if (dashboardResponse && dashboardResponse.success && dashboardResponse.data) {
            // Handle both direct stats and nested stats structure
            const statsData = dashboardResponse.data.stats || dashboardResponse.data;
            
            const safeStats = {
              totalDocuments: Number(statsData.totalDocuments) || 0,
              totalForms: Number(statsData.totalForms) || 0,
              formResponses: Number(statsData.formResponses) || 0,
              chatSessions: Number(statsData.chatSessions) || 0,
              processingFiles: Number(statsData.processingFiles) || 0,
              unreadNotifications: Number(statsData.unreadNotifications) || 0,
              recentAnalytics: Number(statsData.recentAnalytics) || 0,
            };
            
            // console.log('📊 Setting safe dashboard stats:', safeStats);
            setStats(safeStats);
            return safeStats;
          } else {
            console.warn('📊 Dashboard stats API call succeeded but no valid data returned');
            setStats(defaultStats);
            return defaultStats;
          }
        } catch (error) {
          console.warn('📊 Dashboard stats failed, using defaults:', error);
          // Try to get data from files endpoint as fallback
          try {
            // console.log('📊 Trying files endpoint as fallback...');
            const filesResponse = await apiClient.getFiles();
            if (filesResponse && filesResponse.success && filesResponse.data) {
              const fileCount = Array.isArray(filesResponse.data) ? filesResponse.data.length : 0;
              // console.log('📊 Found files count:', fileCount);
              const fallbackStats = {
                ...defaultStats,
                totalDocuments: fileCount,
              };
              setStats(fallbackStats);
              return fallbackStats;
            } else {
              setStats(defaultStats);
              return defaultStats;
            }
          } catch (filesError) {
            console.warn('📊 Files fallback also failed:', filesError);
            setStats(defaultStats);
            return defaultStats;
          }
        }
      })();
      
      // Load recent activities in parallel
      const activitiesPromise = (async () => {
        try {
          // Try to use the recent activities API endpoint first
          let activitiesFromAPI: RecentActivity[] = [];
          try {
            const activitiesResponse = await apiClient.getRecentActivities(7, 10);
          if (activitiesResponse && activitiesResponse.success && activitiesResponse.data) {
            const activities = Array.isArray(activitiesResponse.data) ? activitiesResponse.data : [];
            activitiesFromAPI = activities.map((activity: any) => {
              const timestamp = activity.timestamp || activity.created_at || activity.date;
              return {
                id: activity.id?.toString() || `activity-${Date.now()}-${Math.random()}`,
                type: (activity.type || 'upload') as RecentActivity['type'],
                title: activity.title || activity.action || 'Activity',
                subtitle: activity.subtitle || activity.description || activity.file_name || '',
                timestamp: timestamp ? new Date(timestamp) : new Date(),
                icon: activity.icon || 'document-outline'
              };
            });
          }
        } catch (apiError) {
          console.log('📈 Recent activities API not available, falling back to files:', apiError);
        }

        // Also load recent files to include uploads and workspace shares
        const filesResponse = await apiClient.getFiles(1, 50);
        
        // Handle both response formats: { files: [...] } or { data: { files: [...] } }
        let files: any[] = [];
        if (filesResponse && filesResponse.success) {
          if (filesResponse.files && Array.isArray(filesResponse.files)) {
            files = filesResponse.files;
          } else if (filesResponse.data) {
            if (Array.isArray(filesResponse.data)) {
              files = filesResponse.data;
            } else if (filesResponse.data.files && Array.isArray(filesResponse.data.files)) {
              files = filesResponse.data.files;
            }
          }
        }
        
        // Create activities from files
        const fileActivities: RecentActivity[] = files
          .map((file: any, index: number) => {
            try {
              let timestamp: Date;
              try {
                // Use updated_at for workspace shares (when file was shared), created_at for uploads
                const dateStr = file.updated_at || file.created_at || file.uploaded_at;
                if (dateStr) {
                  timestamp = new Date(dateStr);
                  if (isNaN(timestamp.getTime())) {
                    timestamp = new Date();
                  }
                } else {
                  timestamp = new Date(Date.now() - 24 * 60 * 60 * 1000);
                }
              } catch {
                timestamp = new Date(Date.now() - 24 * 60 * 60 * 1000);
              }

              const fileName = file.original_filename || file.filename || file.name || `Document ${index + 1}`;
              
              // Check if file is shared to a workspace
              const isWorkspaceShare = file.workspace_id || file.shared_to_workspace || file.workspace_name;
              const workspaceName = file.workspace_name || (file.workspace_id ? `Workspace ${file.workspace_id}` : null);

              return {
                id: file.id?.toString() || `file-${index}-${Date.now()}`,
                type: isWorkspaceShare ? 'share' as const : 'upload' as const,
                title: isWorkspaceShare ? 'File shared to workspace' : 'File uploaded',
                subtitle: isWorkspaceShare && workspaceName 
                  ? `${fileName} → ${workspaceName}`
                  : fileName,
                timestamp,
                icon: isWorkspaceShare ? 'share-outline' : 'document-outline'
              };
            } catch (fileError) {
              return null;
            }
          })
          .filter((activity): activity is RecentActivity => activity !== null);

        // Combine API activities and file activities, remove duplicates, sort by timestamp
        const allActivities = [...activitiesFromAPI, ...fileActivities];
        const uniqueActivities = Array.from(
          new Map(allActivities.map(activity => [activity.id, activity])).values()
        );
        
        const sortedActivities = uniqueActivities
          .sort((a, b) => {
            const timeA = a.timestamp?.getTime() || 0;
            const timeB = b.timestamp?.getTime() || 0;
            return timeB - timeA; // Most recent first
          })
          .slice(0, 10); // Limit to 10 most recent
        
        if (sortedActivities.length > 0) {
          setRecentActivities(sortedActivities);
        } else {
          setRecentActivities(defaultActivities);
        }
        return sortedActivities;
      } catch (error) {
        console.warn('📈 Recent activities failed, using empty array:', error);
        setRecentActivities(defaultActivities);
        return defaultActivities;
      }
    })();
    
    // Wait for both to complete in parallel
    await Promise.all([statsPromise, activitiesPromise]);
    const loadTime = Date.now() - startTime;
    console.log(`📊 Dashboard loaded in ${loadTime}ms (stats and activities in parallel)`);
      
    } catch (error) {
      // console.error('🏠 Unexpected error in dashboard data loading:', error);
      // Ensure we always have safe defaults
      setStats({
        totalDocuments: 0,
        totalForms: 0,
        formResponses: 0,
        chatSessions: 0,
        processingFiles: 0,
        unreadNotifications: 0,
        recentAnalytics: 0,
      });
      setRecentActivities([]);
    } finally {
      setLoading(false);
      // console.log('🏠 Dashboard data loading completed');
    }
  }, [user, isAuthenticated]); // Include auth state in dependencies to reload when auth changes

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  }, [loadDashboardData]);

  useEffect(() => {
    // Load dashboard data regardless of user authentication status
    // This allows the app to show data even if auth check fails
    loadDashboardData();
  }, [loadDashboardData]);

  // Auto-refresh dashboard periodically when user is authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const interval = setInterval(() => {
      // console.log('🔄 Auto-refreshing dashboard...');
      loadDashboardData();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [isAuthenticated, user, loadDashboardData]);

  // Cleanup upload timeout on unmount
  useEffect(() => {
    return () => {
      if (uploadTimeout) {
        clearTimeout(uploadTimeout);
      }
    };
  }, [uploadTimeout]);

  const formatTimeAgo = (date: Date | undefined | null) => {
    // Handle undefined, null, or invalid dates
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return 'Unknown';
    }
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const StatCard = ({ title, value, icon, color, onPress, badge }: {
    title: string;
    value: number;
    icon: string;
    color: string;
    onPress?: () => void;
    badge?: number;
  }) => (
    <TouchableOpacity style={[dynamicStyles.statCard, { borderLeftColor: color }]} onPress={onPress}>
      <View style={dynamicStyles.statContent}>
        <View style={dynamicStyles.statHeader}>
          <View style={{ position: 'relative' }}>
            <Ionicons name={icon as any} size={26} color={color} />
            {badge != null && badge > 0 ? (
              <View style={dynamicStyles.badge}>
                <Text style={dynamicStyles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={dynamicStyles.statTitle}>{title}</Text>
      </View>
    </TouchableOpacity>
  );

  const QuickActionCard = ({ title, subtitle, icon, color, onPress, isNew }: {
    title: string;
    subtitle: string;
    icon: string;
    color: string;
    onPress: () => void;
    isNew?: boolean;
  }) => (
    <TouchableOpacity style={dynamicStyles.quickActionCard} onPress={onPress}>
      <View style={[dynamicStyles.quickActionIcon, { backgroundColor: color }]}>
        <Ionicons name={icon as any} size={22} color="#fff" />
        {isNew ? <View style={dynamicStyles.newBadge}><Text style={dynamicStyles.newBadgeText}>NEW</Text></View> : null}
      </View>
      <View style={dynamicStyles.quickActionContent}>
        <Text style={dynamicStyles.quickActionTitle}>{title}</Text>
        <Text style={dynamicStyles.quickActionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#ccc" />
    </TouchableOpacity>
  );

  const ActivityItem = ({ activity, onPress }: { activity: RecentActivity; onPress?: () => void }) => (
    <TouchableOpacity style={dynamicStyles.activityItem} onPress={onPress}>
      <View style={[dynamicStyles.activityIcon, { backgroundColor: getActivityColor(activity.type) }]}>
        <Ionicons name={activity.icon as any} size={18} color="#fff" />
      </View>
      <View style={dynamicStyles.activityContent}>
        <Text style={dynamicStyles.activityTitle}>{activity.title}</Text>
        <Text style={dynamicStyles.activitySubtitle}>{activity.subtitle}</Text>
      </View>
      <Text style={dynamicStyles.activityTime}>{formatTimeAgo(activity.timestamp)}</Text>
    </TouchableOpacity>
  );

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'upload': return '#007AFF';
      case 'chat': return '#34C759';
      case 'scan': return '#FF9500';
      case 'process': return '#AF52DE';
      case 'form': return '#FF3B30';
      case 'analytics': return '#5856D6';
      default: return '#8E8E93';
    }
  };

  const handleUploadFromFiles = async () => {
    if (isUploading) {
      // console.log('📁 Upload already in progress, ignoring request');
      return;
    }
    
    // console.log('📁 Files upload button clicked');
    setUploadStateWithTimeout(true);
    setIsOpeningPicker(true);
    setShowUploadOptions(false);
    
    // Wait for modal to fully close before opening picker
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Use the reactive hook method which handles state properly
      const success = await uploadFromDocuments();
      
      if (success) {
        Alert.alert('Success', 'Files uploaded successfully!');
        loadDashboardData();
      } else {
        // Handle case where upload returns false (user cancelled or failed)
        // console.log('📁 Upload was cancelled or failed');
      }
    } catch (error) {
      // console.error('📁 Document upload error:', error);
      Alert.alert('Error', 'Failed to upload files. Please try again.');
    } finally {
      // Always reset the uploading state
      // console.log('📁 Resetting upload state');
      setUploadStateWithTimeout(false);
      setIsOpeningPicker(false);
    }
  };

  const handleUploadFromCamera = () => {
    setShowUploadOptions(false);
    router.push('/scanner');
  };

  const handleUploadByLink = () => {
    setShowUploadOptions(false);
    router.push('/upload-by-link-code');
  };

  const handleUploadFromGallery = async () => {
    if (isUploading) {
      // console.log('🖼️ Upload already in progress, ignoring request');
      return;
    }
    
    // console.log('🖼️ Gallery upload button clicked');
    setUploadStateWithTimeout(true);
    setIsOpeningPicker(true);
    setShowUploadOptions(false);
    
    // Wait for modal to fully close before opening picker
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // console.log('🖼️ Starting gallery upload...');
      const success = await uploadFromGallery();
      // console.log('🖼️ Gallery upload result:', success);
      
      if (success) {
        Alert.alert('Success', 'Photos uploaded successfully!');
        loadDashboardData();
      } else {
        // Handle case where upload returns false (user cancelled or failed)
        // console.log('🖼️ Gallery upload was cancelled or failed');
        Alert.alert('Upload Failed', 'Failed to upload photos. Please try again.');
      }
    } catch (error: any) {
      // console.error('🖼️ Gallery upload error:', error);
      Alert.alert('Error', error.message || 'Failed to upload photos. Please try again.');
    } finally {
      // Always reset the uploading state
      // console.log('🖼️ Resetting upload state');
      setUploadStateWithTimeout(false);
      setIsOpeningPicker(false);
    }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'scan':
        router.push('/(tabs)/documents');
        break;
      case 'upload':
        // Show upload options modal
        setShowUploadOptions(true);
        break;
      case 'chat':
        // Navigate to user chat screen (user-to-user and workspace chats ONLY)
        router.push('/user-chat');
        break;
      case 'form':
        router.push('/forms/create');
        break;
      case 'workspaces':
        router.push('/workspaces');
        break;
      case 'notifications':
      case 'analytics':
        router.push('/(tabs)/settings');
        break;
      case 'upload-links':
        router.push('/upload-links');
        break;
      case 'meeting-call':
        router.push('/quick-reach/meeting-call');
        break;
      case 'bookmarks':
        router.push('/bookmarks/manage');
        break;
      default:
        break;
    }
  };

  const handleActivityPress = (activity: RecentActivity) => {
    switch (activity.type) {
      case 'upload':
      case 'scan':
        router.push('/(tabs)/documents');
        break;
      case 'chat':
        router.push('/(tabs)/chats');
        break;
      case 'form':
      case 'analytics':
        router.push('/(tabs)/settings');
        break;
      default:
        break;
    }
  };

  const handleNotificationPress = () => {
    Alert.alert(
      'Notifications',
      `You have ${stats.unreadNotifications || 0} unread notifications`,
      [
        { 
          text: 'View All', 
          onPress: () => {
            Alert.alert('Coming Soon', 'Notifications panel will be available in the next update!');
          }
        },
        { text: 'Dismiss', style: 'cancel' },
      ]
    );
  };

  const handleTestProgress = () => {
    console.log('🧪 Testing global progress bar...');
    const progressStore = useProgressStore.getState();
    const taskId = `test_${Date.now()}`;
    const fileName = 'test-file.pdf';
    
    // Start progress
    const progressId = progressStore.addProgress({
      title: fileName,
      progress: 0,
      status: 'pending'
    });
    
    // Simulate progress updates
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 20;
      
      progressStore.updateProgress(progressId, {
        progress: progress,
        status: 'in-progress',
        message: `Processing test file... ${progress}%`
      });
      
      // console.log(`📊 Test progress update: ${progress}%`);
      
      if (progress >= 100) {
        clearInterval(progressInterval);
        setTimeout(() => {
          progressStore.updateProgress(progressId, {
            status: 'completed',
            progress: 100,
            message: 'Test file processing completed!'
          });
          // console.log('✅ Test progress completed');
        }, 1000);
      }
    }, 1000); // Update every second
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
  container: {
    flex: 1,
      backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 7,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoWithName: {
    height: 36,
      width: 135,
  },
  welcomeText: {
    fontSize: 15,
      color: colors.textSecondary,
  },
  userNameText: {
    fontSize: 22,
    fontWeight: '700',
      color: colors.text,
    marginTop: 2,
  },
  statsContainer: {
    padding: 14,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
      backgroundColor: colors.card,
    borderRadius: 9,
    padding: 14,
    marginHorizontal: 4,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  statContent: {
    flex: 1,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
      color: colors.text,
  },
  statTitle: {
    fontSize: 12,
      color: colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  section: {
    padding: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
      color: colors.text,
  },
  seeAllText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  quickActionsContainer: {
    gap: 6,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
      backgroundColor: colors.card,
    padding: 10,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '600',
      color: colors.text,
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: 12,
      color: colors.textSecondary,
  },
  activityContainer: {
      backgroundColor: colors.card,
    borderRadius: 8,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
      borderBottomColor: colors.border,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
      color: colors.text,
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 12,
      color: colors.textSecondary,
  },
  activityTime: {
    fontSize: 11,
      color: colors.textLight,
  },
  insightCard: {
    flexDirection: 'row',
      backgroundColor: colors.card,
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  insightContent: {
    flex: 1,
    marginLeft: 10,
  },
  insightTitle: {
    fontSize: 15,
    fontWeight: '600',
      color: colors.text,
    marginBottom: 3,
  },
  insightText: {
    fontSize: 13,
      color: colors.textSecondary,
    lineHeight: 19,
  },
  insightsContainer: {
    gap: 8,
  },
  insightIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 17,
    fontWeight: '600',
      color: colors.text,
    marginBottom: 7,
  },
  emptyStateSubtext: {
    fontSize: 13,
      color: colors.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 4,
  },
  refreshingButton: {
    opacity: 0.5,
  },
  headerBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 2,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#007AFF',
    borderRadius: 26,
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  welcomeContainer: {
    padding: 16,
      backgroundColor: colors.card,
    borderRadius: 8,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeCard: {
    alignItems: 'center',
    padding: 20,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
      color: colors.text,
    marginTop: 15,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 15,
      color: colors.textSecondary,
    marginTop: 5,
    textAlign: 'center',
  },
  welcomeButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
  },
  welcomeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  newBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: {
    color: 'white',
    fontSize: 8,
    fontWeight: 'bold',
  },
  connectionBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    margin: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionBannerText: {
    color: '#92400e',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadOptionsContainer: {
      backgroundColor: colors.card,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  uploadOptionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
      borderBottomColor: colors.border,
  },
  uploadOptionsTitle: {
    fontSize: 20,
    fontWeight: '700',
      color: colors.text,
  },
  uploadOptionsContent: {
    padding: 16,
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
      borderBottomColor: colors.border,
  },
  uploadOptionDisabled: {
    opacity: 0.5,
  },
  uploadOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  uploadOptionText: {
    flex: 1,
    marginRight: 10,
  },
  uploadOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
      color: colors.text,
  },
  uploadOptionSubtitle: {
    fontSize: 12,
      color: colors.textSecondary,
    marginTop: 2,
  },
  }), [colors]);

  return (
    <SafeAreaView style={dynamicStyles.container}>
      {/* Connection Status Banner */}
      {connectionStatus && !connectionStatus.success && (
        <View style={dynamicStyles.connectionBanner}>
          <Ionicons name="warning" size={20} color="#f59e0b" />
          <Text style={dynamicStyles.connectionBannerText}>
            {connectionStatus.message.includes('CORS') 
              ? 'CORS Error: Please configure backend for web development'
              : 'Connection Error: Check if backend is running'
            }
          </Text>
        </View>
      )}
      
      {/* Welcome Message for Non-Authenticated Users */}
      {!user && (
        <View style={dynamicStyles.welcomeContainer}>
          <View style={dynamicStyles.welcomeCard}>
            <Ionicons name="person-circle-outline" size={52} color="#007AFF" />
            <Text style={dynamicStyles.welcomeTitle}>Welcome to GrabDocs</Text>
            <Text style={dynamicStyles.welcomeSubtitle}>
              Sign in to access your documents and see your personalized dashboard
            </Text>
            <TouchableOpacity
              style={dynamicStyles.welcomeButton}
              onPress={() => router.push('/(auth)')}
            >
              <Text style={dynamicStyles.welcomeButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={dynamicStyles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={dynamicStyles.header}>
          <View style={dynamicStyles.headerLeft}>
            <Image 
              source={require('../../assets/images/grabdocs-brand-app-images/png/name-transparent.png')} 
              style={dynamicStyles.logoWithName}
              resizeMode="contain"
            />
          </View>
          <View style={dynamicStyles.headerActions}>
            {!user ? (
              <TouchableOpacity
                style={dynamicStyles.headerButton}
                onPress={() => router.push('/(auth)')}
              >
                  <Ionicons name="log-in-outline" size={26} color="#007AFF" />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={dynamicStyles.headerButton}
                  onPress={handleNotificationPress}
                >
                  <View style={{ position: 'relative' }}>
                    <Ionicons name="notifications-outline" size={26} color="#007AFF" />
                    {stats.unreadNotifications > 0 ? (
                      <View style={dynamicStyles.headerBadge}>
                        <Text style={dynamicStyles.headerBadgeText}>{String(stats.unreadNotifications)}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={dynamicStyles.headerButton}
                  onPress={() => router.push('/(tabs)/help')}
                >
                  <Ionicons name="help-circle-outline" size={26} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={dynamicStyles.headerButton}
                  onPress={() => router.push('/(tabs)/settings')}
                >
                  <Ionicons name="person-circle" size={34} color="#007AFF" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>


        {/* Stats Cards */}
        <View style={dynamicStyles.statsContainer}>
          <View style={dynamicStyles.statsRow}>
            <StatCard
              key="stat-files"
              title="Files"
              value={stats.totalDocuments}
              icon="folder"
              color="#007AFF"
              onPress={() => router.push('/(tabs)/documents')}
            />
            <StatCard
              key="stat-forms"
              title="Forms"
              value={stats.totalForms}
              icon="clipboard-outline"
              color="#34C759"
              onPress={() => router.push('/forms/create')}
              badge={stats.formResponses}
            />
          </View>
          <View style={dynamicStyles.statsRow}>
            <StatCard
              key="stat-analytics"
              title="Analytics"
              value={stats.recentAnalytics || 0}
              icon="analytics"
              color="#FF9500"
              onPress={() => router.push('/analytics/dashboard')}
            />
            <StatCard
              key="stat-chats"
              title="ChatGD"
              value={stats.chatSessions}
              icon="chatbubbles"
              color="#AF52DE"
              onPress={() => router.push('/(tabs)/chats')}
            />
          </View>
        </View>

        {/* Quick Actions */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Quick Actions</Text>
          <View style={dynamicStyles.quickActionsContainer}>
            <QuickActionCard
              key="action-upload"
              title="Upload Document"
              subtitle="Add documents to your library"
              icon="cloud-upload"
              color="#34C759"
              onPress={() => handleQuickAction('upload')}
            />
            <QuickActionCard
              key="action-chat"
              title="Chat"
              subtitle="Message your team members"
              icon="chatbubbles"
              color="#FF2D55"
              onPress={() => handleQuickAction('chat')}
            />
            <QuickActionCard
              key="action-meeting-call"
              title="Reach"
              subtitle="Join or start a meeting"
              icon="call"
              color="#007AFF"
              onPress={() => handleQuickAction('meeting-call')}
              isNew={true}
            />
            <QuickActionCard
              key="action-upload-links"
              title="Links"
              subtitle="Create links to receive files"
              icon="link"
              color="#8E44AD"
              onPress={() => handleQuickAction('upload-links')}
            />
            <QuickActionCard
              key="action-workspaces"
              title="Workspaces"
              subtitle="Collaborate with your team"
              icon="people"
              color="#5856D6"
              onPress={() => handleQuickAction('workspaces')}
            />
            <QuickActionCard
              key="action-bookmarks"
              title="Bookmarks"
              subtitle="Organize your documents"
              icon="bookmark"
              color="#FF9500"
              onPress={() => handleQuickAction('bookmarks')}
            />
          </View>
        </View>

        {/* Recent Activity */}
        <View style={dynamicStyles.section}>
          <View style={dynamicStyles.sectionHeader}>
            <Text style={dynamicStyles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/documents')}>
              <Text style={dynamicStyles.seeAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={dynamicStyles.activityContainer}>
            {recentActivities.length > 0 ? (
              recentActivities.slice(0, 5).map((activity, index) => (
                <ActivityItem 
                  key={`activity-${activity.id || `fallback-${index}`}-${index}-${Date.now()}-${Math.random()}`} 
                  activity={activity} 
                  onPress={() => handleActivityPress(activity)}
                />
              ))
            ) : (
              <View style={dynamicStyles.emptyState}>
                <Ionicons name="document-text-outline" size={52} color="#ccc" />
                <Text style={dynamicStyles.emptyStateText}>No recent activity</Text>
                <Text style={dynamicStyles.emptyStateSubtext}>Start by uploading documents</Text>
              </View>
            )}
          </View>
        </View>

        {/* AI Insights */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>AI Insights</Text>
          <View style={dynamicStyles.insightsContainer}>
            <TouchableOpacity key="insight-suggestions" style={dynamicStyles.insightCard} onPress={() => router.push('/(tabs)/chats')}>
              <View style={dynamicStyles.insightIcon}>
                <Ionicons name="bulb" size={26} color="#FF9500" />
              </View>
              <View style={dynamicStyles.insightContent}>
                <Text style={dynamicStyles.insightTitle}>Smart Suggestions</Text>
                <Text style={dynamicStyles.insightText}>
                  {stats.totalDocuments > 0 
                    ? "Consider organizing your documents by categories for better search results."
                    : "Upload your first document to get started with AI-powered insights."
                  }
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </TouchableOpacity>
            
            <TouchableOpacity key="insight-trends" style={dynamicStyles.insightCard} onPress={() => router.push('/(tabs)/chats')}>
              <View style={dynamicStyles.insightIcon}>
                <Ionicons name="trending-up" size={26} color="#34C759" />
              </View>
              <View style={dynamicStyles.insightContent}>
                <Text style={dynamicStyles.insightTitle}>Usage Trends</Text>
                <Text style={dynamicStyles.insightText}>
                  {stats.chatSessions > 0
                    ? `You've had ${stats.chatSessions} AI conversations. Keep exploring your documents!`
                    : "Start a chat session to ask questions about your documents."
                  }
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Add some padding at the bottom for better scrolling */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={dynamicStyles.fab}
        onPress={() => {
          Alert.alert(
            'Quick Actions',
            'Choose an action:',
            [
              {
                text: 'Upload File',
                onPress: () => setShowUploadOptions(true),
              },
              {
                text: 'Scan Document',
                onPress: () => router.push('/scanner'),
              },
              {
                text: 'Cancel',
                style: 'cancel',
              },
            ]
          );
        }}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Upload Options Modal */}
      <Modal
        visible={showUploadOptions}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowUploadOptions(false);
          // Only reset upload state if not in the middle of opening a picker
          if (isUploading && !isOpeningPicker) {
            // console.log('🔄 Modal closed, resetting upload state');
            setUploadStateWithTimeout(false);
          } else if (isOpeningPicker) {
            // console.log('🔄 Modal closed while opening picker, keeping upload state active');
          }
        }}
      >
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowUploadOptions(false);
            // Only reset upload state if not in the middle of opening a picker
            if (isUploading && !isOpeningPicker) {
              // console.log('🔄 Modal overlay pressed, resetting upload state');
              setUploadStateWithTimeout(false);
            } else if (isOpeningPicker) {
              // console.log('🔄 Modal overlay pressed while opening picker, keeping upload state active');
            }
          }}
        >
          <TouchableOpacity
            style={dynamicStyles.uploadOptionsContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={dynamicStyles.uploadOptionsHeader}>
              <Text style={dynamicStyles.uploadOptionsTitle}>Upload Document</Text>
              <TouchableOpacity onPress={() => setShowUploadOptions(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={dynamicStyles.uploadOptionsContent}>
              <TouchableOpacity
                style={[dynamicStyles.uploadOption, isUploading && dynamicStyles.uploadOptionDisabled]}
                onPress={() => {
                  // console.log('📁 Files button pressed in modal');
                  handleUploadFromFiles();
                }}
                disabled={isUploading}
              >
                <View style={[dynamicStyles.uploadOptionIcon, { backgroundColor: '#007AFF' }]}>
                  <Ionicons name="document" size={24} color="#fff" />
                </View>
                <View style={dynamicStyles.uploadOptionText}>
                  <Text style={dynamicStyles.uploadOptionTitle}>Files</Text>
                  <Text style={dynamicStyles.uploadOptionSubtitle}>Upload from your device</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity
                style={dynamicStyles.uploadOption}
                onPress={handleUploadFromCamera}
              >
                <View style={[dynamicStyles.uploadOptionIcon, { backgroundColor: '#FF9500' }]}>
                  <Ionicons name="camera" size={24} color="#fff" />
                </View>
                <View style={dynamicStyles.uploadOptionText}>
                  <Text style={dynamicStyles.uploadOptionTitle}>Camera</Text>
                  <Text style={dynamicStyles.uploadOptionSubtitle}>Take a photo or scan document</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[dynamicStyles.uploadOption, isUploading && dynamicStyles.uploadOptionDisabled]}
                onPress={() => {
                  // console.log('🖼️ Gallery button pressed in modal');
                  handleUploadFromGallery();
                }}
                disabled={isUploading}
              >
                <View style={[dynamicStyles.uploadOptionIcon, { backgroundColor: '#5856D6' }]}>
                  <Ionicons name="images" size={24} color="#fff" />
                </View>
                <View style={dynamicStyles.uploadOptionText}>
                  <Text style={dynamicStyles.uploadOptionTitle}>Images Gallery</Text>
                  <Text style={dynamicStyles.uploadOptionSubtitle}>Upload from your photo gallery</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity
                style={dynamicStyles.uploadOption}
                onPress={handleUploadByLink}
              >
                <View style={[dynamicStyles.uploadOptionIcon, { backgroundColor: '#34C759' }]}>
                  <Ionicons name="link" size={24} color="#fff" />
                </View>
                <View style={dynamicStyles.uploadOptionText}>
                  <Text style={dynamicStyles.uploadOptionTitle}>Upload by Link</Text>
                  <Text style={dynamicStyles.uploadOptionSubtitle}>Upload using an upload code</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}


// Export memoized component to prevent unnecessary re-renders
export default React.memo(DashboardScreen); 