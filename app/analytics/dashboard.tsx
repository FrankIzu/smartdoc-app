import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../services/api';

interface ComprehensiveAnalytics {
  receipts: {
    summary: {
      total_receipts: number;
      total_amount: number;
      average_amount: number;
      period_days: number;
    };
    categories: Array<{
      category: string;
      count: number;
      total_amount: number;
      percentage: number;
    }>;
    timeline: Array<{
      month: string;
      count: number;
      total_amount: number;
    }>;
    payment_methods: Array<{
      method: string;
      count: number;
      total_amount: number;
    }>;
    top_businesses: Array<{
      business: string;
      count: number;
      total_amount: number;
    }>;
  };
  files: {
    types: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    upload_trends: Array<{
      date: string;
      count: number;
    }>;
  };
  workspaces: {
    total_workspaces: number;
    workspace_details: Array<{
      name: string;
      file_count: number;
      member_count: number;
    }>;
  };
  forms: {
    total_forms: number;
    total_responses: number;
    form_details: Array<{
      name: string;
      response_count: number;
    }>;
  };
  summary: {
    period: string;
    period_days: number;
    total_files: number;
    total_size_mb: number;
    total_receipts: number;
    total_spending: number;
    total_workspaces: number;
    total_forms: number;
  };
}

const { width } = Dimensions.get('window');

