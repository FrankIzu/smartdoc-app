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
import { useThemeColors } from '../hooks/useThemeColors';
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
  const colors = useThemeColors();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
      marginHorizontal: 16,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textSecondary,
    },
    errorText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 16,
      marginBottom: 24,
    },
    formTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    formDescription: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: 12,
    },
    responseCount: {
      fontSize: 14,
      color: colors.textSecondary,
      marginLeft: 6,
    },
    fieldLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    fieldPreview: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.card,
    },
    checkboxLabel: {
      fontSize: 16,
      color: colors.text,
    },
    placeholderText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    formFooter: {
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: 8,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    footerText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
  });

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
            color={colors.textSecondary} 
            style={styles.fieldIcon}
          />
          <Text style={dynamicStyles.fieldLabel}>
            {item.label}
            {item.required && <Text style={styles.required}> *</Text>}
          </Text>
        </View>
        
        <View style={dynamicStyles.fieldPreview}>
          {item.type === 'textarea' ? (
            <View style={styles.textareaPreview}>
              <Text style={dynamicStyles.placeholderText}>
                {item.placeholder || `Enter ${item.label.toLowerCase()}...`}
              </Text>
            </View>
          ) : item.type === 'select' || item.type === 'radio' ? (
            <View style={styles.selectPreview}>
              <Text style={dynamicStyles.placeholderText}>
                {item.options?.[0] || 'Select an option...'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </View>
          ) : item.type === 'checkbox' ? (
            <View style={styles.checkboxPreview}>
              <View style={styles.checkbox}>
                <Ionicons name="checkmark" size={12} color={colors.primary} />
              </View>
              <Text style={dynamicStyles.checkboxLabel}>
                {item.options?.[0] || 'Check this option'}
              </Text>
            </View>
          ) : (
            <View style={styles.inputPreview}>
              <Text style={dynamicStyles.placeholderText}>
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
        <SafeAreaView style={dynamicStyles.container} edges={['top', 'bottom', 'left', 'right']}>
          <View style={dynamicStyles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.primary} />
            </TouchableOpacity>
            <Text style={dynamicStyles.title}>Loading Form...</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={dynamicStyles.loadingText}>Loading form data...</Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  if (error || !formData) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={dynamicStyles.container} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.primary} />
            </TouchableOpacity>
            <Text style={dynamicStyles.title}>Error</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={64} color="#FF3B30" />
            <Text style={dynamicStyles.errorText}>{error || 'Form not found'}</Text>
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
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={dynamicStyles.title} numberOfLines={1}>
            {formData.name}
          </Text>
          <View style={styles.placeholder} />
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.formContainer}>
            <View style={styles.formHeader}>
              <Text style={dynamicStyles.formTitle}>{formData.name}</Text>
              {formData.description ? (
                <Text style={dynamicStyles.formDescription}>{formData.description}</Text>
              ) : null}
              {formData.responseCount !== undefined && (
                <View style={styles.responseCountContainer}>
                  <Ionicons name="people" size={16} color={colors.textSecondary} />
                  <Text style={dynamicStyles.responseCount}>
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
            
            <View style={dynamicStyles.formFooter}>
              <Text style={dynamicStyles.footerText}>
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
  // Static styles that don't need theme colors
  closeButton: {
    padding: 8,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  retryButton: {
    backgroundColor: '#007AFF', // Keep primary color
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
  responseCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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
  required: {
    color: '#FF3B30',
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
    borderColor: '#007AFF', // Keep primary color
    borderRadius: 4,
    backgroundColor: '#007AFF', // Keep primary color
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
});
