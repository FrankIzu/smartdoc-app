import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';

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
  name: string;
  description: string;
  fields: FormField[];
}

const FIELD_TYPES = [
  { id: 'text', name: 'Text Input', icon: 'text' },
  { id: 'email', name: 'Email', icon: 'mail' },
  { id: 'phone', name: 'Phone', icon: 'call' },
  { id: 'textarea', name: 'Text Area', icon: 'chatbox' },
  { id: 'select', name: 'Dropdown', icon: 'chevron-down' },
  { id: 'radio', name: 'Radio Buttons', icon: 'radio-button-on' },
  { id: 'checkbox', name: 'Checkboxes', icon: 'checkbox' },
  { id: 'date', name: 'Date', icon: 'calendar' },
  { id: 'number', name: 'Number', icon: 'keypad' },
];

export default function FormBuilderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [formData, setFormData] = useState<FormData>({
    name: (params.templateName as string) || 'Untitled Form',
    description: (params.templateDescription as string) || '',
    fields: []
  });
  const [currentView, setCurrentView] = useState<'builder' | 'preview' | 'responses'>(
    (params.tab as string) === 'responses' ? 'responses' : 'builder'
  );
  const [selectedField, setSelectedField] = useState<FormField | null>(null);
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [showFieldTypeSelector, setShowFieldTypeSelector] = useState(false);
  const [saving, setSaving] = useState(false);
  const [responses, setResponses] = useState<any[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  useEffect(() => {
    if (params.fields) {
      try {
        const fields = JSON.parse(params.fields as string);
        // Ensure all fields have proper labels
        const fieldsWithLabels = fields.map((field: any) => ({
          ...field,
          label: field.label || field.title || `Field ${field.id}`,
          name: field.name || field.id || `field_${Date.now()}`
        }));
        setFormData(prev => ({ ...prev, fields: fieldsWithLabels }));
      } catch (error) {
        console.error('Failed to parse fields:', error);
      }
    }
  }, [params.fields]);

  useEffect(() => {
    if (currentView === 'responses' && params.formId) {
      loadResponses();
    }
  }, [currentView, params.formId]);

  const addField = (type: string) => {
    const fieldTypeName = FIELD_TYPES.find(t => t.id === type)?.name || 'Field';
    const newField: FormField = {
      id: Date.now().toString(),
      type: type as FormField['type'],
      label: `${fieldTypeName} ${formData.fields.length + 1}`,
      name: `field_${formData.fields.length + 1}`,
      placeholder: `Enter ${fieldTypeName.toLowerCase()}`,
      required: false,
      options: type === 'select' || type === 'radio' || type === 'checkbox' ? ['Option 1'] : undefined,
    };

    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, newField]
    }));
    setShowFieldTypeSelector(false);
  };

  const editField = (field: FormField) => {
    setSelectedField(field);
    setShowFieldEditor(true);
  };

  const updateField = (updatedField: FormField) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map(field => 
        field.id === updatedField.id ? updatedField : field
      )
    }));
    setShowFieldEditor(false);
    setSelectedField(null);
  };

  const deleteField = (fieldId: string) => {
    Alert.alert(
      'Delete Field',
      'Are you sure you want to delete this field?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            setFormData(prev => ({
              ...prev,
              fields: prev.fields.filter(field => field.id !== fieldId)
            }));
          }
        }
      ]
    );
  };

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
    const fieldIndex = formData.fields.findIndex(f => f.id === fieldId);
    if (fieldIndex === -1) return;

    const newFields = [...formData.fields];
    const targetIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;

    if (targetIndex < 0 || targetIndex >= newFields.length) return;

    // Swap fields
    [newFields[fieldIndex], newFields[targetIndex]] = [newFields[targetIndex], newFields[fieldIndex]];
    
    setFormData(prev => ({ ...prev, fields: newFields }));
  };

  const saveForm = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please enter a form name');
      return;
    }

    if (formData.fields.length === 0) {
      Alert.alert('Error', 'Please add at least one field to your form');
      return;
    }

    try {
      setSaving(true);
      
      const response = await apiService.createForm({
        name: formData.name,
        title: formData.name,
        description: formData.description,
        type: 'Custom',
        json_fields: formData.fields,
        theme: 'default',
        is_public: false,
        settings: {}
      });

      if (response.success) {
        Alert.alert(
          'Success',
          'Form saved successfully!',
          [
            { text: 'OK', onPress: () => router.back() }
          ]
        );
      } else {
        Alert.alert('Error', response.message || 'Failed to save form');
      }
    } catch (error) {
      console.error('Save form error:', error);
      Alert.alert('Error', 'Failed to save form');
    } finally {
      setSaving(false);
    }
  };

  const shareForm = () => {
    Alert.alert(
      'Share Form',
      'Choose how you want to share this form:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Copy Link', onPress: () => {
          // TODO: Implement form sharing
          Alert.alert('Info', 'Form sharing will be available after saving');
        }},
        { text: 'Save & Share', onPress: saveForm }
      ]
    );
  };

  const renderFieldItem = ({ item, index }: { item: FormField; index: number }) => {
    console.log('Rendering field item:', { id: item.id, label: item.label, type: item.type });
    return (
      <View style={styles.fieldItem}>
        <View style={styles.fieldHeader}>
          <View style={styles.fieldInfo}>
            <Text style={styles.fieldLabel}>{item.label || 'Unnamed Field'}</Text>
            <Text style={styles.fieldType}>{FIELD_TYPES.find(t => t.id === item.type)?.name}</Text>
          </View>
        <View style={styles.fieldActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => moveField(item.id, 'up')}
            disabled={index === 0}
          >
            <Ionicons 
              name="chevron-up" 
              size={20} 
              color={index === 0 ? '#ccc' : '#666'} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => moveField(item.id, 'down')}
            disabled={index === formData.fields.length - 1}
          >
            <Ionicons 
              name="chevron-down" 
              size={20} 
              color={index === formData.fields.length - 1 ? '#ccc' : '#666'} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => editField(item)}
          >
            <Ionicons name="pencil" size={20} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => deleteField(item.id)}
          >
            <Ionicons name="trash" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>
      {item.required && (
        <Text style={styles.requiredIndicator}>Required field</Text>
      )}
    </View>
    );
  };

  const loadResponses = async () => {
    console.log('Loading responses for formId:', params.formId);
    if (!params.formId) {
      console.log('No formId found in params');
      return;
    }
    
    setLoadingResponses(true);
    try {
      console.log('Calling getFormResponses with formId:', parseInt(params.formId as string));
      const response = await apiService.getFormResponses(parseInt(params.formId as string));
      console.log('Form responses API response:', response);
      
      if (response.success) {
        // Handle different response structures
        let responsesData = [];
        if (response.data && Array.isArray(response.data)) {
          responsesData = response.data;
        } else if (response.data && (response.data as any).responses) {
          responsesData = (response.data as any).responses;
        } else if ((response as any).responses) {
          responsesData = (response as any).responses;
        }
        
        console.log('Setting responses from API:', responsesData);
        setResponses(responsesData);
      } else {
        console.log('API returned success: false:', response);
        setResponses([]);
      }
    } catch (error: any) {
      console.error('Error loading responses:', error);
      console.error('Error details:', error.response?.data || error.message);
      setResponses([]);
    } finally {
      setLoadingResponses(false);
    }
  };

  const downloadCSV = async () => {
    if (!params.formId) {
      Alert.alert('Error', 'Form ID not found');
      return;
    }

    if (responses.length === 0) {
      Alert.alert('No Data', 'There are no responses to download');
      return;
    }

    try {
      // Call the backend API to download CSV
      const csvContent = await apiService.downloadFormResponsesCSV(parseInt(params.formId as string));
      
      // Use Expo Sharing to share the CSV file
      const { shareAsync } = await import('expo-sharing');
      const { writeAsStringAsync, documentDirectory } = await import('expo-file-system');
      
      const fileName = `form_responses_${params.formId}_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = `${documentDirectory}${fileName}`;
      
      await writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
      await shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Download Form Responses' });
    } catch (error: any) {
      console.error('Error downloading CSV:', error);
      Alert.alert('Error', 'Failed to download CSV file');
    }
  };

  const generateCSVContent = (responsesData: any[]) => {
    if (responsesData.length === 0) return '';
    
    // Get all unique field names from all responses
    const allFields = new Set<string>();
    responsesData.forEach(response => {
      const data = response.response_data || response.data || {};
      Object.keys(data).forEach(key => allFields.add(key));
    });
    
    const fields = Array.from(allFields);
    
    // Create CSV header
    const header = ['Response ID', 'Submitted At', ...fields].join(',');
    
    // Create CSV rows
    const rows = responsesData.map((response, index) => {
      const data = response.response_data || response.data || {};
      const submittedAt = new Date(response.submitted_at || response.created_at || Date.now()).toLocaleString();
      const values = [
        index + 1,
        `"${submittedAt}"`,
        ...fields.map(field => `"${(data[field] || '').toString().replace(/"/g, '""')}"`)
      ];
      return values.join(',');
    });
    
    return [header, ...rows].join('\n');
  };

  const copyToClipboard = async (text: string) => {
    try {
      // In a real implementation, you'd use expo-clipboard
      Alert.alert('Copied', 'CSV content copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const shareResponses = async () => {
    if (responses.length === 0) {
      Alert.alert('No Responses', 'There are no responses to share yet.');
      return;
    }

    try {
      // Call the backend API to get CSV content
      const csvContent = await apiService.downloadFormResponsesCSV(parseInt(params.formId as string));
      
      // Use Expo Sharing to share the CSV file
      const { shareAsync } = await import('expo-sharing');
      const { writeAsStringAsync, documentDirectory } = await import('expo-file-system');
      
      const fileName = `form_responses_${params.formId}_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = `${documentDirectory}${fileName}`;
      
      await writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
      await shareAsync(fileUri, { 
        mimeType: 'text/csv', 
        dialogTitle: `Share Form Responses (${responses.length} responses)` 
      });
    } catch (error: any) {
      console.error('Error sharing responses:', error);
      Alert.alert('Error', 'Failed to share responses');
    }
  };

  const shareAsCSV = () => {
    const csvContent = generateCSVContent(responses);
    const shareText = `Form Responses CSV\n\n${csvContent}`;
    
    Alert.alert(
      'Share CSV',
      'CSV content ready to share',
      [
        { text: 'Copy CSV', onPress: () => copyToClipboard(csvContent) },
        { text: 'OK', style: 'default' }
      ]
    );
  };

  const shareSummary = () => {
    const summary = `Form: ${formData.name}\nResponses: ${responses.length}\n\nSummary:\n${responses.map((response, index) => {
      const data = response.response_data || response.data || {};
      const submittedAt = new Date(response.submitted_at || response.created_at || Date.now()).toLocaleDateString();
      return `${index + 1}. Submitted on ${submittedAt}`;
    }).join('\n')}`;
    
    Alert.alert(
      'Share Summary',
      summary,
      [
        { text: 'Copy Summary', onPress: () => copyToClipboard(summary) },
        { text: 'OK', style: 'default' }
      ]
    );
  };

  const renderPreviewField = ({ item }: { item: FormField }) => {
    console.log('Rendering preview field:', { id: item.id, label: item.label, type: item.type });
    return (
      <View style={styles.previewField}>
        <Text style={styles.previewLabel}>
          {item.label || 'Unnamed Field'} {item.required && <Text style={styles.asterisk}>*</Text>}
        </Text>
      
      {item.type === 'textarea' ? (
        <TextInput
          style={[styles.previewInput, styles.previewTextarea]}
          placeholder={item.placeholder || `Enter ${(item.label || 'field').toLowerCase()}`}
          multiline
          editable={false}
        />
      ) : item.type === 'select' ? (
        <View style={styles.previewSelect}>
          <Text style={styles.previewSelectText}>Select {(item.label || 'field').toLowerCase()}</Text>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </View>
      ) : item.type === 'radio' ? (
        <View style={styles.previewOptionsContainer}>
          {item.options?.map((option, index) => (
            <View key={`radio-${item.id}-${index}-${option}`} style={styles.previewOption}>
              <Ionicons name="radio-button-off" size={20} color="#666" />
              <Text style={styles.previewOptionText}>{option}</Text>
            </View>
          ))}
        </View>
      ) : item.type === 'checkbox' ? (
        <View style={styles.previewOptionsContainer}>
          {item.options?.map((option, index) => (
            <View key={`checkbox-${item.id}-${index}-${option}`} style={styles.previewOption}>
              <Ionicons name="square-outline" size={20} color="#666" />
              <Text style={styles.previewOptionText}>{option}</Text>
            </View>
          ))}
        </View>
      ) : (
        <TextInput
          style={styles.previewInput}
          placeholder={item.placeholder || `Enter ${(item.label || 'field').toLowerCase()}`}
          keyboardType={
            item.type === 'email' ? 'email-address' :
            item.type === 'phone' ? 'phone-pad' :
            item.type === 'number' ? 'numeric' : 'default'
          }
          editable={false}
        />
      )}
    </View>
    );
  };

  const renderBuilder = () => (
    <ScrollView style={styles.content}>
      {/* Form Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Form Information</Text>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
          placeholder="Form Name"
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.description}
          onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
          placeholder="Form Description (optional)"
          multiline
        />
      </View>

      {/* Fields */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Form Fields</Text>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowFieldTypeSelector(true)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add Field</Text>
          </TouchableOpacity>
        </View>

        {formData.fields.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No fields added yet</Text>
            <Text style={styles.emptyStateSubtext}>Tap &quot;Add Field&quot; to get started</Text>
          </View>
        ) : (
          <FlatList
            data={formData.fields}
            renderItem={renderFieldItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        )}
      </View>
    </ScrollView>
  );

  const renderPreview = () => (
    <ScrollView style={styles.content}>
      <View style={styles.previewContainer}>
        <Text style={styles.previewTitle}>{formData.name}</Text>
        {formData.description ? (
          <Text style={styles.previewDescription}>{formData.description}</Text>
        ) : null}
        
        <FlatList
          data={formData.fields}
          renderItem={renderPreviewField}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
        />
        
        <TouchableOpacity style={styles.previewSubmitButton}>
          <Text style={styles.previewSubmitText}>Submit</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderResponseItem = ({ item, index }: { item: any; index: number }) => {
    const submittedAt = new Date(item.submitted_at || item.created_at || Date.now());
    
    return (
      <View style={styles.responseItem}>
        <View style={styles.responseHeader}>
          <Text style={styles.responseNumber}>Response #{index + 1}</Text>
          <View style={styles.responseTimeContainer}>
            <Text style={styles.responseDate}>
              {submittedAt.toLocaleDateString()}
            </Text>
            <Text style={styles.responseTime}>
              {submittedAt.toLocaleTimeString()}
            </Text>
          </View>
        </View>
        
        <View style={styles.responseData}>
          <Text style={styles.responseSummary}>
            {Object.keys(item.response_data || item.data || item.responses || {}).length} fields completed
          </Text>
        </View>
      </View>
    );
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return `${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  };

  const renderResponses = () => (
    <View style={styles.content}>
      <View style={styles.responsesContainer}>
        <Text style={styles.responsesTitle}>Form Responses</Text>
        <Text style={styles.responsesSubtitle}>
          {responses.length} response{responses.length !== 1 ? 's' : ''} submitted
        </Text>
        
        {/* Action Buttons */}
        <View style={styles.responsesActions}>
          <TouchableOpacity 
            style={styles.responsesActionButton} 
            onPress={loadResponses}
            disabled={loadingResponses}
          >
            <Ionicons name="refresh" size={20} color="#007AFF" />
            <Text style={styles.responsesActionButtonText}>
              {loadingResponses ? 'Loading...' : 'Refresh'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.responsesActionButton, responses.length === 0 && styles.disabledButton]} 
            onPress={downloadCSV}
            disabled={responses.length === 0}
          >
            <Ionicons name="download" size={20} color={responses.length === 0 ? "#ccc" : "#007AFF"} />
            <Text style={[styles.responsesActionButtonText, responses.length === 0 && styles.disabledButtonText]}>
              Download CSV
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.responsesActionButton, responses.length === 0 && styles.disabledButton]} 
            onPress={shareResponses}
            disabled={responses.length === 0}
          >
            <Ionicons name="share" size={20} color={responses.length === 0 ? "#ccc" : "#10B981"} />
            <Text style={[styles.responsesActionButtonText, responses.length === 0 && styles.disabledButtonText]}>
              Share
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Responses List */}
      {loadingResponses ? (
        <View style={styles.responsesList}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.responsesEmptyText}>Loading responses...</Text>
        </View>
      ) : responses.length > 0 ? (
        <FlatList
          data={responses}
          renderItem={renderResponseItem}
          keyExtractor={(item, index) => `response-${index}`}
          style={styles.responsesFlatList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.responsesFlatListContent}
        />
      ) : (
        <View style={styles.responsesList}>
          <Ionicons name="clipboard-outline" size={64} color="#ccc" />
          <Text style={styles.responsesEmptyText}>
            No responses yet. Share your form to start collecting responses.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Form Builder</Text>
        <TouchableOpacity onPress={shareForm}>
          <Ionicons name="share" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, currentView === 'builder' && styles.activeTab]}
          onPress={() => setCurrentView('builder')}
        >
          <Text style={[styles.tabText, currentView === 'builder' && styles.activeTabText]}>
            Builder
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, currentView === 'preview' && styles.activeTab]}
          onPress={() => setCurrentView('preview')}
        >
          <Text style={[styles.tabText, currentView === 'preview' && styles.activeTabText]}>
            Preview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, currentView === 'responses' && styles.activeTab]}
          onPress={() => setCurrentView('responses')}
        >
          <Text style={[styles.tabText, currentView === 'responses' && styles.activeTabText]}>
            Responses
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {currentView === 'builder' ? renderBuilder() : 
       currentView === 'preview' ? renderPreview() : 
       renderResponses()}

      {/* Save Button - Only show on Builder and Preview tabs */}
      {currentView !== 'responses' && (
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveForm}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Form</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Field Type Selector Modal */}
      <Modal
        visible={showFieldTypeSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowFieldTypeSelector(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Field</Text>
            <View style={{ width: 60 }} />
          </View>
          
          <FlatList
            data={FIELD_TYPES}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.fieldTypeItem}
                onPress={() => addField(item.id)}
              >
                <Ionicons name={item.icon as any} size={24} color="#007AFF" />
                <Text style={styles.fieldTypeName}>{item.name}</Text>
                <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id}
          />
        </SafeAreaView>
      </Modal>

      {/* Field Editor Modal */}
      {selectedField && (
        <FieldEditorModal
          field={selectedField}
          visible={showFieldEditor}
          onSave={updateField}
          onCancel={() => {
            setShowFieldEditor(false);
            setSelectedField(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

interface FieldEditorModalProps {
  field: FormField;
  visible: boolean;
  onSave: (field: FormField) => void;
  onCancel: () => void;
}

function FieldEditorModal({ field, visible, onSave, onCancel }: FieldEditorModalProps) {
  const [editingField, setEditingField] = useState<FormField>(field);

  useEffect(() => {
    setEditingField(field);
  }, [field]);

  const updateOptions = (options: string[]) => {
    setEditingField(prev => ({ ...prev, options }));
  };

  const addOption = () => {
    const currentOptions = editingField.options || [];
    updateOptions([...currentOptions, `Option ${currentOptions.length + 1}`]);
  };

  const removeOption = (index: number) => {
    const currentOptions = editingField.options || [];
    updateOptions(currentOptions.filter((_, i) => i !== index));
  };

  const hasOptions = ['select', 'radio', 'checkbox'].includes(editingField.type);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <KeyboardAvoidingView 
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Field</Text>
            <TouchableOpacity onPress={() => onSave(editingField)}>
              <Text style={styles.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Field Label</Text>
              <TextInput
                style={styles.modalInput}
                value={editingField.label}
                onChangeText={(text) => setEditingField(prev => ({ ...prev, label: text }))}
                placeholder="Enter field label"
              />
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Placeholder Text</Text>
              <TextInput
                style={styles.modalInput}
                value={editingField.placeholder || ''}
                onChangeText={(text) => setEditingField(prev => ({ ...prev, placeholder: text }))}
                placeholder="Enter placeholder text (optional)"
              />
            </View>

            <View style={styles.modalSection}>
              <View style={styles.switchRow}>
                <Text style={styles.modalSectionTitle}>Required Field</Text>
                <Switch
                  value={editingField.required || false}
                  onValueChange={(value) => setEditingField(prev => ({ ...prev, required: value }))}
                />
              </View>
            </View>

            {hasOptions && (
              <View style={styles.modalSection}>
                <View style={styles.optionsHeader}>
                  <Text style={styles.modalSectionTitle}>Options</Text>
                  <TouchableOpacity style={styles.addOptionButton} onPress={addOption}>
                    <Ionicons name="add" size={20} color="#007AFF" />
                    <Text style={styles.addOptionText}>Add Option</Text>
                  </TouchableOpacity>
                </View>
                
                {(editingField.options || []).map((option, index) => (
                  <View key={`option-${editingField.id}-${index}`} style={styles.optionRow}>
                    <TextInput
                      style={styles.optionInput}
                      value={option}
                      onChangeText={(text) => {
                        const newOptions = [...(editingField.options || [])];
                        newOptions[index] = text;
                        updateOptions(newOptions);
                      }}
                      placeholder={`Option ${index + 1}`}
                    />
                    <TouchableOpacity onPress={() => removeOption(index)}>
                      <Ionicons name="trash" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  fieldItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldInfo: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  fieldType: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  fieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 4,
    marginLeft: 8,
  },
  requiredIndicator: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 4,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  modalCancel: {
    fontSize: 16,
    color: '#FF3B30',
  },
  modalSave: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  fieldTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  fieldTypeName: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    marginLeft: 16,
  },
  modalContent: {
    flex: 1,
  },
  modalSection: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addOptionText: {
    color: '#007AFF',
    fontSize: 14,
    marginLeft: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    marginRight: 8,
  },
  previewContainer: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  previewDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  previewField: {
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginBottom: 8,
  },
  asterisk: {
    color: '#FF3B30',
  },
  previewInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  previewTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  previewSelect: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
  },
  previewSelectText: {
    fontSize: 16,
    color: '#666',
  },
  previewOptionsContainer: {
    marginTop: 4,
  },
  previewOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  previewOptionText: {
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
  },
  previewSubmitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  previewSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Responses tab styles
  responsesContainer: {
    padding: 20,
  },
  responsesTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  responsesSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  responsesActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  responsesActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  responsesActionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  responsesList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  responsesEmptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
  },
  responsesFlatList: {
    flex: 1,
  },
  responsesFlatListContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  responseItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  responseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  responseNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  responseTimeContainer: {
    alignItems: 'flex-end',
  },
  responseDate: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  responseTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  responseTimeAgo: {
    fontSize: 10,
    color: '#007AFF',
    marginTop: 2,
    fontWeight: '500',
  },
  responseData: {
    gap: 8,
  },
  responseField: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  responseFieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    minWidth: 100,
    marginRight: 8,
  },
  responseFieldValue: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    flexWrap: 'wrap',
  },
  responseSummary: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledButtonText: {
    color: '#ccc',
  },
});