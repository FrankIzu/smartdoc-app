import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
import { apiClient } from '../../services/api';
import { useProgressStore } from '../../services/progressService';
import { useFileStore } from '../../stores/fileStore';
import { useAuth } from '../context/auth';

// Debug function to reset document picker state
(global as any).resetDocumentPicker = async () => {
  const fileStore = useFileStore.getState();
  await fileStore.forceResetDocumentPicker();
  console.log('🔄 Document picker state force reset manually');
};

// Debug function to test image picker directly
(global as any).testImagePicker = async () => {
  try {
    const ImagePicker = require('expo-image-picker');
    console.log('🖼️ Testing image picker directly...');
    
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    console.log('🖼️ Permission result:', permissionResult);
    
    if (!permissionResult.granted) {
      console.log('🖼️ Permission denied');
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    
    console.log('🖼️ Direct picker result:', result);
  } catch (error) {
    console.error('🖼️ Direct picker error:', error);
  }
};

// Debug function to reset image picker state
(global as any).resetImagePicker = () => {
  const fileStore = useFileStore.getState();
  fileStore.resetImagePicker();
  console.log('🔄 Image picker state reset manually');
};

// Ultra simple image picker test
(global as any).ultraSimpleImagePicker = async () => {
  try {
    const ImagePicker = require('expo-image-picker');
    console.log('🖼️ Ultra simple picker test...');
    
    const result = await ImagePicker.launchImageLibraryAsync();
    console.log('🖼️ Ultra simple result:', result);
  } catch (error) {
    console.error('🖼️ Ultra simple error:', error);
  }
};

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
  type: 'upload' | 'chat' | 'scan' | 'process' | 'form' | 'analytics';
  title: string;
  subtitle: string;
  timestamp: Date | undefined;
  icon: string;
}

function DashboardScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { uploadFromGallery, uploadFromDocuments } = useFileStore();
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
  const [uploadTimeout, setUploadTimeout] = useState<NodeJS.Timeout | null>(null);
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
    console.log('🏠 Starting dashboard data load...');
    
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
      console.log('🔍 Testing backend connectivity before loading dashboard...');
      let connectivityTest;
      try {
        connectivityTest = await apiClient.checkAuth();
        console.log('🔍 Dashboard connectivity test result:', connectivityTest);
        setConnectionStatus({
          success: connectivityTest.success,
          message: connectivityTest.message || 'Auth check completed'
        });
      } catch (error) {
        console.error('❌ Connectivity test failed:', error);
        connectivityTest = { success: false, message: 'Connection test failed' };
        setConnectionStatus(connectivityTest);
      }
      
      if (!connectivityTest.success) {
        console.error('❌ Dashboard connectivity test failed:', connectivityTest);
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
      
      console.log('✅ Backend connectivity OK, loading dashboard data...');
      
      // Load dashboard stats with robust error handling
      try {
        console.log('📊 Attempting to load dashboard stats...');
        const dashboardResponse = await apiClient.getDashboardStats();
        console.log('📊 Dashboard stats response:', dashboardResponse);
        
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
          
          console.log('📊 Setting safe dashboard stats:', safeStats);
          setStats(safeStats);
        } else {
          console.warn('📊 Dashboard stats API call succeeded but no valid data returned');
          setStats(defaultStats);
        }
      } catch (error) {
        console.warn('📊 Dashboard stats failed, using defaults:', error);
        // Try to get data from files endpoint as fallback
        try {
          console.log('📊 Trying files endpoint as fallback...');
          const filesResponse = await apiClient.getFiles();
          if (filesResponse && filesResponse.success && filesResponse.data) {
            const fileCount = Array.isArray(filesResponse.data) ? filesResponse.data.length : 0;
            console.log('📊 Found files count:', fileCount);
            setStats({
              ...defaultStats,
              totalDocuments: fileCount,
            });
          } else {
            setStats(defaultStats);
          }
        } catch (filesError) {
          console.warn('📊 Files fallback also failed:', filesError);
          setStats(defaultStats);
        }
      }
      
      // Load recent activities with robust error handling
      try {
        console.log('📈 Attempting to load recent activities...');
        const activitiesResponse: any = await apiClient.getRecentActivities(7, 10);
        console.log('📈 Recent activities response:', activitiesResponse);
        
        if (activitiesResponse && activitiesResponse.success) {
          // Handle different response structures
          const responseData = activitiesResponse.data || activitiesResponse;
          const activities = Array.isArray(responseData) ? responseData : [];
          
          if (Array.isArray(activities) && activities.length > 0) {
            console.log('📈 Processing activities:', activities.length);
            
            const formattedActivities = activities.map((activity: any, index: number) => {
              try {
                console.log(`📈 Processing activity ${index}:`, activity);
                // Ensure timestamp is always a valid Date object
                let timestamp: Date;
                try {
                  if (activity.timestamp) {
                    timestamp = new Date(activity.timestamp);
                    // Check if the date is valid
                    if (isNaN(timestamp.getTime())) {
                      timestamp = new Date();
                    }
                  } else {
                    timestamp = new Date();
                  }
                } catch {
                  timestamp = new Date();
                }

                return {
                  id: activity.id || `fallback-${index}-${Date.now()}`,
                  type: activity.type || 'unknown',
                  title: activity.title || 'Activity',
                  subtitle: activity.subtitle || 'No description',
                  timestamp,
                  icon: activity.icon || 'document-outline'
                };
              } catch (activityError) {
                console.warn(`📈 Failed to process activity ${index}:`, activityError);
                return {
                  id: `error-${index}-${Date.now()}`,
                  type: 'unknown',
                  title: 'Activity',
                  subtitle: 'Processing error',
                  timestamp: new Date(),
                  icon: 'alert-outline'
                };
              }
            }).filter(Boolean); // Remove any null/undefined items
            
            console.log('📈 Setting formatted activities:', formattedActivities);
            setRecentActivities(formattedActivities);
          } else {
            console.log('📈 No activities returned, using empty array');
            setRecentActivities(defaultActivities);
          }
        } else {
          console.warn('📈 Recent activities API call succeeded but no valid data returned');
          setRecentActivities(defaultActivities);
        }
      } catch (error) {
        console.warn('📈 Recent activities failed, using empty array:', error);
        setRecentActivities(defaultActivities);
      }
      
    } catch (error) {
      console.error('🏠 Unexpected error in dashboard data loading:', error);
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
      console.log('🏠 Dashboard data loading completed');
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
      console.log('🔄 Auto-refreshing dashboard...');
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
    <TouchableOpacity style={[styles.statCard, { borderLeftColor: color }]} onPress={onPress}>
      <View style={styles.statContent}>
        <View style={styles.statHeader}>
          <View style={{ position: 'relative' }}>
            <Ionicons name={icon as any} size={24} color={color} />
            {badge != null && badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={styles.statTitle}>{title}</Text>
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
    <TouchableOpacity style={styles.quickActionCard} onPress={onPress}>
      <View style={[styles.quickActionIcon, { backgroundColor: color }]}>
        <Ionicons name={icon as any} size={28} color="#fff" />
        {isNew ? <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View> : null}
      </View>
      <View style={styles.quickActionContent}>
        <Text style={styles.quickActionTitle}>{title}</Text>
        <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#ccc" />
    </TouchableOpacity>
  );

  const ActivityItem = ({ activity, onPress }: { activity: RecentActivity; onPress?: () => void }) => (
    <TouchableOpacity style={styles.activityItem} onPress={onPress}>
      <View style={[styles.activityIcon, { backgroundColor: getActivityColor(activity.type) }]}>
        <Ionicons name={activity.icon as any} size={16} color="#fff" />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle}>{activity.title}</Text>
        <Text style={styles.activitySubtitle}>{activity.subtitle}</Text>
      </View>
      <Text style={styles.activityTime}>{formatTimeAgo(activity.timestamp)}</Text>
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
      console.log('📁 Upload already in progress, ignoring request');
      return;
    }
    
    console.log('📁 Files upload button clicked');
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
        console.log('📁 Upload was cancelled or failed');
      }
    } catch (error) {
      console.error('📁 Document upload error:', error);
      Alert.alert('Error', 'Failed to upload files. Please try again.');
    } finally {
      // Always reset the uploading state
      console.log('📁 Resetting upload state');
      setUploadStateWithTimeout(false);
      setIsOpeningPicker(false);
    }
  };

  const handleUploadFromCamera = () => {
    setShowUploadOptions(false);
    router.push('/scanner');
  };

  const handleUploadFromGallery = async () => {
    if (isUploading) {
      console.log('🖼️ Upload already in progress, ignoring request');
      return;
    }
    
    console.log('🖼️ Gallery upload button clicked');
    setUploadStateWithTimeout(true);
    setIsOpeningPicker(true);
    setShowUploadOptions(false);
    
    // Wait for modal to fully close before opening picker
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      console.log('🖼️ Starting gallery upload...');
      const success = await uploadFromGallery();
      console.log('🖼️ Gallery upload result:', success);
      
      if (success) {
        Alert.alert('Success', 'Photos uploaded successfully!');
        loadDashboardData();
      } else {
        // Handle case where upload returns false (user cancelled or failed)
        console.log('🖼️ Gallery upload was cancelled or failed');
        Alert.alert('Upload Failed', 'Failed to upload photos. Please try again.');
      }
    } catch (error: any) {
      console.error('🖼️ Gallery upload error:', error);
      Alert.alert('Error', error.message || 'Failed to upload photos. Please try again.');
    } finally {
      // Always reset the uploading state
      console.log('🖼️ Resetting upload state');
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
        router.push('/(tabs)/chats');
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
      case 'meeting-assets':
        router.push('/quick-reach/meeting-assets');
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
      
      console.log(`📊 Test progress update: ${progress}%`);
      
      if (progress >= 100) {
        clearInterval(progressInterval);
        setTimeout(() => {
          progressStore.updateProgress(progressId, {
            status: 'completed',
            progress: 100,
            message: 'Test file processing completed!'
          });
          console.log('✅ Test progress completed');
        }, 1000);
      }
    }, 1000); // Update every second
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Connection Status Banner */}
      {connectionStatus && !connectionStatus.success && (
        <View style={styles.connectionBanner}>
          <Ionicons name="warning" size={20} color="#f59e0b" />
          <Text style={styles.connectionBannerText}>
            {connectionStatus.message.includes('CORS') 
              ? 'CORS Error: Please configure backend for web development'
              : 'Connection Error: Check if backend is running'
            }
          </Text>
        </View>
      )}
      
      {/* Welcome Message for Non-Authenticated Users */}
      {!user && (
        <View style={styles.welcomeContainer}>
          <View style={styles.welcomeCard}>
            <Ionicons name="person-circle-outline" size={48} color="#007AFF" />
            <Text style={styles.welcomeTitle}>Welcome to GrabDocs</Text>
            <Text style={styles.welcomeSubtitle}>
              Sign in to access your documents and see your personalized dashboard
            </Text>
            <TouchableOpacity
              style={styles.welcomeButton}
              onPress={() => router.push('/(auth)')}
            >
              <Text style={styles.welcomeButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image 
              source={require('../../assets/images/grabdocs-logo-name.png')} 
              style={styles.logoWithName}
              resizeMode="contain"
            />
          </View>
          <View style={styles.headerActions}>
            {!user ? (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => router.push('/(auth)')}
              >
                <Ionicons name="log-in-outline" size={24} color="#007AFF" />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleNotificationPress}
                >
                  <View style={{ position: 'relative' }}>
                    <Ionicons name="notifications-outline" size={24} color="#007AFF" />
                    {stats.unreadNotifications > 0 ? (
                      <View style={styles.headerBadge}>
                        <Text style={styles.headerBadgeText}>{String(stats.unreadNotifications)}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() => router.push('/(tabs)/settings')}
                >
                  <Ionicons name="person-circle" size={32} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.headerButton, refreshing && styles.refreshingButton]}
                  onPress={onRefresh}
                  disabled={refreshing}
                >
                  <Ionicons 
                    name="refresh" 
                    size={24} 
                    color={refreshing ? "#999" : "#007AFF"} 
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>


        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <StatCard
              key="stat-files"
              title="Quick Files"
              value={stats.totalDocuments}
              icon="folder"
              color="#007AFF"
              onPress={() => router.push('/(tabs)/documents')}
            />
            <StatCard
              key="stat-forms"
              title="Quick Forms"
              value={stats.totalForms}
              icon="document-text"
              color="#34C759"
              onPress={() => router.push('/forms/create')}
              badge={stats.formResponses}
            />
          </View>
          <View style={styles.statsRow}>
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
              title="Quick Chats"
              value={stats.chatSessions}
              icon="chatbubbles"
              color="#AF52DE"
              onPress={() => router.push('/(tabs)/chats')}
            />
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsContainer}>
            <QuickActionCard
              key="action-upload"
              title="Upload Document"
              subtitle="Add documents to your library"
              icon="cloud-upload"
              color="#34C759"
              onPress={() => handleQuickAction('upload')}
            />
            <QuickActionCard
              key="action-meeting-call"
              title="Quick Reach"
              subtitle="Join or start a meeting"
              icon="call"
              color="#007AFF"
              onPress={() => handleQuickAction('meeting-call')}
              isNew={true}
            />
            <QuickActionCard
              key="action-meeting-assets"
              title="Meeting Assets"
              subtitle="Recordings, transcripts & files"
              icon="folder-open"
              color="#AF52DE"
              onPress={() => handleQuickAction('meeting-assets')}
              isNew={true}
            />
            <QuickActionCard
              key="action-upload-links"
              title="Quick Links"
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
              title="Manage Bookmarks"
              subtitle="Organize your documents"
              icon="bookmark"
              color="#FF9500"
              onPress={() => handleQuickAction('bookmarks')}
            />
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.activityContainer}>
            {recentActivities.length > 0 ? (
              recentActivities.map((activity, index) => (
                <ActivityItem 
                  key={`activity-${activity.id || `fallback-${index}`}-${index}-${Date.now()}-${Math.random()}`} 
                  activity={activity} 
                  onPress={() => handleActivityPress(activity)}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color="#ccc" />
                <Text style={styles.emptyStateText}>No recent activity</Text>
                <Text style={styles.emptyStateSubtext}>Start by uploading documents</Text>
              </View>
            )}
          </View>
        </View>

        {/* AI Insights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Insights</Text>
          <View style={styles.insightsContainer}>
            <TouchableOpacity key="insight-suggestions" style={styles.insightCard} onPress={() => router.push('/(tabs)/settings')}>
              <View style={styles.insightIcon}>
                <Ionicons name="bulb" size={24} color="#FF9500" />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Smart Suggestions</Text>
                <Text style={styles.insightText}>
                  {stats.totalDocuments > 0 
                    ? "Consider organizing your documents by categories for better search results."
                    : "Upload your first document to get started with AI-powered insights."
                  }
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </TouchableOpacity>
            
            <TouchableOpacity key="insight-trends" style={styles.insightCard} onPress={() => router.push('/(tabs)/chats')}>
              <View style={styles.insightIcon}>
                <Ionicons name="trending-up" size={24} color="#34C759" />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Usage Trends</Text>
                <Text style={styles.insightText}>
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
        style={styles.fab}
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
                onPress: () => router.push('/documents/process-scan'),
              },
              {
                text: 'Create Form',
                onPress: () => router.push('/forms/create'),
              },
              {
                text: 'Test Progress Bar',
                onPress: handleTestProgress,
              },
              {
                text: 'Cancel',
                style: 'cancel',
              },
            ]
          );
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
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
            console.log('🔄 Modal closed, resetting upload state');
            setUploadStateWithTimeout(false);
          } else if (isOpeningPicker) {
            console.log('🔄 Modal closed while opening picker, keeping upload state active');
          }
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowUploadOptions(false);
            // Only reset upload state if not in the middle of opening a picker
            if (isUploading && !isOpeningPicker) {
              console.log('🔄 Modal overlay pressed, resetting upload state');
              setUploadStateWithTimeout(false);
            } else if (isOpeningPicker) {
              console.log('🔄 Modal overlay pressed while opening picker, keeping upload state active');
            }
          }}
        >
          <TouchableOpacity
            style={styles.uploadOptionsContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.uploadOptionsHeader}>
              <Text style={styles.uploadOptionsTitle}>Upload Document</Text>
              <TouchableOpacity onPress={() => setShowUploadOptions(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.uploadOptionsContent}>
              <TouchableOpacity
                style={[styles.uploadOption, isUploading && styles.uploadOptionDisabled]}
                onPress={() => {
                  console.log('📁 Files button pressed in modal');
                  handleUploadFromFiles();
                }}
                disabled={isUploading}
              >
                <View style={[styles.uploadOptionIcon, { backgroundColor: '#007AFF' }]}>
                  <Ionicons name="document" size={24} color="#fff" />
                </View>
                <View style={styles.uploadOptionText}>
                  <Text style={styles.uploadOptionTitle}>Files</Text>
                  <Text style={styles.uploadOptionSubtitle}>Upload from your device</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.uploadOption}
                onPress={handleUploadFromCamera}
              >
                <View style={[styles.uploadOptionIcon, { backgroundColor: '#FF9500' }]}>
                  <Ionicons name="camera" size={24} color="#fff" />
                </View>
                <View style={styles.uploadOptionText}>
                  <Text style={styles.uploadOptionTitle}>Camera</Text>
                  <Text style={styles.uploadOptionSubtitle}>Take a photo or scan document</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.uploadOption, isUploading && styles.uploadOptionDisabled]}
                onPress={() => {
                  console.log('🖼️ Gallery button pressed in modal');
                  handleUploadFromGallery();
                }}
                disabled={isUploading}
              >
                <View style={[styles.uploadOptionIcon, { backgroundColor: '#5856D6' }]}>
                  <Ionicons name="images" size={24} color="#fff" />
                </View>
                <View style={styles.uploadOptionText}>
                  <Text style={styles.uploadOptionTitle}>Images Gallery</Text>
                  <Text style={styles.uploadOptionSubtitle}>Upload from your photo gallery</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoWithName: {
    height: 32,
    width: 120, // Adjust width to accommodate logo + text
  },
  welcomeText: {
    fontSize: 14,
    color: '#666',
  },
  userNameText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 2,
  },

  statsContainer: {
    padding: 12,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
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
    color: '#333',
  },
  statTitle: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  section: {
    padding: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  seeAllText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  quickActionsContainer: {
    gap: 8,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  activityContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 11,
    color: '#666',
  },
  activityTime: {
    fontSize: 11,
    color: '#999',
  },
  insightCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
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
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3,
  },
  insightText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  insightsContainer: {
    gap: 8,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#666',
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
    borderRadius: 32,
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  welcomeContainer: {
    padding: 16,
    backgroundColor: '#fff',
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
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 15,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#666',
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
  // Upload options modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadOptionsContainer: {
    backgroundColor: '#fff',
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
    borderBottomColor: '#e5e5e5',
  },
  uploadOptionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
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
    borderBottomColor: '#f0f0f0',
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
    color: '#333',
  },
  uploadOptionSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});

// Export memoized component to prevent unnecessary re-renders
export default React.memo(DashboardScreen); 