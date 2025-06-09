import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

export default function ProcessScanScreen() {
  const { imageUri } = useLocalSearchParams();
  const [processing, setProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState(imageUri);
  const [enhancementLevel, setEnhancementLevel] = useState('auto');

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
    } finally {
      setProcessing(false);
    }
  };

  const saveDocument = async () => {
    setProcessing(true);
    try {
      // Here you would typically:
      // 1. Upload the processed image to your backend
      // 2. Perform OCR if needed
      // 3. Save metadata
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate processing
      
      // Navigate back to documents screen
      router.push('/documents');
    } catch (error) {
      console.error('Error saving document:', error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <MaterialIcons name="close" size={24} color="#007AFF" />
        </Pressable>
        <Text style={styles.title}>Process Document</Text>
        <Pressable onPress={saveDocument} style={styles.headerButton}>
          <MaterialIcons name="check" size={24} color="#007AFF" />
        </Pressable>
      </View>

      <View style={styles.imageContainer}>
        {processing ? (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        ) : null}
        <Image
          source={{ uri: currentImage as string }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      <View style={styles.controls}>
        <Text style={styles.controlsTitle}>Enhancement</Text>
        <View style={styles.enhancementOptions}>
          <Pressable
            style={[
              styles.enhancementButton,
              enhancementLevel === 'auto' && styles.enhancementButtonActive,
            ]}
            onPress={() => applyEnhancement('auto')}
          >
            <MaterialIcons
              name="auto-fix-high"
              size={24}
              color={enhancementLevel === 'auto' ? '#fff' : '#333'}
            />
            <Text
              style={[
                styles.enhancementText,
                enhancementLevel === 'auto' && styles.enhancementTextActive,
              ]}
            >
              Auto
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.enhancementButton,
              enhancementLevel === 'high_contrast' && styles.enhancementButtonActive,
            ]}
            onPress={() => applyEnhancement('high_contrast')}
          >
            <MaterialIcons
              name="contrast"
              size={24}
              color={enhancementLevel === 'high_contrast' ? '#fff' : '#333'}
            />
            <Text
              style={[
                styles.enhancementText,
                enhancementLevel === 'high_contrast' && styles.enhancementTextActive,
              ]}
            >
              High Contrast
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.enhancementButton,
              enhancementLevel === 'black_white' && styles.enhancementButtonActive,
            ]}
            onPress={() => applyEnhancement('black_white')}
          >
            <MaterialIcons
              name="filter-b-and-w"
              size={24}
              color={enhancementLevel === 'black_white' ? '#fff' : '#333'}
            />
            <Text
              style={[
                styles.enhancementText,
                enhancementLevel === 'black_white' && styles.enhancementTextActive,
              ]}
            >
              B&W
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
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
  enhancementText: {
    marginTop: 4,
    fontSize: 12,
    color: '#333',
  },
  enhancementTextActive: {
    color: '#fff',
  },
}); 