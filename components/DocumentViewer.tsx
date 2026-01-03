import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { WebView } from 'react-native-webview';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { useThemeColors } from '../hooks/useThemeColors';
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

// Helper function to get document type name
const getDocumentTypeName = (fileName: string) => {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'doc':
    case 'docx':
      return 'Word';
    case 'xls':
    case 'xlsx':
      return 'Excel';
    case 'ppt':
    case 'pptx':
      return 'PowerPoint';
    default:
      return 'Office';
  }
};


// Authenticated WebView Component
const AuthenticatedWebView = ({ fileUrl, authToken, fileName, fileType }: { fileUrl: string; authToken: string; fileName: string; fileType: string }) => {
  const colors = useThemeColors();
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setLoading(true);
        setError(null);

        // For PDFs, use direct WebView with authenticated URL
        if (fileType === 'pdf' || fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
          console.log('Loading PDF document:', fileName);
          setLoading(false);
          // Don't set htmlContent, we'll handle PDFs differently
          return;
        } else if (fileType === 'doc' || fileType === 'docx' || fileType.includes('document') || 
                   fileName.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/)) {
          // For Office documents, automatically try to load as PDF
          console.log('Loading Office document:', fileName, 'Type:', fileType);
          setLoading(false);
          // Don't set htmlContent, we'll handle Office documents as PDFs in the WebView
          return;
        } else {
          // For text documents, try to fetch content
          const response = await fetch(fileUrl, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'X-Platform': 'android'
            }
          });

          if (response.ok) {
            const content = await response.text();
            // Convert theme colors to hex for HTML
            const bgColor = colors.isDark ? '#1c1c1e' : '#ffffff';
            const textColor = colors.isDark ? '#ffffff' : '#000000';
            const html = `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body { 
                      margin: 0; 
                      padding: 20px; 
                      font-family: Arial, sans-serif; 
                      background: ${bgColor};
                      color: ${textColor};
                      line-height: 1.6;
                    }
                    pre { 
                      white-space: pre-wrap; 
                      word-wrap: break-word; 
                      font-family: monospace;
                      color: ${textColor};
                    }
                  </style>
                </head>
                <body>
                  <pre>${content}</pre>
                </body>
              </html>
            `;
            setHtmlContent(html);
          } else {
            setError(`Failed to load document: ${response.status}`);
          }
        }
      } catch (err) {
        setError('Failed to load document');
        console.error('Document load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [fileUrl, authToken, fileType]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading document...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#FF3B30" />
        <Text style={dynamicStyles.errorText}>{error}</Text>
      </View>
    );
  }

  // For PDFs and Office documents, use direct WebView with authenticated URL
  if (fileType === 'pdf' || fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf') ||
      fileType === 'doc' || fileType === 'docx' || fileType.includes('document') || 
      fileName.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/)) {
    
    // For Office documents, automatically try to get PDF version (with conversion if needed)
    let finalUrl = fileUrl;
    if (fileType === 'doc' || fileType === 'docx' || fileType.includes('document') || 
        fileName.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/)) {
      finalUrl = fileUrl.replace('/download', '/download?pdf=true');
    }
    
    return (
      <WebView
        source={{ 
          uri: finalUrl,
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Platform': 'android'
          }
        }}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('Document WebView error:', nativeEvent);
          setError('Failed to load document');
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('Document WebView HTTP error:', nativeEvent);
          setError(`Failed to load document: HTTP ${nativeEvent.statusCode}`);
        }}
        onLoadEnd={() => {
          console.log('Document WebView loaded successfully');
        }}
        onLoadStart={() => {
          console.log('Document WebView started loading');
        }}
      />
    );
  }

  return (
    <WebView
      source={{ html: htmlContent }}
      style={styles.webView}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={false}
      onError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.error('WebView error:', nativeEvent);
        setError('Failed to load document');
      }}
      onHttpError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.error('WebView HTTP error:', nativeEvent);
        setError(`Failed to load document: HTTP ${nativeEvent.statusCode}`);
      }}
      onLoadEnd={() => {
        console.log('WebView loaded successfully');
      }}
      onLoadStart={() => {
        console.log('WebView started loading');
      }}
    />
  );
};

