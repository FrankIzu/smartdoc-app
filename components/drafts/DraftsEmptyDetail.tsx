import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDraftsSplit } from '../../contexts/DraftsSplitContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { draftsCache } from '../../utils/draftsCache';
import { useAuth } from '../../app/context/auth';

export default function DraftsEmptyDetail() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const { createAndOpenNewDraft } = useDraftsSplit();
  const [creating, setCreating] = useState(false);
  const accentColor = colors.primary || '#007AFF';

  const handleNewNote = async () => {
    if (creating || !user?.id) return;
    setCreating(true);
    try {
      const cached = (await draftsCache.getDraftsList(user.id)) || [];
      await createAndOpenNewDraft(cached);
    } finally {
      setCreating(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 32,
    },
    icon: { marginBottom: 16 },
    title: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 28,
      lineHeight: 22,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: accentColor,
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 22,
      gap: 6,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });

  return (
    <View style={styles.container}>
      <Ionicons name="document-text-outline" size={64} color={colors.textSecondary} style={styles.icon} />
      <Text style={styles.title}>Select a note</Text>
      <Text style={styles.subtitle}>Choose a note from the list or create a new one.</Text>
      <TouchableOpacity style={styles.button} onPress={handleNewNote} disabled={creating}>
        {creating ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.buttonText}>New Note</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}
