import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';

interface FormTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  fields: FormField[];
  preview_data: any;
}

interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'number';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  validation?: any;
}

export default function CreateFormScreen() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFormTemplates();
  }, []);

  const loadFormTemplates = async () => {
    try {
      setLoading(true);
      const response = await apiService.getFormTemplates();
      
      if (response.success && response.data?.templates) {
        console.log('✅ Loaded form templates from database:', response.data.templates.length);
        setTemplates(response.data.templates);
      } else {
        console.log('❌ No templates found in database response:', response);
        setTemplates([]);
      }
    } catch (error) {
      console.error('❌ Failed to load form templates from database:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadFormTemplates();
  };

  const createBlankForm = () => {
    router.push({
      pathname: '/forms/builder',
      params: {
        templateId: 'blank',
        templateName: 'Blank Form',
        fields: JSON.stringify([])
      }
    });
  };

  const selectTemplate = (template: FormTemplate) => {
    router.push({
      pathname: '/forms/builder',
      params: {
        templateId: template.id.toString(),
        templateName: template.name,
        templateDescription: template.description,
        fields: JSON.stringify(template.fields)
      }
    });
  };

  const getTemplateIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'contact':
        return 'mail';
      case 'feedback':
        return 'chatbubble-ellipses';
      case 'survey':
        return 'clipboard';
      case 'registration':
        return 'person-add';
      case 'rsvp':
        return 'calendar';
      case 'order':
        return 'bag';
      default:
        return 'document-text';
    }
  };

  const getTemplateColor = (category: string, templateName?: string) => {
    // Handle specific templates first
    if (templateName) {
      switch (templateName.toLowerCase()) {
        case 'custom order form':
          return '#27AE60';        // Green
        case 'product order form':
          return '#F39C12';        // Orange
        default:
          break;
      }
    }
    
    // Then handle by category
    switch (category.toLowerCase()) {
      case 'contact':
        return '#007AFF';        // Blue
      case 'feedback':
        return '#FF6B35';        // Orange-Red
      case 'survey':
        return '#9B59B6';        // Purple
      case 'registration':
        return '#3498DB';        // Light Blue
      case 'rsvp':
        return '#E74C3C';        // Red
      case 'order':
        return '#27AE60';        // Green (fallback)
      default:
        return '#8E8E93';        // Gray
    }
  };

  const renderTemplateItem = ({ item }: { item: FormTemplate }) => (
    <TouchableOpacity style={styles.templateCard} onPress={() => selectTemplate(item)}>
      <View style={[styles.templateIcon, { backgroundColor: getTemplateColor(item.category, item.name) + '20' }]}>
        <Ionicons 
          name={getTemplateIcon(item.category) as any} 
          size={24} 
          color={getTemplateColor(item.category, item.name)} 
        />
      </View>
      <View style={styles.templateContent}>
        <Text style={styles.templateName}>{item.name}</Text>
        <Text style={styles.templateDescription}>{item.description}</Text>
        <View style={styles.templateMeta}>
          <View style={[styles.categoryBadge, { backgroundColor: getTemplateColor(item.category, item.name) }]}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
          <Text style={styles.fieldsCount}>{item.fields.length} fields</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Form</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading templates...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Form</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Blank Form Option */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Start Fresh</Text>
          <TouchableOpacity style={styles.blankFormCard} onPress={createBlankForm}>
            <View style={styles.blankFormIcon}>
              <Ionicons name="add" size={32} color="#007AFF" />
            </View>
            <View style={styles.blankFormContent}>
              <Text style={styles.blankFormTitle}>Create Blank Form</Text>
              <Text style={styles.blankFormDescription}>
                Start with an empty form and add your own fields
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        {/* Templates Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Template</Text>
          <Text style={styles.sectionSubtitle}>
            Select a pre-built template to get started quickly
          </Text>
          
          <FlatList
            data={templates}
            renderItem={renderTemplateItem}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
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
    color: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  blankFormCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  blankFormIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  blankFormContent: {
    flex: 1,
  },
  blankFormTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  blankFormDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  templateIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  templateContent: {
    flex: 1,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  templateDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 6,
  },
  templateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  fieldsCount: {
    fontSize: 11,
    color: '#8E8E93',
  },
}); 