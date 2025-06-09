import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../services/api';
import { useAuth } from '../context/auth';

interface DashboardStats {
  totalDocuments: number;
  totalForms: number;
  recentUploads: number;
  formResponses: number;
  chatSessions: number;
  processingFiles: number;
}

interface RecentActivity {
  id: string;
  type: 'upload' | 'chat' | 'scan' | 'process';
  title: string;
  subtitle: string;
  timestamp: Date;
  icon: string;
}

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({
    totalDocuments: 0,
    totalForms: 0,
    recentUploads: 0,
    formResponses: 0,
    chatSessions: 0,
    processingFiles: 0,
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getDashboardStats();
      
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // Keep default stats on error
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const formatTimeAgo = (date: Date) => {
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

  const StatCard = ({ title, value, icon, color, onPress }: {
    title: string;
    value: number;
    icon: string;
    color: string;
    onPress?: () => void;
  }) => (
    <TouchableOpacity style={[styles.statCard, { borderLeftColor: color }]} onPress={onPress}>
      <View style={styles.statContent}>
        <View style={styles.statHeader}>
          <Ionicons name={icon as any} size={24} color={color} />
          <Text style={styles.statValue}>{value}</Text>
        </View>
        <Text style={styles.statTitle}>{title}</Text>
      </View>
    </TouchableOpacity>
  );

  const QuickActionCard = ({ title, subtitle, icon, color, onPress }: {
    title: string;
    subtitle: string;
    icon: string;
    color: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.quickActionCard} onPress={onPress}>
      <View style={[styles.quickActionIcon, { backgroundColor: color }]}>
        <Ionicons name={icon as any} size={28} color="#fff" />
      </View>
      <View style={styles.quickActionContent}>
        <Text style={styles.quickActionTitle}>{title}</Text>
        <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#ccc" />
    </TouchableOpacity>
  );

  const ActivityItem = ({ activity }: { activity: RecentActivity }) => (
    <View style={styles.activityItem}>
      <View style={[styles.activityIcon, { backgroundColor: getActivityColor(activity.type) }]}>
        <Ionicons name={activity.icon as any} size={16} color="#fff" />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle}>{activity.title}</Text>
        <Text style={styles.activitySubtitle}>{activity.subtitle}</Text>
      </View>
      <Text style={styles.activityTime}>{formatTimeAgo(activity.timestamp)}</Text>
    </View>
  );

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'upload': return '#007AFF';
      case 'chat': return '#34C759';
      case 'scan': return '#FF9500';
      case 'process': return '#AF52DE';
      default: return '#8E8E93';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userNameText}>{user?.name || user?.email || 'User'}</Text>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Ionicons name="person-circle" size={32} color="#007AFF" />
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <StatCard
              title="Total Documents"
              value={stats.totalDocuments}
              icon="folder"
              color="#007AFF"
              onPress={() => router.push('/(tabs)/documents')}
            />
            <StatCard
              title="Total Forms"
              value={stats.totalForms}
              icon="list"
              color="#34C759"
              onPress={() => router.push('/(tabs)/forms')}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              title="Recent Uploads"
              value={stats.recentUploads}
              icon="cloud-upload"
              color="#FF9500"
            />
            <StatCard
              title="Form Responses"
              value={stats.formResponses}
              icon="chatbubbles"
              color="#AF52DE"
            />
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsContainer}>
            <QuickActionCard
              title="Scan Document"
              subtitle="Capture and process documents"
              icon="camera"
              color="#007AFF"
              onPress={() => router.push('/(tabs)/scanner')}
            />
            <QuickActionCard
              title="Upload Files"
              subtitle="Add documents to your library"
              icon="cloud-upload"
              color="#34C759"
              onPress={() => router.push('/(tabs)/documents')}
            />
            <QuickActionCard
              title="Start AI Chat"
              subtitle="Ask questions about your documents"
              icon="chatbubbles"
              color="#FF9500"
              onPress={() => router.push('/(tabs)/chat')}
            />
            <QuickActionCard
              title="Create Form"
              subtitle="Build custom forms"
              icon="create"
              color="#AF52DE"
              onPress={() => router.push('/(tabs)/forms')}
            />
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/documents')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.activityContainer}>
            {recentActivities.length > 0 ? (
              recentActivities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color="#ccc" />
                <Text style={styles.emptyStateText}>No recent activity</Text>
                <Text style={styles.emptyStateSubtext}>Start by uploading or scanning documents</Text>
              </View>
            )}
          </View>
        </View>

        {/* AI Insights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Insights</Text>
          <View style={styles.insightsContainer}>
            <View style={styles.insightCard}>
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
            </View>
            
            <View style={styles.insightCard}>
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
            </View>
          </View>
        </View>
      </ScrollView>
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
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  welcomeText: {
    fontSize: 16,
    color: '#666',
  },
  userNameText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 2,
  },
  profileButton: {
    padding: 4,
  },
  statsContainer: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 6,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statContent: {
    flex: 1,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  statTitle: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  seeAllText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  quickActionsContainer: {
    gap: 12,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  activityContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 12,
    color: '#666',
  },
  activityTime: {
    fontSize: 12,
    color: '#999',
  },
  insightCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  insightContent: {
    flex: 1,
    marginLeft: 12,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  insightText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  insightsContainer: {
    gap: 12,
  },
  insightIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666',
  },
}); 