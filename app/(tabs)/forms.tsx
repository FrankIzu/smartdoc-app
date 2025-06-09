import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient, Form as ApiForm, FormField } from '../../services/api';
import { useAuth } from '../context/auth';

interface FormTemplate {
  id: string;
  name: string;
  description: string;
  fields: FormFieldLocal[];
  isPublic: boolean;
  responses: number;
  createdDate: Date;
  category: string;
}

interface FormFieldLocal {
  id: string;
  type: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date';
  label: string;
  required: boolean;
  options?: string[];
}

export default function FormsScreen() {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormTemplate[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedForm, setSelectedForm] = useState<FormTemplate | null>(null);
  const [newFormName, setNewFormName] = useState('');
  const [newFormDescription, setNewFormDescription] = useState('');
  const [newFormFields, setNewFormFields] = useState<FormFieldLocal[]>([]);
  const [loading, setLoading] = useState(true);

  const loadForms = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getForms();
      
      if (response.success && response.forms && Array.isArray(response.forms)) {
        const transformedForms: FormTemplate[] = response.forms.map((form: ApiForm) => ({
          id: form.id.toString(),
          name: form.name,
          description: form.description || '',
          fields: (form.fields && Array.isArray(form.fields)) ? form.fields.map((field: FormField) => ({
            id: field.id,
            type: field.type,
            label: field.label,
            required: field.required || false,
            options: field.options,
          })) : [],
          isPublic: form.is_public,
          responses: form.response_count || 0,
          createdDate: new Date(form.created_at),
          category: form.category || 'General',
        }));
        setForms(transformedForms);
      } else {
        console.warn('No forms in response or response failed:', response);
        setForms([]);
      }
    } catch (error) {
      console.error('Failed to load forms:', error);
      Alert.alert('Error', 'Failed to load forms. Please try again.');
      setForms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadForms();
    }
  }, [user]);

  const getFieldTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return 'text';
      case 'email': return 'mail';
      case 'number': return 'calculator';
      case 'textarea': return 'document-text';
      case 'select': return 'list';
      case 'checkbox': return 'checkbox';
      case 'date': return 'calendar';
      default: return 'help-circle';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Customer Service': return '#34C759';
      case 'HR': return '#007AFF';
      case 'Events': return '#FF9500';
      case 'Marketing': return '#AF52DE';
      default: return '#8E8E93';
    }
  };

  const handleCreateForm = async () => {
    if (!newFormName.trim()) {
      Alert.alert('Error', 'Please enter a form name');
      return;
    }

    try {
      const response = await apiClient.createForm({
        name: newFormName,
        description: newFormDescription,
        fields: newFormFields.map(field => ({
          id: field.id,
          type: field.type,
          label: field.label,
          required: field.required,
          options: field.options,
        })),
        is_public: false,
        category: 'General',
      });

      if (response.success) {
        await loadForms(); // Reload forms
        setNewFormName('');
        setNewFormDescription('');
        setNewFormFields([]);
        setShowCreateModal(false);
        Alert.alert('Success', 'Form created successfully!');
      } else {
        throw new Error(response.message || 'Failed to create form');
      }
    } catch (error) {
      console.error('Failed to create form:', error);
      Alert.alert('Error', 'Failed to create form. Please try again.');
    }
  };

  const addField = (type: FormFieldLocal['type']) => {
    const newField: FormFieldLocal = {
      id: Date.now().toString(),
      type,
      label: `New ${type} field`,
      required: false,
    };
    setNewFormFields(prev => [...prev, newField]);
  };

  const removeField = (fieldId: string) => {
    setNewFormFields(prev => prev.filter(f => f.id !== fieldId));
  };

  const handleFormPress = (form: FormTemplate) => {
    setSelectedForm(form);
    Alert.alert(
      form.name,
      'What would you like to do?',
      [
        { text: 'View Responses', onPress: () => viewResponses(form) },
        { text: 'Share Form', onPress: () => shareForm(form) },
        { text: 'Edit Form', onPress: () => editForm(form) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const viewResponses = (form: FormTemplate) => {
    Alert.alert('Responses', `This form has ${form.responses} responses. Response viewing feature coming soon!`);
  };

  const shareForm = (form: FormTemplate) => {
    Alert.alert('Share Form', `Share link for "${form.name}" copied to clipboard!`);
  };

  const editForm = (form: FormTemplate) => {
    Alert.alert('Edit Form', `Form editing feature coming soon!`);
  };

  const renderForm = ({ item }: { item: FormTemplate }) => (
    <TouchableOpacity style={styles.formCard} onPress={() => handleFormPress(item)}>
      <View style={styles.formHeader}>
        <View style={styles.formTitleContainer}>
          <Text style={styles.formName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(item.category) }]}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        </View>
        <View style={styles.formStatus}>
          <View style={[styles.statusDot, { backgroundColor: item.isPublic ? '#34C759' : '#FF9500' }]} />
          <Text style={styles.statusText}>{item.isPublic ? 'Public' : 'Private'}</Text>
        </View>
      </View>

      <Text style={styles.formDescription} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.formStats}>
        <View style={styles.stat}>
          <Ionicons name="list" size={16} color="#666" />
          <Text style={styles.statText}>{item.fields.length} fields</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="people" size={16} color="#666" />
          <Text style={styles.statText}>{item.responses} responses</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="calendar" size={16} color="#666" />
          <Text style={styles.statText}>{item.createdDate.toLocaleDateString()}</Text>
        </View>
      </View>

      <View style={styles.formFields}>
        {item.fields.slice(0, 3).map((field, index) => (
          <View key={field.id} style={styles.fieldPreview}>
            <Ionicons name={getFieldTypeIcon(field.type) as any} size={12} color="#666" />
            <Text style={styles.fieldPreviewText}>{field.label}</Text>
            {field.required && <Text style={styles.requiredIndicator}>*</Text>}
          </View>
        ))}
        {item.fields.length > 3 && (
          <Text style={styles.moreFields}>+{item.fields.length - 3} more</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderFieldBuilder = ({ item, index }: { item: FormField; index: number }) => (
    <View style={styles.fieldBuilderItem}>
      <View style={styles.fieldBuilderHeader}>
        <Ionicons name={getFieldTypeIcon(item.type) as any} size={20} color="#007AFF" />
        <TextInput
          style={styles.fieldLabelInput}
          value={item.label}
          onChangeText={(text) => {
            const updatedFields = [...newFormFields];
            updatedFields[index].label = text;
            setNewFormFields(updatedFields);
          }}
          placeholder="Field label"
        />
        <TouchableOpacity onPress={() => removeField(item.id)}>
          <Ionicons name="trash" size={20} color="#FF3B30" />
        </TouchableOpacity>
      </View>
      <View style={styles.fieldBuilderOptions}>
        <View style={styles.requiredToggle}>
          <Text style={styles.requiredLabel}>Required</Text>
          <Switch
            value={item.required}
            onValueChange={(value) => {
              const updatedFields = [...newFormFields];
              updatedFields[index].required = value;
              setNewFormFields(updatedFields);
            }}
          />
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Forms & Templates</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{forms.length}</Text>
          <Text style={styles.statLabel}>Total Forms</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{forms.reduce((sum, form) => sum + form.responses, 0)}</Text>
          <Text style={styles.statLabel}>Total Responses</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{forms.filter(f => f.isPublic).length}</Text>
          <Text style={styles.statLabel}>Public Forms</Text>
        </View>
      </View>

      {/* Forms List */}
      <FlatList
        data={forms}
        renderItem={renderForm}
        keyExtractor={(item) => item.id}
        style={styles.formsList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No forms yet</Text>
            <Text style={styles.emptySubtext}>Create your first form to get started</Text>
          </View>
        }
      />

      {/* Create Form Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Form</Text>
            <TouchableOpacity onPress={handleCreateForm}>
              <Text style={styles.saveButton}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Form Details</Text>
              <TextInput
                style={styles.input}
                placeholder="Form name"
                value={newFormName}
                onChangeText={setNewFormName}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Form description"
                value={newFormDescription}
                onChangeText={setNewFormDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.formSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Form Fields</Text>
                <TouchableOpacity
                  style={styles.addFieldButton}
                  onPress={() => {
                    Alert.alert('Add Field', 'Choose field type:', [
                      { text: 'Text', onPress: () => addField('text') },
                      { text: 'Email', onPress: () => addField('email') },
                      { text: 'Number', onPress: () => addField('number') },
                      { text: 'Text Area', onPress: () => addField('textarea') },
                      { text: 'Select', onPress: () => addField('select') },
                      { text: 'Checkbox', onPress: () => addField('checkbox') },
                      { text: 'Date', onPress: () => addField('date') },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                >
                  <Ionicons name="add" size={20} color="#007AFF" />
                  <Text style={styles.addFieldText}>Add Field</Text>
                </TouchableOpacity>
              </View>

              {newFormFields.map((field, index) => (
                <View key={field.id}>
                  {renderFieldBuilder({ item: field, index })}
                </View>
              ))}

              {newFormFields.length === 0 && (
                <View style={styles.noFieldsContainer}>
                  <Text style={styles.noFieldsText}>No fields added yet</Text>
                  <Text style={styles.noFieldsSubtext}>Tap "Add Field" to get started</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  createButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  formsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  formTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  formName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  formStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#666',
  },
  formDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  formStats: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  formFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fieldPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fieldPreviewText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
  },
  requiredIndicator: {
    fontSize: 11,
    color: '#FF3B30',
    marginLeft: 2,
  },
  moreFields: {
    fontSize: 11,
    color: '#007AFF',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#666',
  },
  saveButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  formSection: {
    marginBottom: 24,
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
    color: '#333',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  addFieldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  addFieldText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 4,
    fontWeight: '500',
  },
  fieldBuilderItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  fieldBuilderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabelInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
    marginRight: 8,
  },
  fieldBuilderOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requiredToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requiredLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  noFieldsContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noFieldsText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  noFieldsSubtext: {
    fontSize: 14,
    color: '#999',
  },
}); 