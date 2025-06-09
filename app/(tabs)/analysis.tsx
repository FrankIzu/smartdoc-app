import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
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
import { useAuth } from '../context/auth';

const { width } = Dimensions.get('window');

interface AnalyticsData {
  totalDocuments: number;
  totalForms: number;
  formResponses: number;
  recentUploads: number;
  documentsByType: { [key: string]: number };
  uploadTrends: { date: string; count: number }[];
  topCategories: { category: string; count: number }[];
}

export default function AnalysisScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalDocuments: 0,
    totalForms: 0,
    formResponses: 0,
    recentUploads: 0,
    documentsByType: {},
    uploadTrends: [],
    topCategories: [],
  });

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      
      // Get dashboard stats
      const statsResponse = await apiClient.getDashboardStats();
      
      if (statsResponse.success && statsResponse.data) {
        setAnalytics(prev => ({
          ...prev,
          totalDocuments: statsResponse.data.totalDocuments || 0,
          totalForms: statsResponse.data.totalForms || 0,
          formResponses: statsResponse.data.formResponses || 0,
          recentUploads: statsResponse.data.recentUploads || 0,
        }));
      }

      // Try to get more detailed analytics if available
      try {
        const analyticsResponse = await apiClient.getAnalytics();
        if (analyticsResponse.success && analyticsResponse.data) {
          setAnalytics(prev => ({
            ...prev,
            ...analyticsResponse.data,
          }));
        }
      } catch (error) {
        console.log('Detailed analytics not available, using basic stats');
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
    if (user) {
      loadAnalytics();
    }
  }, [user]);

  const MetricCard = ({ 
    title, 
    value, 
    icon, 
    color, 
    subtitle 
  }: {
    title: string;
    value: number | string;
    icon: string;
    color: string;
    subtitle?: string;
  }) => (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <View style={styles.metricHeader}>
        <View style={[styles.metricIcon, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon as any} size={24} color={color} />
        </View>
        <View style={styles.metricContent}>
          <Text style={styles.metricValue}>{value}</Text>
          <Text style={styles.metricTitle}>{title}</Text>
          {subtitle && <Text style={styles.metricSubtitle}>{subtitle}</Text>}
        </View>
      </View>
    </View>
  );

  const CategoryItem = ({ 
    category, 
    count, 
    percentage 
  }: {
    category: string;
    count: number;
    percentage: number;
  }) => (
    <View style={styles.categoryItem}>
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryName}>{category}</Text>
        <Text style={styles.categoryCount}>{count} files</Text>
      </View>
      <View style={styles.categoryProgress}>
        <View 
          style={[
            styles.categoryProgressFill, 
            { width: `${percentage}%` }
          ]} 
        />
      </View>
      <Text style={styles.categoryPercentage}>{percentage.toFixed(1)}%</Text>
    </View>
  );

  const getDocumentTypeData = () => {
    const types = analytics.documentsByType;
    const total = Object.values(types).reduce((sum, count) => sum + count, 0);
    
    return Object.entries(types).map(([type, count]) => ({
      type: type.toUpperCase(),
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }));
  };

  const getCategoryData = () => {
    const categories = analytics.topCategories;
    const total = categories.reduce((sum, cat) => sum + cat.count, 0);
    
    return categories.map(cat => ({
      category: cat.category || 'Uncategorized',
      count: cat.count,
      percentage: total > 0 ? (cat.count / total) * 100 : 0,
    }));
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
          <Text style={styles.title}>Analytics & Insights</Text>
          <Text style={styles.subtitle}>
            Track your document management and form usage
          </Text>
        </View>

        {/* Overview Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.metricsGrid}>
            <MetricCard
              title="Total Documents"
              value={analytics.totalDocuments}
              icon="folder"
              color="#007AFF"
              subtitle="All uploaded files"
            />
            <MetricCard
              title="Total Forms"
              value={analytics.totalForms}
              icon="list"
              color="#34C759"
              subtitle="Created forms"
            />
            <MetricCard
              title="Form Responses"
              value={analytics.formResponses}
              icon="chatbubbles"
              color="#FF9500"
              subtitle="Total submissions"
            />
            <MetricCard
              title="Recent Uploads"
              value={analytics.recentUploads}
              icon="cloud-upload"
              color="#AF52DE"
              subtitle="Last 7 days"
            />
          </View>
        </View>

        {/* Document Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Document Types</Text>
          <View style={styles.chartContainer}>
            {getDocumentTypeData().length > 0 ? (
              getDocumentTypeData().map((item, index) => (
                <CategoryItem
                  key={index}
                  category={item.type}
                  count={item.count}
                  percentage={item.percentage}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="document-outline" size={48} color="#ccc" />
                <Text style={styles.emptyStateText}>No documents yet</Text>
                <Text style={styles.emptyStateSubtext}>Upload files to see type breakdown</Text>
              </View>
            )}
          </View>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Categories</Text>
          <View style={styles.chartContainer}>
            {getCategoryData().length > 0 ? (
              getCategoryData().map((item, index) => (
                <CategoryItem
                  key={index}
                  category={item.category}
                  count={item.count}
                  percentage={item.percentage}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="pricetag-outline" size={48} color="#ccc" />
                <Text style={styles.emptyStateText}>No categories yet</Text>
                <Text style={styles.emptyStateSubtext}>Categorize your documents to see insights</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="download" size={24} color="#007AFF" />
              <Text style={styles.actionText}>Export Data</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="refresh" size={24} color="#34C759" />
              <Text style={styles.actionText}>Refresh Analytics</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Insights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Insights</Text>
          <View style={styles.insightCard}>
            <View style={styles.insightIcon}>
              <Ionicons name="bulb" size={24} color="#FF9500" />
            </View>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Smart Recommendations</Text>
              <Text style={styles.insightText}>
                {analytics.totalDocuments > 10 
                  ? "You have a good collection of documents. Consider creating forms to collect more structured data."
                  : analytics.totalDocuments > 0
                  ? "Keep uploading documents to get better insights and recommendations."
                  : "Start by uploading your first document to begin tracking analytics."
                }
              </Text>
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
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  section: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  metricsGrid: {
    gap: 12,
  },
  metricCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  metricContent: {
    flex: 1,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  metricTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  metricSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  chartContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryInfo: {
    flex: 1,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  categoryCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  categoryProgress: {
    flex: 2,
    height: 8,
    backgroundColor: '#e5e5e5',
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
  },
  categoryProgressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  categoryPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    minWidth: 40,
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  insightCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  insightIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF950020',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  insightText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
}); 