export default function AnalyticsDashboard() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<ComprehensiveAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState('30'); // Default to 30 days

  const loadAnalytics = async (days = timePeriod) => {
    try {
      setLoading(true);
      const response = await apiClient.getComprehensiveAnalytics(parseInt(days));
      if (response.success && response.data) {
        setAnalytics(response.data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
      Alert.alert('Error', 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const TimePeriodSelector = () => (
    <View style={styles.timePeriodContainer}>
      <Text style={styles.sectionTitle}>Time Period</Text>
      <View style={styles.timePeriodButtons}>
        {['7', '30', '90', '365'].map((days) => (
          <TouchableOpacity
            key={days}
            style={[
              styles.timePeriodButton,
              timePeriod === days && styles.timePeriodButtonActive,
            ]}
            onPress={() => {
              setTimePeriod(days);
              loadAnalytics(days);
            }}
          >
            <Text
              style={[
                styles.timePeriodButtonText,
                timePeriod === days && styles.timePeriodButtonTextActive,
              ]}
            >
              {days === '7' ? '7 Days' : days === '30' ? '30 Days' : days === '90' ? '90 Days' : '1 Year'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const StatCard = ({ title, value, subtitle, icon, color }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: string;
    color: string;
  }) => (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <View style={[styles.statCardIcon, { backgroundColor: color }]}>
          <Ionicons name={icon as any} size={20} color="#fff" />
        </View>
        <Text style={styles.statCardTitle}>{title}</Text>
      </View>
      <Text style={styles.statCardValue}>{value}</Text>
      {subtitle && <Text style={styles.statCardSubtitle}>{subtitle}</Text>}
    </View>
  );

  const CategoryBar = ({ category, amount, percentage, color }: {
    category: string;
    amount: number;
    percentage: number;
    color: string;
  }) => (
    <View style={styles.categoryBar}>
      <View style={styles.categoryBarHeader}>
        <Text style={styles.categoryBarTitle}>{category}</Text>
        <Text style={styles.categoryBarAmount}>{formatCurrency(amount)}</Text>
      </View>
      <View style={styles.categoryBarContainer}>
        <View style={[styles.categoryBarFill, { width: `${percentage}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.categoryBarPercentage}>{percentage.toFixed(1)}%</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analytics Dashboard</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!analytics) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analytics Dashboard</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="analytics-outline" size={64} color="#ccc" />
          <Text style={styles.errorText}>No analytics data available</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadAnalytics()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const categoryColors = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#5856D6'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics Dashboard</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <TimePeriodSelector />

        {/* Overview Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            <StatCard
              title="Total Files"
              value={analytics.summary.total_files}
              icon="folder"
              color="#007AFF"
            />
            <StatCard
              title="Total Receipts"
              value={analytics.summary.total_receipts}
              icon="receipt"
              color="#34C759"
            />
            <StatCard
              title="Total Spent"
              value={formatCurrency(analytics.summary.total_spending)}
              icon="card"
              color="#FF9500"
            />
            <StatCard
              title="Forms Created"
              value={analytics.summary.total_forms}
              subtitle={`${analytics.forms.total_responses} responses`}
              icon="document-text"
              color="#AF52DE"
            />
          </View>
        </View>

        {/* Receipt Analytics */}
        {analytics.summary.total_receipts > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Receipt Analytics</Text>
            
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Spending by Category</Text>
              {analytics.receipts.categories.length > 0 ? (
                analytics.receipts.categories.map((category, index) => (
                  <CategoryBar
                    key={category.category}
                    category={category.category}
                    amount={category.total_amount}
                    percentage={category.percentage}
                    color={categoryColors[index % categoryColors.length]}
                  />
                ))
              ) : (
                <Text style={styles.emptyText}>No receipt categories yet</Text>
              )}
            </View>

            {analytics.receipts.top_businesses.length > 0 && (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle}>Top Businesses</Text>
                {analytics.receipts.top_businesses.slice(0, 5).map((business, index) => (
                  <View key={business.business} style={styles.businessItem}>
                    <View style={styles.businessInfo}>
                      <Text style={styles.businessName}>{business.business}</Text>
                      <Text style={styles.businessStats}>
                        {business.count} receipts • {formatCurrency(business.total_amount)}
                      </Text>
                    </View>
                    <Text style={styles.businessRank}>#{index + 1}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* File Analytics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>File Analytics</Text>
          
          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>File Types</Text>
            {analytics.files.types.length > 0 ? (
              analytics.files.types.map((type, index) => (
                <View key={type.type} style={styles.fileTypeItem}>
                  <View style={styles.fileTypeInfo}>
                    <Text style={styles.fileTypeName}>{type.type.toUpperCase()}</Text>
                    <Text style={styles.fileTypeCount}>{type.count} files</Text>
                  </View>
                  <Text style={styles.fileTypePercentage}>{type.percentage.toFixed(1)}%</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No files uploaded yet</Text>
            )}
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Storage Usage</Text>
            <View style={styles.storageInfo}>
              <StatCard
                title="Total Storage"
                value={formatFileSize(analytics.summary.total_size_mb * 1024 * 1024)}
                icon="server"
                color="#5856D6"
              />
              <StatCard
                title="Total Files"
                value={analytics.summary.total_files}
                icon="document"
                color="#FF3B30"
              />
            </View>
          </View>
        </View>

        {/* Workspace Analytics */}
        {analytics.workspaces.workspace_details.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workspace Analytics</Text>
            {analytics.workspaces.workspace_details.map((workspace) => (
              <View key={workspace.name} style={styles.workspaceItem}>
                <View style={styles.workspaceInfo}>
                  <Text style={styles.workspaceName}>{workspace.name}</Text>
                  <Text style={styles.workspaceStats}>
                    {workspace.file_count} files • {workspace.member_count} members
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 24,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  subsection: {
    marginBottom: 24,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  timePeriodContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  timePeriodButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  timePeriodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  timePeriodButtonActive: {
    backgroundColor: '#007AFF',
  },
  timePeriodButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  timePeriodButtonTextActive: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: (width - 64) / 2,
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  statCardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  statCardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  statCardSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  categoryBar: {
    marginBottom: 16,
  },
  categoryBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBarTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  categoryBarAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  categoryBarContainer: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    marginBottom: 4,
  },
  categoryBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryBarPercentage: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  businessItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  businessStats: {
    fontSize: 12,
    color: '#666',
  },
  businessRank: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  fileTypeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  fileTypeInfo: {
    flex: 1,
  },
  fileTypeName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  fileTypeCount: {
    fontSize: 12,
    color: '#666',
  },
  fileTypePercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  storageInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  workspaceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  workspaceInfo: {
    flex: 1,
  },
  workspaceName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  workspaceStats: {
    fontSize: 12,
    color: '#666',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
}); 