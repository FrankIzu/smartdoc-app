import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';
import { useAuth } from '../context/auth';

interface Bookmark {
  id: number;
  name: string;
  description?: string;
  color: string;
  file_count: number;
  created_at: string;
  is_active: boolean;
}

export default function ManageBookmarksScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBookmarkName, setNewBookmarkName] = useState('');
  const [newBookmarkDescription, setNewBookmarkDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('#007AFF');

  const bookmarkColors = [
    '#007AFF', '#34C759', '#FF9500', '#FF3B30', 
    '#AF52DE', '#5856D6', '#8E44AD', '#E74C3C'
  ];

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getBookmarks();
      
      if (response.success && response.data) {
        const bookmarksData = Array.isArray(response.data) 
          ? response.data 
          : (response.data.bookmarks || []);
        
        console.log('✅ Loaded bookmarks:', bookmarksData.length);
        setBookmarks(bookmarksData);
      } else {
        console.log('❌ No bookmarks found:', response);
        setBookmarks([]);
      }
    } catch (error) {
      console.error('❌ Failed to load bookmarks:', error);
      setBookmarks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBookmarks();
  };

  const handleCreateBookmark = async () => {
    if (!newBookmarkName.trim()) {
      Alert.alert('Error', 'Please enter a bookmark name');
      return;
    }

    try {
      const response = await apiClient.createBookmark({
        name: newBookmarkName.trim(),
        description: newBookmarkDescription.trim() || undefined,
        color: selectedColor
      });

      if (response.success) {
        Alert.alert('Success', 'Bookmark created successfully!');
        setShowCreateModal(false);
        setNewBookmarkName('');
        setNewBookmarkDescription('');
        setSelectedColor('#007AFF');
        loadBookmarks();
      } else {
        Alert.alert('Error', response.message || 'Failed to create bookmark');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create bookmark');
    }
  };

  const handleDeleteBookmark = (bookmark: Bookmark) => {
    Alert.alert(
      'Delete Bookmark',
      `Are you sure you want to delete "${bookmark.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiClient.deleteBookmark(bookmark.id);
              if (response.success) {
                Alert.alert('Success', 'Bookmark deleted successfully!');
                loadBookmarks();
              } else {
                Alert.alert('Error', response.message || 'Failed to delete bookmark');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete bookmark');
            }
          }
        }
      ]
    );
  };

  const handleBookmarkPress = (bookmark: Bookmark) => {
    router.push({
      pathname: '/bookmarks/detail',
      params: { id: bookmark.id.toString() }
    });
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
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
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    addButton: {
      padding: 4,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 8,
      color: colors.textSecondary,
    },
    content: {
      flex: 1,
      padding: 16,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 64,
    },
    emptyStateTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyStateDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    createFirstButton: {
      backgroundColor: '#007AFF',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
    },
    createFirstButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    bookmarkCard: {
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    bookmarkHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    bookmarkActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 'auto',
    },
    chevron: {
      marginLeft: 8,
    },
    bookmarkColorIndicator: {
      width: 16,
      height: 16,
      borderRadius: 8,
      marginRight: 12,
    },
    bookmarkInfo: {
      flex: 1,
    },
    bookmarkName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    bookmarkDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    bookmarkMeta: {
      fontSize: 12,
      color: colors.textLight,
    },
    deleteButton: {
      padding: 8,
    },
    modalOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    modalContainer: {
      backgroundColor: colors.card,
      borderRadius: 12,
      width: '100%',
      maxWidth: 400,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    modalContent: {
      padding: 12,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
      marginTop: 8,
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    textArea: {
      height: 60,
      textAlignVertical: 'top',
    },
    colorPicker: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    colorOption: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    selectedColorOption: {
      borderColor: colors.text,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    cancelButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    createButton: {
      backgroundColor: '#007AFF',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    createButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
  }), [colors]);

  const renderBookmarkItem = ({ item }: { item: Bookmark }) => (
    <TouchableOpacity 
      style={dynamicStyles.bookmarkCard}
      onPress={() => handleBookmarkPress(item)}
    >
      <View style={dynamicStyles.bookmarkHeader}>
        <View style={[dynamicStyles.bookmarkColorIndicator, { backgroundColor: item.color }]} />
        <View style={dynamicStyles.bookmarkInfo}>
          <Text style={dynamicStyles.bookmarkName}>{item.name}</Text>
          {item.description && (
            <Text style={dynamicStyles.bookmarkDescription}>{item.description}</Text>
          )}
          <Text style={dynamicStyles.bookmarkMeta}>
            {item.file_count} file{item.file_count !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={dynamicStyles.bookmarkActions}>
          <TouchableOpacity
            style={dynamicStyles.deleteButton}
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteBookmark(item);
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={20} color={colors.textLight} style={dynamicStyles.chevron} />
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderColorOption = (color: string) => (
    <TouchableOpacity
      key={color}
      style={[
        dynamicStyles.colorOption,
        { backgroundColor: color },
        selectedColor === color && dynamicStyles.selectedColorOption
      ]}
      onPress={() => setSelectedColor(color)}
    >
      {selectedColor === color && (
        <Ionicons name="checkmark" size={16} color="#fff" />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>Bookmarks</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading bookmarks...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Manage Bookmarks</Text>
        <TouchableOpacity
          style={dynamicStyles.addButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={dynamicStyles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {bookmarks.length === 0 ? (
          <View style={dynamicStyles.emptyState}>
            <Ionicons name="bookmark-outline" size={64} color={colors.textLight} />
            <Text style={dynamicStyles.emptyStateTitle}>No bookmarks yet</Text>
            <Text style={dynamicStyles.emptyStateDescription}>
              Create your first bookmark to organize your documents
            </Text>
            <TouchableOpacity
              style={dynamicStyles.createFirstButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={dynamicStyles.createFirstButtonText}>Create Bookmark</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={bookmarks}
            renderItem={renderBookmarkItem}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ScrollView>

      {/* Create Bookmark Modal */}
      {showCreateModal && (
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalContainer}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={dynamicStyles.modalTitle}>Create Bookmark</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={dynamicStyles.modalContent}>
              <Text style={[dynamicStyles.inputLabel, { marginTop: 0 }]}>Name *</Text>
              <TextInput
                style={dynamicStyles.textInput}
                value={newBookmarkName}
                onChangeText={setNewBookmarkName}
                placeholder="Enter bookmark name"
                placeholderTextColor={colors.textLight}
              />

              <Text style={dynamicStyles.inputLabel}>Description</Text>
              <TextInput
                style={[dynamicStyles.textInput, dynamicStyles.textArea]}
                value={newBookmarkDescription}
                onChangeText={setNewBookmarkDescription}
                placeholder="Enter description (optional)"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={3}
              />

              <Text style={dynamicStyles.inputLabel}>Color</Text>
              <View style={dynamicStyles.colorPicker}>
                {bookmarkColors.map(renderColorOption)}
              </View>
            </View>

            <View style={dynamicStyles.modalActions}>
              <TouchableOpacity
                style={dynamicStyles.cancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={dynamicStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dynamicStyles.createButton}
                onPress={handleCreateBookmark}
              >
                <Text style={dynamicStyles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

