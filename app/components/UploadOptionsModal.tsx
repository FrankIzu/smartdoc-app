import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';

export type UploadOptionsModalProps = {
  visible: boolean;
  isUploading: boolean;
  onDismiss: () => void;
  onFiles: () => void;
  onCamera: () => void;
  onGallery: () => void;
  onLink: () => void;
};

/**
 * Same upload sheet as the home dashboard (Files, Camera, Gallery, Upload by Link).
 */
export function UploadOptionsModal({
  visible,
  isUploading,
  onDismiss,
  onFiles,
  onCamera,
  onGallery,
  onLink,
}: UploadOptionsModalProps) {
  const colors = useThemeColors();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
        },
        uploadOptionsContainer: {
          backgroundColor: colors.card,
          borderRadius: 20,
          width: '90%',
          maxWidth: 400,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 10,
        },
        uploadOptionsHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        uploadOptionsTitle: {
          fontSize: 20,
          fontWeight: '700',
          color: colors.text,
        },
        uploadOptionsContent: {
          padding: 16,
        },
        uploadOption: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        uploadOptionDisabled: {
          opacity: 0.5,
        },
        uploadOptionIcon: {
          width: 40,
          height: 40,
          borderRadius: 20,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 12,
        },
        uploadOptionText: {
          flex: 1,
          marginRight: 10,
        },
        uploadOptionTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.text,
        },
        uploadOptionSubtitle: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: 2,
        },
      }),
    [colors]
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => {
          onDismiss();
        }}
      >
        <TouchableOpacity style={styles.uploadOptionsContainer} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.uploadOptionsHeader}>
            <Text style={styles.uploadOptionsTitle}>Upload</Text>
            <TouchableOpacity
              onPress={onDismiss}
              accessibilityLabel="Close upload options"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.uploadOptionsContent}>
            <TouchableOpacity
              style={[styles.uploadOption, isUploading && styles.uploadOptionDisabled]}
              onPress={onFiles}
              disabled={isUploading}
            >
              <View style={[styles.uploadOptionIcon, { backgroundColor: '#007AFF' }]}>
                <Ionicons name="document" size={24} color="#fff" />
              </View>
              <View style={styles.uploadOptionText}>
                <Text style={styles.uploadOptionTitle}>Files</Text>
                <Text style={styles.uploadOptionSubtitle}>Upload from your device</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadOption} onPress={onCamera}>
              <View style={[styles.uploadOptionIcon, { backgroundColor: '#FF9500' }]}>
                <Ionicons name="camera" size={24} color="#fff" />
              </View>
              <View style={styles.uploadOptionText}>
                <Text style={styles.uploadOptionTitle}>Camera</Text>
                <Text style={styles.uploadOptionSubtitle}>Take a photo or scan document</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.uploadOption, isUploading && styles.uploadOptionDisabled]}
              onPress={onGallery}
              disabled={isUploading}
            >
              <View style={[styles.uploadOptionIcon, { backgroundColor: '#5856D6' }]}>
                <Ionicons name="images" size={24} color="#fff" />
              </View>
              <View style={styles.uploadOptionText}>
                <Text style={styles.uploadOptionTitle}>Images Gallery</Text>
                <Text style={styles.uploadOptionSubtitle}>Upload from your photo gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadOption} onPress={onLink}>
              <View style={[styles.uploadOptionIcon, { backgroundColor: '#34C759' }]}>
                <Ionicons name="link" size={24} color="#fff" />
              </View>
              <View style={styles.uploadOptionText}>
                <Text style={styles.uploadOptionTitle}>Upload by Link</Text>
                <Text style={styles.uploadOptionSubtitle}>Upload using an upload code</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
