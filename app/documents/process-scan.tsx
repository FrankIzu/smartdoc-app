import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProcessScanScreen() {
  const router = useRouter();
  const { imageUri } = useLocalSearchParams();
  const [processing, setProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState(imageUri);
  const [enhancementLevel, setEnhancementLevel] = useState('auto');

  // Check if imageUri is valid
  React.useEffect(() => {
    if (!imageUri) {
      Alert.alert(
        'No Image',
        'No image was provided. Please scan or select an image first.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  }, [imageUri]);

  const handleClose = () => {
    if (processing) {
      Alert.alert('Processing', 'Image is being processed. Are you sure you want to cancel?', [
        { text: 'Continue', style: 'cancel' },
        { text: 'Cancel', style: 'destructive', onPress: () => router.back() }
      ]);
    } else {
      router.back();
    }
  };

  const applyEnhancement = async (level: string) => {
    if (processing || level === enhancementLevel) return;

    setProcessing(true);
    setEnhancementLevel(level);

    try {
      // For now, just simulate processing without actual image manipulation
      // expo-image-manipulator doesn't support contrast/brightness filters
      // You would need to use a different library like react-native-image-filter-kit
      // or implement server-side image processing
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate processing
      
      // For demo purposes, we'll just use the original image
      setCurrentImage(imageUri as string);
    } catch (error) {
      console.error('Error processing image:', error);
      Alert.alert('Error', 'Failed to process image. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const saveDocument = async () => {
    if (processing) return;
    
    setProcessing(true);
    
    // Import fileStore immediately
    const { useFileStore } = await import('../../stores/fileStore');
    const fileStore = useFileStore.getState();
    
    // Prepare file info for optimistic pending
    let fileToUpload = {
      uri: currentImage as string,
      name: `scanned_document_${Date.now()}.jpg`,
      type: 'image/jpeg',
    };

    // Convert HEIC to PNG before upload if needed (do this first)
    try {
      const { convertHeicToPng } = await import('../../utils/imageConversion');
      fileToUpload = await convertHeicToPng(fileToUpload);
    } catch (conversionError) {
      console.warn('HEIC conversion failed, continuing with original:', conversionError);
    }
    
    // Navigate to Files tab (user will see file when it appears from API)
    router.replace('/(tabs)/documents');
    
    // Upload in background (non-blocking)
    (async () => {
      try {
        console.log('📤 Starting background upload for:', fileToUpload.name);
        
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', {
          uri: fileToUpload.uri,
          type: fileToUpload.type,
          name: fileToUpload.name,
        } as any);

        // Import API client and upload the file
        const { apiClient } = await import('../../services/api');
        
        console.log('📤 Uploading scanned document in background...');
        const uploadResult = await apiClient.uploadFile(formData, (progress) => {
          console.log('📤 Upload progress:', progress);
        });

        console.log('✅ Scanned document upload successful:', uploadResult);
        
        // Mark upload time so Files screen knows to refresh
        fileStore.setLastUploadTime(Date.now());
        
        // Trigger refresh of files list to show the real file
        setTimeout(() => {
          fileStore.fetchFiles(1);
        }, 500);
        
      } catch (error) {
        console.error('❌ Error uploading document:', error);
        Alert.alert('Upload Failed', 'Failed to upload document. Please try again.');
      }
    })();
    
    // Reset processing state (upload is now in background)
    setProcessing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable 
          onPress={handleClose} 
          style={[styles.headerButton, processing && styles.disabledButton]}
          disabled={processing}
        >
          <MaterialIcons name="close" size={24} color={processing ? "#ccc" : "#007AFF"} />
        </Pressable>
        <Text style={styles.title}>Process Document</Text>
        <Pressable 
          onPress={saveDocument} 
          style={[styles.headerButton, processing && styles.disabledButton]}
          disabled={processing}
        >
          <MaterialIcons name="check" size={24} color={processing ? "#ccc" : "#007AFF"} />
        </Pressable>
      </View>

      <View style={styles.imageContainer}>
        {processing ? (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        ) : null}
        <ExpoImage
          source={{ uri: currentImage as string }}
          style={styles.image}
          contentFit="contain"
          onError={(error) => {
            console.error('Image load error:', error);
            Alert.alert(
              'Error', 
              'Failed to load image. Please try scanning again.',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          }}
        />
      </View>

      <View style={styles.controls}>
        <Text style={styles.controlsTitle}>Enhancement</Text>
        <View style={styles.enhancementOptions}>
          <Pressable
            style={[
              styles.enhancementButton,
              enhancementLevel === 'auto' && styles.enhancementButtonActive,
              processing && styles.enhancementButtonDisabled,
            ]}
            onPress={() => applyEnhancement('auto')}
            disabled={processing}
          >
            <MaterialIcons
              name="auto-fix-high"
              size={24}
              color={processing ? '#ccc' : (enhancementLevel === 'auto' ? '#fff' : '#333')}
            />
            <Text
              style={[
                styles.enhancementText,
                enhancementLevel === 'auto' && styles.enhancementTextActive,
                processing && styles.enhancementTextDisabled,
              ]}
            >
              Auto
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.enhancementButton,
              enhancementLevel === 'high_contrast' && styles.enhancementButtonActive,
              processing && styles.enhancementButtonDisabled,
            ]}
            onPress={() => applyEnhancement('high_contrast')}
            disabled={processing}
          >
            <MaterialIcons
              name="contrast"
              size={24}
              color={processing ? '#ccc' : (enhancementLevel === 'high_contrast' ? '#fff' : '#333')}
            />
            <Text
              style={[
                styles.enhancementText,
                enhancementLevel === 'high_contrast' && styles.enhancementTextActive,
                processing && styles.enhancementTextDisabled,
              ]}
            >
              High Contrast
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.enhancementButton,
              enhancementLevel === 'black_white' && styles.enhancementButtonActive,
              processing && styles.enhancementButtonDisabled,
            ]}
            onPress={() => applyEnhancement('black_white')}
            disabled={processing}
          >
            <MaterialIcons
              name="filter-b-and-w"
              size={24}
              color={processing ? '#ccc' : (enhancementLevel === 'black_white' ? '#fff' : '#333')}
            />
            <Text
              style={[
                styles.enhancementText,
                enhancementLevel === 'black_white' && styles.enhancementTextActive,
                processing && styles.enhancementTextDisabled,
              ]}
            >
              B&W
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  image: {
    flex: 1,
    backgroundColor: '#000',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  processingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  controls: {
    padding: 16,
    backgroundColor: '#fff',
  },
  controlsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  enhancementOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  enhancementButton: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    minWidth: 100,
  },
  enhancementButtonActive: {
    backgroundColor: '#007AFF',
  },
  enhancementButtonDisabled: {
    backgroundColor: '#ccc',
  },
  enhancementText: {
    marginTop: 4,
    fontSize: 12,
    color: '#333',
  },
  enhancementTextActive: {
    color: '#fff',
  },
  enhancementTextDisabled: {
    color: '#ccc',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
}); 