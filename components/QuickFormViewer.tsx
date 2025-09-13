import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../services/api';

interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'number';
  label: string;
  name?: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  validation?: any;
}

interface FormData {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
  responseCount?: number;
}

interface QuickFormViewerProps {
  formId: string;
  formName: string;
  onClose: () => void;
}

export default function QuickFormViewer({
  formId,
  formName,
  onClose
}: QuickFormViewerProps) {
  const [formData, setFormData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFormData();
  }, [formId]);

  const loadFormData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to get form data by ID
      const response = await apiService.getFormById(parseInt(formId));
      
      if (response.success && response.form) {
        const form = response.form;
        setFormData({
          id: form.id.toString(),
          name: form.title || form.name || 'Untitled Form',
          description: form.description || '',
          fields: form.json_fields || [],
          responseCount: form.response_count || 0
        });
      } else {
        setError('Form not found or failed to load');
      }
    } catch (error) {
      console.error('Failed to load form data:', error);
      setError('Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  const renderField = ({ item }: { item: FormField }) => {
    const getFieldIcon = (type: string) => {
      switch (type) {
        case 'text': return 'text';
        case 'email': return 'mail';
        case 'phone': return 'call';
        case 'textarea': return 'chatbox';
        case 'select': return 'chevron-down';
        case 'radio': return 'radio-button-on';
        case 'checkbox': return 'checkbox';
        case 'date': return 'calendar';
        case 'number': return 'keypad';
        default: return 'document-text';
      }
    };

    return (
      <View style={styles.fieldContainer}>
        <View style={styles.fieldHeader}>
          <Ionicons 
            name={getFieldIcon(item.type) as any} 
            size={16} 
            color="#666" 
            style={styles.fieldIcon}
          />
          <Text style={styles.fieldLabel}>
            {item.label}
            {item.required && <Text style={styles.required}> *</Text>}
          </Text>
        </View>
        
        <View style={styles.fieldPreview}>
          {item.type === 'textarea' ? (
            <View style={styles.textareaPreview}>
              <Text style={styles.placeholderText}>
                {item.placeholder || `Enter ${item.label.toLowerCase()}...`}
              </Text>
            </View>
          ) : item.type === 'select' || item.type === 'radio' ? (
            <View style={styles.selectPreview}>
              <Text style={styles.placeholderText}>
                {item.options?.[0] || 'Select an option...'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#999" />
            </View>
          ) : item.type === 'checkbox' ? (
            <View style={styles.checkboxPreview}>
              <View style={styles.checkbox}>
                <Ionicons name="checkmark" size={12} color="#007AFF" />
              </View>
              <Text style={styles.checkboxLabel}>
                {item.options?.[0] || 'Check this option'}
              </Text>
            </View>
          ) : (
            <View style={styles.inputPreview}>
              <Text style={styles.placeholderText}>
                {item.placeholder || `Enter ${item.label.toLowerCase()}...`}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Loading Form...</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading form data...</Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  if (error || !formData) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Error</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={64} color="#FF3B30" />
            <Text style={styles.errorText}>{error || 'Form not found'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadFormData}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {formData.name}
          </Text>
          <View style={styles.placeholder} />
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.formContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{formData.name}</Text>
              {formData.description ? (
                <Text style={styles.formDescription}>{formData.description}</Text>
              ) : null}
              {formData.responseCount !== undefined && (
                <View style={styles.responseCountContainer}>
                  <Ionicons name="people" size={16} color="#666" />
                  <Text style={styles.responseCount}>
                    {formData.responseCount} response{formData.responseCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>
            
            <FlatList
              data={formData.fields}
              renderItem={renderField}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              style={styles.fieldsList}
            />
            
            <View style={styles.formFooter}>
              <Text style={styles.footerText}>
                This is a preview of your form. To edit or manage responses, use the form builder.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  closeButton: {
    padding: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginHorizontal: 16,
  },
  placeholder: {
    width: 40,
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
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
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
  content: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
  },
  formHeader: {
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  formDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    marginBottom: 12,
  },
  responseCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  responseCount: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  fieldsList: {
    marginBottom: 24,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldIcon: {
    marginRight: 8,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  required: {
    color: '#FF3B30',
  },
  fieldPreview: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  inputPreview: {
    padding: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  textareaPreview: {
    padding: 12,
    minHeight: 80,
    justifyContent: 'center',
  },
  selectPreview: {
    padding: 12,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkboxPreview: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
  },
  formFooter: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