// Text Document Viewer Component
const TextDocumentViewer = ({ fileUrl, authToken, fileName }: { fileUrl: string; authToken: string; fileName: string }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit for text files

  useEffect(() => {
    const loadTextContent = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(fileUrl, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Platform': 'android'
          }
        });

        if (!response.ok) {
          setError(`Failed to load text content: ${response.status}`);
          return;
        }

        // Check content length before loading
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
          setError(`File is too large (${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
          return;
        }

        const text = await response.text();
        
        // Check actual size after loading
        if (text.length > MAX_FILE_SIZE) {
          setError(`File is too large (${(text.length / 1024 / 1024).toFixed(2)} MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
          return;
        }
        
        setContent(text);
      } catch (err: any) {
        console.error('Text document load error:', err);
        setError(err.message || 'Failed to load text document');
      } finally {
        setLoading(false);
      }
    };

    if (fileUrl && authToken) {
      loadTextContent();
    }
  }, [fileUrl, authToken]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading text document...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#FF3B30" />
        <Text style={dynamicStyles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={dynamicStyles.textContainer} 
      contentContainerStyle={styles.textContent}
      showsVerticalScrollIndicator={true}
    >
      <Text style={dynamicStyles.textDocument} selectable={true}>{content || '(Empty file)'}</Text>
    </ScrollView>
  );
};

