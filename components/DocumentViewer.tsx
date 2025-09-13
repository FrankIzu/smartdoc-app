import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { apiClient } from '../services/api';
import { secureStorage } from '../utils/storage';

interface DocumentViewerProps {
  fileId: string;
  fileName: string;
  fileType: string;
  fileCategory?: string;
  onClose: () => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Custom Image component that handles authentication by fetching image data
const AuthenticatedImage = ({ source, style, resizeMode, onError, onLoad, ...props }: any) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAuthenticatedImage = async () => {
      try {
        if (source?.uri) {
          // Get auth token
          const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
          
          if (token) {
            // Fetch image data with authentication
            const response = await fetch(source.uri, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'X-Platform': 'android'
              }
            });

            if (response.ok) {
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              setImageData(dataUrl);
            } else {
              console.error('Failed to fetch image:', response.status);
              onError?.(new Error(`Failed to load image: ${response.status}`));
            }
          } else {
            console.warn('No auth token available for image');
            onError?.(new Error('Authentication required'));
          }
        }
      } catch (error) {
        console.error('Failed to load authenticated image:', error);
        onError?.(error);
      } finally {
        setLoading(false);
      }
    };

    loadAuthenticatedImage();
  }, [source, onError]);

  if (loading) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  if (!imageData) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#666', textAlign: 'center' }}>
          Failed to load image
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageData }}
      style={style}
      resizeMode={resizeMode}
      onError={onError}
      onLoad={onLoad}
      {...props}
    />
  );
};

