import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';

export default function CreateWorkspaceScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (text: string) => {
    setName(text);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(text));
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Workspace name is required');
      return;
    }

    if (!slug.trim()) {
      Alert.alert('Error', 'Workspace slug is required');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.createWorkspace({
        name: name.trim(),
        description: description.trim() || undefined,
        slug: slug.trim(),
      });

      if (response.success) {
        Alert.alert('Success', 'Workspace created successfully', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('Error', response.message || 'Failed to create workspace');
      }
    } catch (error: any) {
      console.error('Create workspace error:', error);
      Alert.alert('Error', error.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Workspace</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={loading || !name.trim() || !slug.trim()}
          style={[
            styles.saveButton,
            (loading || !name.trim() || !slug.trim()) && styles.saveButtonDisabled
          ]}
        >
          <Text style={[
            styles.saveButtonText,
            (loading || !name.trim() || !slug.trim()) && styles.saveButtonTextDisabled
          ]}>
            {loading ? 'Creating...' : 'Create'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workspace Details</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Workspace Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={handleNameChange}
                placeholder="Enter workspace name"
                placeholderTextColor="#999"
                autoCapitalize="words"
                maxLength={100}
              />
              <Text style={styles.helpText}>
                A clear, descriptive name for your workspace
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe what this workspace is for..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.helpText}>
                Optional description to help team members understand the workspace purpose
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Workspace Slug <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={slug}
                onChangeText={setSlug}
                placeholder="workspace-slug"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={50}
              />
              <Text style={styles.helpText}>
                URL-friendly identifier (lowercase, hyphens allowed). This will be used in workspace URLs.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workspace Settings</Text>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#007AFF" />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Getting Started</Text>
                <Text style={styles.infoText}>
                  After creating your workspace, you'll be able to invite team members and start collaborating on documents and forms.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#999',
  },
  content: {
    flex: 1,
  },
  form: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#FF6B6B',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  textArea: {
    height: 100,
    paddingTop: 12,
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F0F8FF',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
}); 