export default function DocumentViewer({
  fileId,
  fileName,
  fileType,
  fileCategory,
  onClose
}: DocumentViewerProps) {
  const colors = useThemeColors();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  
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
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
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
    placeholderText: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 16,
    },
    placeholderSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
      marginBottom: 24,
    },
    bottomContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    textContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    textDocument: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
      fontFamily: 'monospace',
    },
  });

  useEffect(() => {
    loadFileUrl();
  }, [fileId]);

  useEffect(() => {
    const getToken = async () => {
      const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      setAuthToken(token);
    };
    getToken();
  }, []);

  const loadFileUrl = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // For image files containing documents, we need to get the file info first
      // then construct a preview URL that serves the image content directly
      const fileInfo = await apiClient.getFileById(parseInt(fileId));
      
      if (fileInfo.success && fileInfo.file) {
        // Use view endpoint - backend automatically decrypts encrypted files
        // All file operations go through backend encryption class
        // If view endpoint doesn't exist, fallback to download endpoint
        console.log('🔐 File will be decrypted by backend encryption class for viewing');
        let previewUrl = `${API_BASE_URL}/api/v1/mobile/file/${fileId}/view`;
        
        // File loaded successfully - backend handles decryption automatically
        
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
      
      // If view endpoint returns 404, try download endpoint as fallback
      if (error.response?.status === 404) {
        console.log('⚠️ View endpoint not available, falling back to download endpoint');
        try {
          const downloadUrl = `${API_BASE_URL}/api/v1/mobile/file/${fileId}/download`;
          console.log('🔐 Using download endpoint - backend will decrypt file');
          setFileUrl(downloadUrl);
          
          // For images, get dimensions with authentication
          if (isImageFile(fileType)) {
            await getImageDimensionsWithAuth(downloadUrl);
          }
          return; // Successfully loaded via download endpoint
        } catch (fallbackError: any) {
          console.error('Fallback to download endpoint also failed:', fallbackError);
          setError('File not found. It may have been deleted or moved.');
        }
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
           fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp|heic|heif)$/);
    
    return isImage;
  };

  const isPdfFile = (type: string) => {
    return type === 'pdf' || 
           type.includes('pdf') || 
           fileName.toLowerCase().endsWith('.pdf');
  };

  const isOfficeDocument = (type: string) => {
    const officeExtensions = /\.(doc|docx|xls|xlsx|ppt|pptx)$/;
    return type === 'doc' || 
           type === 'docx' || 
           type === 'xls' || 
           type === 'xlsx' || 
           type === 'ppt' || 
           type === 'pptx' ||
           type.includes('document') ||
           type.includes('spreadsheet') ||
           type.includes('presentation') ||
           fileName.toLowerCase().match(officeExtensions);
  };

  const isTextDocument = (type: string) => {
    const textExtensions = /\.(txt|rtf|md|log|csv|json|xml|yaml|yml|ini|conf|config|properties)$/;
    return type === 'text' || 
           type.includes('text/') ||
           type.includes('plain') ||
           fileName.toLowerCase().match(textExtensions);
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
    
    if (isPdfFile(fileType)) {
      return 'PDF Document';
    } else if (isOfficeDocument(fileType)) {
      if (fileType.includes('doc') || fileName.toLowerCase().match(/\.(doc|docx)$/)) {
        return 'Word Document';
      } else if (fileType.includes('xls') || fileName.toLowerCase().match(/\.(xls|xlsx)$/)) {
        return 'Excel Spreadsheet';
      } else if (fileType.includes('ppt') || fileName.toLowerCase().match(/\.(ppt|pptx)$/)) {
        return 'PowerPoint Presentation';
      }
      return 'Office Document';
    } else if (isTextDocument(fileType)) {
      return 'Text Document';
    } else if (isImageFile(fileType)) {
      return 'Image Viewer';
    }
    
    return 'Document Preview';
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

  const renderDocumentPreview = () => {
    if (!fileUrl) return null;

    if (!authToken) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading document...</Text>
        </View>
      );
    }

    // Use the AuthenticatedWebView for PDFs and Office documents
    return (
      <AuthenticatedWebView 
        fileUrl={fileUrl} 
        authToken={authToken} 
        fileName={fileName} 
        fileType={fileType} 
      />
    );
  };

  const renderTextDocument = () => {
    if (!fileUrl) return null;

    if (!authToken) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading text document...</Text>
        </View>
      );
    }

    // Use TextDocumentViewer for text files
    return (
      <TextDocumentViewer 
        fileUrl={fileUrl} 
        authToken={authToken} 
        fileName={fileName} 
      />
    );
  };

  const renderFallbackDocument = () => {
    return (
      <View style={styles.placeholderContainer}>
        <Ionicons name="document-text-outline" size={64} color="#007AFF" />
        <Text style={dynamicStyles.placeholderText}>Document Preview</Text>
        <Text style={dynamicStyles.placeholderSubtext}>
          {fileName}{'\n'}
          Preview for this document type is not yet implemented.
        </Text>
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading file...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#FF3B30" />
          <Text style={dynamicStyles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFileUrl}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isImage = isImageFile(fileType);
    const isPdf = isPdfFile(fileType);
    const isOffice = isOfficeDocument(fileType);
    const isText = isTextDocument(fileType);

    // For images, show the image directly
    if (isImage) {
      return renderImage();
    }
    
    // For text documents, use TextDocumentViewer
    if (isText) {
      return renderTextDocument();
    }
    
    // For PDFs and Office documents, show WebView preview
    if (isPdf || isOffice) {
      return renderDocumentPreview();
    }
    
    // For other document types, try to show in WebView as fallback
    // This handles CSV, JSON, XML, and other text-based formats
    return renderDocumentPreview();
  };

  // DocumentViewer rendering

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={dynamicStyles.title} numberOfLines={1}>
            {getViewerTitle()}
          </Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.content}>
          {renderContent()}
        </View>
        
        {/* Bottom Close Button */}
        <View style={dynamicStyles.bottomContainer}>
          <TouchableOpacity style={styles.bottomCloseButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor removed - using dynamicStyles
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    // borderBottomColor removed - using dynamicStyles
    // backgroundColor removed - using dynamicStyles
  },
  closeButton: {
    padding: 12,
    borderRadius: 20,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    // color removed - using dynamicStyles
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
    // color removed - using dynamicStyles
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    // color removed - using dynamicStyles
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
    // color removed - using dynamicStyles
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
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  bottomContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    // borderTopColor removed - using dynamicStyles
    // backgroundColor removed - using dynamicStyles
  },
  bottomCloseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 25,
    alignSelf: 'center',
    width: 50,
    height: 50,
  },
  textContainer: {
    flex: 1,
    // backgroundColor removed - using dynamicStyles
  },
  textContent: {
    padding: 16,
  },
  textDocument: {
    fontSize: 16,
    lineHeight: 24,
    // color removed - using dynamicStyles
    fontFamily: 'monospace',
  },
});
