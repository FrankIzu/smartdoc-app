import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useColorScheme,
    View,
} from 'react-native';
import { apiClient } from '../../services/api';

interface FormTemplate {
  id: number;
  name: string;
  type: string;
  title: string;
  description: string;
  json_fields: any[];
  theme: string;
  created_at: string;
  is_active: boolean;
}

export default function TemplatesScreen() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const categories = ['All', 'Contact Form', 'RSVP', 'Feedback', 'Registration', 'Order Form', 'Custom'];

  const fetchTemplates = async () => {
    try {
      const response = await apiClient.get('/api/templates');
      if (response.data.success) {
        setTemplates(response.data.templates);
        setFilteredTemplates(response.data.templates);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      Alert.alert('Error', 'Failed to load templates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    filterTemplates();
  }, [searchQuery, selectedCategory, templates]);

  const filterTemplates = () => {
    let filtered = templates;

    // Apply category filter
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(template => template.type === selectedCategory);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.type.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredTemplates(filtered);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTemplates();
  };

  const handleUseTemplate = async (template: FormTemplate) => {
    Alert.alert(
      'Use Template',
      `Create a new form based on "${template.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Form',
          onPress: async () => {
            try {
              const response = await apiClient.post('/api/forms', {
                name: `${template.name} - Copy`,
                type: template.type,
                title: template.title,
                description: template.description,
                fields: template.json_fields,
                theme: template.theme,
                template_id: template.id,
              });

              if (response.data.success) {
                Alert.alert(
                  'Success',
                  'Form created successfully!',
                  [
                    { text: 'View Forms', onPress: () => router.push('/forms') },
                    { text: 'Edit Now', onPress: () => router.push(`/forms/${response.data.form.id}/edit`) },
                  ]
                );
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to create form from template');
            }
          },
        },
      ]
    );
  };

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case 'Contact Form': return 'mail-outline';
      case 'RSVP': return 'calendar-outline';
      case 'Feedback': return 'chatbubble-outline';
      case 'Registration': return 'person-add-outline';
      case 'Order Form': return 'basket-outline';
      default: return 'document-text-outline';
    }
  };

  const getTemplateColor = (type: string) => {
    switch (type) {
      case 'Contact Form': return '#4F46E5';
      case 'RSVP': return '#10B981';
      case 'Feedback': return '#F59E0B';
      case 'Registration': return '#EF4444';
      case 'Order Form': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const styles = createStyles(isDark);

  const CategoryFilter = ({ category }: { category: string }) => (
    <TouchableOpacity
      style={[
        styles.categoryButton,
        selectedCategory === category && styles.categoryButtonActive
      ]}
      onPress={() => setSelectedCategory(category)}
    >
      <Text style={[
        styles.categoryButtonText,
        selectedCategory === category && styles.categoryButtonTextActive
      ]}>
        {category}
      </Text>
    </TouchableOpacity>
  );

  const TemplateCard = ({ item }: { item: FormTemplate }) => (
    <TouchableOpacity
      style={styles.templateCard}
      onPress={() => handleUseTemplate(item)}
    >
      <View style={styles.templateHeader}>
        <View style={[styles.templateIcon, { backgroundColor: getTemplateColor(item.type) }]}>
          <Ionicons 
            name={getTemplateIcon(item.type) as any} 
            size={24} 
            color="#ffffff" 
          />
        </View>
        <View style={styles.templateInfo}>
          <Text style={styles.templateName}>{item.name}</Text>
          <Text style={styles.templateType}>{item.type}</Text>
        </View>
        <TouchableOpacity 
          style={styles.previewButton}
          onPress={(e) => {
            e.stopPropagation();
            Alert.alert(
              'Template Preview',
              `Template: ${item.name}\nType: ${item.type}\nFields: ${item.json_fields?.length || 0}\n\nDescription: ${item.description}`,
              [
                { text: 'Close' },
                { text: 'Use Template', onPress: () => handleUseTemplate(item) }
              ]
            );
          }}
        >
          <Ionicons name="eye-outline" size={20} color={isDark ? '#cccccc' : '#666666'} />
        </TouchableOpacity>
      </View>

      <Text style={styles.templateDescription} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.templateFooter}>
        <View style={styles.templateStats}>
          <Ionicons name="layers-outline" size={16} color="#4F46E5" />
          <Text style={styles.templateStatsText}>
            {item.json_fields?.length || 0} fields
          </Text>
        </View>
        <TouchableOpacity style={styles.useButton} onPress={() => handleUseTemplate(item)}>
          <Text style={styles.useButtonText}>Use Template</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons 
        name="library-outline" 
        size={64} 
        color={isDark ? '#666' : '#ccc'} 
      />
      <Text style={styles.emptyStateTitle}>
        {searchQuery ? 'No templates found' : 'No templates available'}
      </Text>
      <Text style={styles.emptyStateText}>
        {searchQuery 
          ? 'Try adjusting your search or category filter'
          : 'Templates help you get started quickly with pre-built forms'
        }
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header with search */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={isDark ? '#666' : '#999'} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search templates..."
            placeholderTextColor={isDark ? '#666' : '#999'}
          />
        </View>
      </View>

      {/* Category filters */}
      <FlatList
        data={categories}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <CategoryFilter category={item} />}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
        style={styles.categoriesList}
      />

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#4F46E5" />
        <Text style={styles.infoBannerText}>
          Templates provide a quick way to create forms with predefined fields and styling
        </Text>
      </View>

      {/* Templates list */}
      <FlatList
        data={filteredTemplates}
        keyExtractor={(item) => item.id.toString()}
        renderItem={TemplateCard}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const createStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#1a1a2e' : '#f5f5f5',
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2a2a3e' : '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: isDark ? '#333' : '#e5e5e5',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: isDark ? '#ffffff' : '#000000',
  },
  categoriesList: {
    maxHeight: 50,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: isDark ? '#2a2a3e' : '#ffffff',
    borderWidth: 1,
    borderColor: isDark ? '#333' : '#e5e5e5',
  },
  categoryButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: isDark ? '#cccccc' : '#666666',
  },
  categoryButtonTextActive: {
    color: '#ffffff',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2a2a3e' : '#EEF2FF',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: isDark ? '#cccccc' : '#4F46E5',
    lineHeight: 20,
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
  },
  templateCard: {
    backgroundColor: isDark ? '#2a2a3e' : '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? '#333' : '#e5e5e5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  templateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 18,
    fontWeight: '600',
    color: isDark ? '#ffffff' : '#1a1a2e',
    marginBottom: 4,
  },
  templateType: {
    fontSize: 14,
    color: isDark ? '#cccccc' : '#666666',
  },
  previewButton: {
    padding: 8,
  },
  templateDescription: {
    fontSize: 14,
    color: isDark ? '#cccccc' : '#666666',
    lineHeight: 20,
    marginBottom: 16,
  },
  templateFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  templateStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  templateStatsText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '500',
  },
  useButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  useButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: isDark ? '#ffffff' : '#1a1a2e',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: isDark ? '#cccccc' : '#666666',
    textAlign: 'center',
    lineHeight: 24,
  },
}); 