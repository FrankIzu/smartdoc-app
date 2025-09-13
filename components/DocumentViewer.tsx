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
                      background: #fff;
                      color: #333;
                      line-height: 1.6;
                    }
                    pre { 
                      white-space: pre-wrap; 
                      word-wrap: break-word; 
                      font-family: monospace;
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
        <Text style={styles.errorText}>{error}</Text>
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

  useEffect(() => {
    const loadTextContent = async () => {
      try {
        setLoading(true);
        const response = await fetch(fileUrl, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Platform': 'android'
          }
        });

        if (response.ok) {
          const text = await response.text();
          setContent(text);
        } else {
          setError(`Failed to load text content: ${response.status}`);
        }
      } catch (err) {
        setError('Failed to load text document');
        console.error('Text document load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTextContent();
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
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.textContainer} contentContainerStyle={styles.textContent}>
      <Text style={styles.textDocument}>{content}</Text>
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
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

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
    const textExtensions = /\.(txt|rtf|md)$/;
    return type === 'text' || 
           type.includes('text/') ||
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
          <Text style={styles.loadingText}>Loading document...</Text>
        </View>
      );
    }

    // Use the AuthenticatedWebView for all document types
    return (
      <AuthenticatedWebView 
        fileUrl={fileUrl} 
        authToken={authToken} 
        fileName={fileName} 
        fileType={fileType} 
      />
    );
  };

  const renderFallbackDocument = () => {
    return (
      <View style={styles.placeholderContainer}>
        <Ionicons name="document-text-outline" size={64} color="#007AFF" />
        <Text style={styles.placeholderText}>Document Preview</Text>
        <Text style={styles.placeholderSubtext}>
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
    const isOffice = isOfficeDocument(fileType);
    const isText = isTextDocument(fileType);

    // For images, show the image directly
    if (isImage) {
      return renderImage();
    }
    
    // For PDFs, Office documents, and text documents, show WebView preview
    if (isPdf || isOffice || isText) {
      return renderDocumentPreview();
    }
    
    // For other document types, show fallback
    return renderFallbackDocument();
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
        
        {/* Bottom Close Button */}
        <View style={styles.bottomContainer}>
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
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  closeButton: {
    padding: 12,
    borderRadius: 20,
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
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
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
    backgroundColor: '#fff',
  },
  textContent: {
    padding: 16,
  },
  textDocument: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    fontFamily: 'monospace',
  },
});