export default function DocumentViewer({
  fileId,
  fileName,
  fileType,
  fileCategory,
  onClose
}: DocumentViewerProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    loadFileUrl();
  }, [fileId]);

  const loadFileUrl = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // For image files containing documents, we need to get the file info first
      // then construct a preview URL that serves the image content directly
      const fileInfo = await apiClient.getFileById(parseInt(fileId));
      
      if (fileInfo.success && fileInfo.file) {
        // For now, use the download endpoint but handle it as preview
        // TODO: Use dedicated preview endpoint when available
        const previewUrl = `${API_BASE_URL}/api/v1/mobile/file/${fileId}/download`;
        
        // File loaded successfully
        
        setFileUrl(previewUrl);
        
        // For images, get dimensions with authentication
        if (isImageFile(fileType)) {
          await getImageDimensionsWithAuth(previewUrl);
        }
      } else {
        setError('Failed to load file information');
      }
    } catch (error: any) {
      console.error('Failed to load file URL:', error);
      
      // Provide more specific error messages
      if (error.response?.status === 404) {
        setError('File not found. It may have been deleted or moved.');
      } else if (error.response?.status === 401) {
        setError('Authentication required. Please log in again.');
      } else if (error.response?.status === 403) {
        setError('You do not have permission to access this file.');
      } else if (error.message?.includes('Network Error')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(`Failed to load file: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const getImageDimensionsWithAuth = async (imageUrl: string) => {
    try {
      // Get auth token for authenticated request
      const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      
      if (!token) {
        console.warn('No auth token available for image dimensions');
        setImageDimensions({ width: 300, height: 400 });
        return;
      }

      // Make authenticated request to get image data
      const response = await fetch(imageUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Platform': 'android'
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });

        // Use React Native's Image.getSize to get dimensions from data URL
        Image.getSize(dataUrl, (width, height) => {
          setImageDimensions({ width, height });
        }, (error) => {
          console.warn('Failed to get image dimensions from data URL:', error);
          setImageDimensions({ width: 300, height: 400 });
        });
      } else {
        console.warn('Failed to get image data:', response.status);
        setImageDimensions({ width: 300, height: 400 });
      }
    } catch (error) {
      console.warn('Failed to get image dimensions with auth:', error);
      setImageDimensions({ width: 300, height: 400 });
    }
  };

  const isImageFile = (type: string) => {
    const isImage = type === 'image' || 
           type.includes('image/') || 
           fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);
    
    return isImage;
  };

  const isDocumentImage = (type: string, category?: string) => {
    // Check if this is an image file that contains a document (scanned document, receipt, etc.)
    return isImageFile(type) && (
      category?.toLowerCase().includes('document') ||
      category?.toLowerCase().includes('receipt') ||
      category?.toLowerCase().includes('invoice') ||
      category?.toLowerCase().includes('contract') ||
      fileName.toLowerCase().match(/(receipt|invoice|contract|document|scan)/)
    );
  };

  const getViewerTitle = () => {
    if (isDocumentImage(fileType, fileCategory)) {
      return 'Document Preview';
    }
    
    switch (fileType) {
      case 'doc':
        return 'Word Document';
      case 'pdf':
        return 'PDF Document';
      case 'image':
        return 'Image Viewer';
      default:
        return 'Document Viewer';
    }
  };

  const isPdfFile = (type: string) => {
    return type === 'pdf' || 
           type.includes('pdf') || 
           fileName.toLowerCase().endsWith('.pdf');
  };

  const renderImage = () => {
    if (!fileUrl) return null;

    const maxWidth = screenWidth - 32;
    const maxHeight = screenHeight - 200;

    let imageWidth = maxWidth;
    let imageHeight = maxHeight;

    if (imageDimensions) {
      const aspectRatio = imageDimensions.width / imageDimensions.height;
      if (aspectRatio > maxWidth / maxHeight) {
        imageWidth = maxWidth;
        imageHeight = maxWidth / aspectRatio;
      } else {
        imageHeight = maxHeight;
        imageWidth = maxHeight * aspectRatio;
      }
    }

    return (
      <ScrollView 
        style={styles.imageContainer}
        contentContainerStyle={styles.imageScrollContent}
        maximumZoomScale={3}
        minimumZoomScale={1}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <AuthenticatedImage
          source={{ uri: fileUrl }}
          style={[
            styles.image,
            {
              width: imageWidth,
              height: imageHeight,
            }
          ]}
          resizeMode="contain"
          onError={(error) => {
            console.error('Image load error:', error);
            setError('Failed to load image. The file may be corrupted or in an unsupported format.');
          }}
          onLoad={() => {
            console.log('Image loaded successfully');
          }}
        />
      </ScrollView>
    );
  };

  const renderPdf = () => {
    return (
      <View style={styles.placeholderContainer}>
        <Ionicons name="document-text" size={64} color="#007AFF" />
        <Text style={styles.placeholderText}>PDF Document</Text>
        <Text style={styles.placeholderSubtext}>
          {fileName}{'\n'}
          PDF viewing will be implemented with a dedicated PDF library.
        </Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[styles.downloadButton, styles.primaryButton]}
            onPress={() => {
              if (fileUrl) {
                // Open PDF in external viewer
                Alert.alert(
                  'Open PDF',
                  'Would you like to open this PDF in an external viewer?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open', onPress: () => {
                      // In a real app, you would use Linking.openURL or a PDF viewer library
                      Alert.alert('Info', 'PDF viewer integration would open the file here');
                    }}
                  ]
                );
              }
            }}
          >
            <Ionicons name="eye" size={20} color="#fff" />
            <Text style={styles.downloadButtonText}>View PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.downloadButton, styles.secondaryButton]}
            onPress={() => {
              if (fileUrl) {
                Alert.alert('Download', 'PDF download functionality would be implemented here');
              }
            }}
          >
            <Ionicons name="download" size={20} color="#007AFF" />
            <Text style={[styles.downloadButtonText, { color: '#007AFF' }]}>Download</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderOtherDocument = () => {
    const getDocumentIcon = () => {
      switch (fileType) {
        case 'doc':
          return 'document-text';
        case 'pdf':
          return 'document';
        case 'image':
          return 'image';
        default:
          return 'document-text-outline';
      }
    };

    const getDocumentTitle = () => {
      switch (fileType) {
        case 'doc':
          return 'Word Document';
        case 'pdf':
          return 'PDF Document';
        case 'image':
          return 'Image File';
        default:
          return 'Document';
      }
    };

    const getDocumentDescription = () => {
      switch (fileType) {
        case 'doc':
          return 'Microsoft Word document. You can view the content or download the file.';
        case 'pdf':
          return 'PDF document. You can view the content or download the file.';
        case 'image':
          return 'Image file. You can view the image or download it.';
        default:
          return 'Document file. You can view the content or download the file.';
      }
    };

    // For images, show the image directly instead of buttons
    if (fileType === 'image' && fileUrl) {
      return renderImage();
    }

    return (
      <View style={styles.placeholderContainer}>
        <Ionicons name={getDocumentIcon() as any} size={64} color="#007AFF" />
        <Text style={styles.placeholderText}>{getDocumentTitle()}</Text>
        <Text style={styles.placeholderSubtext}>
          {fileName}{'\n'}
          {getDocumentDescription()}
        </Text>
        {fileUrl && (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.downloadButton, styles.primaryButton]}
              onPress={() => {
                Alert.alert(
                  'View Document',
                  `Would you like to view this ${fileType} document?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'View', onPress: () => {
                      // In a real app, you would integrate with appropriate viewers
                      Alert.alert('Info', `${fileType.toUpperCase()} viewer integration would open the file here`);
                    }}
                  ]
                );
              }}
            >
              <Ionicons name="eye" size={20} color="#fff" />
              <Text style={styles.downloadButtonText}>View Document</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.downloadButton, styles.secondaryButton]}
              onPress={() => {
                Alert.alert('Download', 'File download functionality would be implemented here');
              }}
            >
              <Ionicons name="download" size={20} color="#007AFF" />
              <Text style={[styles.downloadButtonText, { color: '#007AFF' }]}>Download</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading file...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFileUrl}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isImage = isImageFile(fileType);
    const isPdf = isPdfFile(fileType);

    if (isImage) {
      return renderImage();
    } else if (isPdf) {
      return renderPdf();
    } else {
      return renderOtherDocument();
    }
  };

  // DocumentViewer rendering

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {getViewerTitle()}
          </Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.content}>
          {renderContent()}
        </View>
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
  content: {
    flex: 1,
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
  imageContainer: {
    flex: 1,
  },
  imageScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  image: {
    backgroundColor: '#f8f9fa',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  placeholderText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    marginBottom: 24,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
