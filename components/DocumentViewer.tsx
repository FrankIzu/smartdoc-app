import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { useThemeColors } from '../hooks/useThemeColors';
import { apiClient } from '../services/api';
import { secureStorage } from '../utils/storage';

// Conditionally import react-native-pdf (only works in development builds, not Expo Go)
let Pdf: any = null;
const isExpoGo = Constants.appOwnership === 'expo';

// Log environment detection for debugging
console.log('📱 PDF Viewer Environment:', {
  platform: Platform.OS,
  appOwnership: Constants.appOwnership,
  isExpoGo,
  executionEnvironment: Constants.executionEnvironment,
});

if (!isExpoGo && Platform.OS !== 'web') {
  try {
    Pdf = require('react-native-pdf').default;
    console.log('✅ Native PDF viewer (react-native-pdf) loaded successfully');
  } catch (error: any) {
    // Native module not available - will fall back to external opening or WebView
    console.warn('⚠️ react-native-pdf not available:', error?.message || error);
    console.warn('📱 Will use fallback for PDF viewing (WebView or external opening)');
  }
} else if (isExpoGo) {
  console.log('ℹ️ Running in Expo Go - native PDF viewer not available (requires dev/prod build)');
} else if (Platform.OS === 'web') {
  console.log('ℹ️ Running on web - native PDF viewer not available');
}

interface DocumentViewerProps {
  fileId: string;
  fileName: string;
  fileType: string;
  fileCategory?: string;
  onClose: () => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// PDF.js viewer HTML for Expo Go (Android WebView doesn't render <embed> PDF; draw to canvas instead).
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105';
function buildExpoGoPdfViewerHtml(dataUri: string): string {
  const uriEscaped = dataUri.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c').replace(/\n/g, '\\n');
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=3.0"/>
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline';">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html{background:#fff;width:100%;height:100%;overflow-y:auto;overflow-x:hidden}
    body{background:#fff!important;padding:8px;min-height:100vh;width:100%}
    #pages{width:100%;display:block;background:#fff;min-height:100vh;padding-top:20px}
    canvas{display:block!important;visibility:visible!important;opacity:1!important;margin:12px auto;max-width:100%;box-shadow:0 2px 8px rgba(0,0,0,0.3);background:#fff!important;position:relative;z-index:10}
    .loading{color:#333;text-align:center;padding:24px;font-family:sans-serif;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:5;background:#fff;border-radius:8px}
    .error{color:#f44;text-align:center;padding:24px;font-family:sans-serif;white-space:pre-wrap;word-break:break-all;background:#fff;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20}
  </style>
</head>
<body>
  <div id="loading" class="loading">Loading PDF.js…</div>
  <div id="pages"></div>
  <script>
    window.addEventListener('error', function(e) {
      var el = document.getElementById('loading');
      el.innerHTML = '<span class="error">Error: ' + (e.message || 'Unknown') + '<br>File: ' + (e.filename || '') + '</span>';
      el.style.display = 'block';
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: e.message }));
      }
    });
    function showError(msg) {
      var el = document.getElementById('loading');
      el.innerHTML = '<span class="error">' + msg + '</span>';
      el.style.display = 'block';
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: msg }));
      }
    }
    function log(msg) {
      console.log('[PDF Viewer]', msg);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: String(msg) }));
      }
    }
  <\/script>
  <script>
    function loadPdf() {
      if (typeof pdfjsLib === 'undefined') {
        showError('PDF.js library not loaded. Check internet connection.');
        return;
      }
      log('PDF.js loaded');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS_CDN}/pdf.worker.min.js';
      var uri = '${uriEscaped}';
      log('Data URI length: ' + uri.length);
      try {
        var base64 = uri.indexOf(',') >= 0 ? uri.split(',')[1] : uri;
        log('Base64 length: ' + base64.length);
        if (!base64 || base64.length < 100) {
          showError('Invalid PDF data (too short)');
          return;
        }
        var raw = atob(base64);
        log('Decoded length: ' + raw.length);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        log('Uint8Array created, length: ' + arr.length);
        pdfjsLib.getDocument({ data: arr }).promise.then(function(pdf) {
          log('PDF loaded, pages: ' + pdf.numPages);
          document.getElementById('loading').innerHTML = 'Rendering pages…';
          var container = document.getElementById('pages');
          container.style.display = 'block';
          container.style.visibility = 'visible';
          var w = Math.max(300, (window.innerWidth || 400) - 16);
          log('Container width: ' + w + ', window.innerWidth: ' + window.innerWidth);
          var numPages = pdf.numPages;
          function renderPage(n) {
            if (n > numPages) {
              var loadingEl = document.getElementById('loading');
              loadingEl.style.display = 'none';
              loadingEl.style.visibility = 'hidden';
              log('All pages rendered');
              return;
            }
            pdf.getPage(n).then(function(page) {
              log('Rendering page ' + n);
              var pageRotation = page.rotate || 0;
              log('Page ' + n + ' rotation: ' + pageRotation);
              var viewport = page.getViewport({ scale: 1, rotation: pageRotation });
              log('Page ' + n + ' viewport at scale 1: ' + viewport.width + 'x' + viewport.height);
              if (viewport.width <= 0 || viewport.height <= 0) {
                showError('Invalid page dimensions: ' + viewport.width + 'x' + viewport.height);
                return;
              }
              var scale = 1.5;
              if (w > 0 && viewport.width > 0 && !isNaN(w / viewport.width) && isFinite(w / viewport.width)) {
                scale = Math.min(2.5, Math.max(0.5, w / viewport.width));
              } else {
                log('Using default scale 1.5 (w=' + w + ', viewport.width=' + viewport.width + ')');
              }
              var dpr = window.devicePixelRatio || 2;
              var renderScale = scale * dpr;
              log('Using scale: ' + scale + ', dpr: ' + dpr + ', renderScale: ' + renderScale + ' for page ' + n);
              viewport = page.getViewport({ scale: renderScale, rotation: pageRotation });
              log('Scaled viewport: ' + viewport.width + 'x' + viewport.height);
              
              if (!viewport || viewport.width <= 0 || viewport.height <= 0 || !isFinite(viewport.width) || !isFinite(viewport.height)) {
                log('ERROR: Scaled viewport invalid, trying scale 2.0');
                viewport = page.getViewport({ scale: 2.0, rotation: pageRotation });
                if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
                  showError('Invalid viewport: ' + (viewport ? viewport.width + 'x' + viewport.height : 'null'));
                  return;
                }
              }
              
              var canvasWidth = Math.max(100, Math.round(viewport.width));
              var canvasHeight = Math.max(100, Math.round(viewport.height));
              if (!isFinite(canvasWidth) || !isFinite(canvasHeight)) {
                canvasWidth = 800;
                canvasHeight = 1000;
                log('Using fallback dimensions: 800x1000');
              }
              log('Final canvas dimensions: ' + canvasWidth + 'x' + canvasHeight);
              var canvas = document.createElement('canvas');
              canvas.width = canvasWidth;
              canvas.height = canvasHeight;
              var displayWidth = canvasWidth / dpr;
              var displayHeight = canvasHeight / dpr;
              canvas.style.width = displayWidth + 'px';
              canvas.style.height = displayHeight + 'px';
              canvas.style.display = 'block';
              canvas.style.visibility = 'visible';
              canvas.style.opacity = '1';
              canvas.style.maxWidth = '100%';
              log('Creating canvas for page ' + n + ': ' + canvasWidth + 'x' + canvasHeight + ', display: ' + displayWidth + 'x' + displayHeight);
              if (canvas.width <= 0 || canvas.height <= 0) {
                showError('Canvas has invalid dimensions before render: ' + canvas.width + 'x' + canvas.height);
                return;
              }
              var ctx = canvas.getContext('2d');
              if (!ctx) {
                showError('Failed to get canvas context');
                return;
              }
              log('About to render page ' + n + ' to canvas ' + canvas.width + 'x' + canvas.height);
              page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function() {
                log('Page ' + n + ' render complete, canvas actual size: ' + canvas.width + 'x' + canvas.height);
                if (canvas.width > 0 && canvas.height > 0 && isFinite(canvas.width) && isFinite(canvas.height)) {
                  container.appendChild(canvas);
                  log('Canvas appended to container. Container now has ' + container.children.length + ' children, container height: ' + container.offsetHeight);
                  if (n === 1) {
                    var loadingEl = document.getElementById('loading');
                    loadingEl.style.display = 'none';
                    loadingEl.style.visibility = 'hidden';
                  }
                } else {
                  log('ERROR: Canvas has zero dimensions after render: ' + canvas.width + 'x' + canvas.height);
                  showError('Canvas rendering failed: invalid dimensions');
                }
                renderPage(n + 1);
              }).catch(function(err) {
                showError('Failed to render page ' + n + ': ' + (err.message || err));
              });
            }).catch(function(err) {
              showError('Failed to get page ' + n + ': ' + (err.message || err));
            });
          }
          renderPage(1);
        }).catch(function(err) {
          showError('Failed to load PDF: ' + (err.message || err) + ' (code: ' + (err.code || '?') + ')');
        });
      } catch (err) {
        showError('Error processing PDF data: ' + (err.message || err));
      }
    }
    var script = document.createElement('script');
    script.src = '${PDFJS_CDN}/pdf.min.js';
    script.onload = function() {
      setTimeout(loadPdf, 100);
    };
    script.onerror = function() {
      showError('Failed to load PDF.js from CDN. Try opening in browser.');
    };
    document.head.appendChild(script);
    setTimeout(function() {
      if (typeof pdfjsLib === 'undefined') {
        showError('PDF.js loading timeout. Check internet connection.');
      }
    }, 10000);
  <\/script>
</body>
</html>`;
}

// Custom Image component that handles authentication.
// On web: fetch + FileReader + data URL (browsers support it).
// On native: fetch with auth is done via FileSystem.downloadAsync (with headers), then we display
// the local file. This avoids relying on native Image components to send Authorization headers
// (expo-image may not forward them on all platforms).
const AuthenticatedImage = ({ source, style, resizeMode, onError, onLoad, ...props }: any) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nativeLocalUri, setNativeLocalUri] = useState<string | null>(null);

  // Load auth token once (and stop native loading state once we know)
  useEffect(() => {
    let cancelled = false;
    secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN).then((token) => {
      if (!cancelled) {
        setAuthToken(token || null);
        if (Platform.OS !== 'web') setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Web only: fetch image and convert to data URL (FileReader works in browser)
  useEffect(() => {
    if (Platform.OS !== 'web' || !source?.uri || !authToken) {
      if (Platform.OS === 'web' && source?.uri && !authToken) setLoading(false);
      return;
    }
    let cancelled = false;
    const loadViaFetch = async () => {
      try {
        const response = await fetch(source.uri, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Platform': 'web'
          }
        });
        if (cancelled) return;
        if (!response.ok) {
          onError?.(new Error(`Failed to load image: ${response.status}`));
          setLoading(false);
          return;
        }
        const blob = await response.blob();
        if (cancelled) return;
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        if (!cancelled) setImageData(dataUrl);
      } catch (err) {
        if (!cancelled) onError?.(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadViaFetch();
    return () => { cancelled = true; };
  }, [source?.uri, authToken, onError]);

  // Native: Tiered download strategy for images
  // < 5MB: fetch + base64 (current approach)
  // >= 5MB: Signed URL + FileSystem.downloadAsync (no headers needed)
  // > 20MB: Fallback to external opening
  const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit for base64 conversion
  const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024; // 20MB - use signed URL only
  useEffect(() => {
    if (Platform.OS === 'web' || !source?.uri || !authToken) return;

    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!cacheDir) {
      setLoading(false);
      return;
    }

    setNativeLocalUri(null);
    setLoading(true);

    let cancelled = false;
    const localUri = `${cacheDir}auth_image_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

    (async () => {
      try {
        // Check if URL is a signed URL (contains sig= and exp= parameters)
        const isSignedUrl = source.uri.includes('sig=') && source.uri.includes('exp=');
        
        if (isSignedUrl) {
          // Signed URL: Use FileSystem.downloadAsync (no headers needed, signature is in URL)
          console.log('🔐 [SIGNED-URL] Using signed URL for image download');
          const result = await FileSystem.downloadAsync(source.uri, localUri);
          if (cancelled) return;
          setNativeLocalUri(result.uri);
          setLoading(false);
        } else {
          // Bearer token URL: Use fetch + base64 (for files < 5MB)
          console.log('🔐 [BEARER-TOKEN] Using Bearer token URL for image download');
          
          const response = await fetch(source.uri, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'X-Platform': Platform.OS
            }
          });
          if (cancelled) return;
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          
          // Check content length if available
          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
            throw new Error(`Image too large: ${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB (max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`);
          }
          
          // Get blob and check size
          const blob = await response.blob();
          if (cancelled) return;
          
          if (blob.size > MAX_IMAGE_SIZE_BYTES) {
            throw new Error(`Image too large: ${Math.round(blob.size / 1024 / 1024)}MB (max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`);
          }
          
          // Convert blob to base64 using FileReader (works in React Native)
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                // FileReader returns data URL (data:image/jpeg;base64,...), extract base64 part
                const dataUrl = reader.result as string;
                if (!dataUrl || !dataUrl.includes(',')) {
                  reject(new Error('Invalid data URL from FileReader'));
                  return;
                }
                const base64Data = dataUrl.split(',')[1];
                if (!base64Data) {
                  reject(new Error('Failed to extract base64 data'));
                  return;
                }
                resolve(base64Data);
              } catch (e) {
                reject(e);
              }
            };
            reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
            reader.readAsDataURL(blob);
          });
          
          if (cancelled) return;
          
          // Write base64 to file (FileSystem.writeAsStringAsync with Base64 encoding works in production)
          await FileSystem.writeAsStringAsync(localUri, base64, {
            encoding: FileSystem.EncodingType.Base64
          });
          
          if (cancelled) return;
          setNativeLocalUri(localUri);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Failed to load authenticated image:', err);
          onError?.(err);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    };
  }, [source?.uri, authToken, onError]);

  // Native: render from local file (no headers needed)
  if (Platform.OS !== 'web') {
    if (!source?.uri) {
      return null;
    }
    if (loading && !authToken) {
      return (
        <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      );
    }
    if (!authToken) {
      return (
        <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: '#666', textAlign: 'center' }}>Authentication required</Text>
        </View>
      );
    }
    if (loading || !nativeLocalUri) {
      return (
        <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      );
    }
    return (
      <ExpoImage
        source={{ uri: nativeLocalUri }}
        style={style}
        contentFit={resizeMode === 'contain' ? 'contain' : resizeMode === 'cover' ? 'cover' : 'fill'}
        onError={onError}
        onLoad={onLoad}
        transition={200}
        {...props}
      />
    );
  }

  // Web: show loading or image from data URL
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
        <Text style={{ color: '#666', textAlign: 'center' }}>Failed to load image</Text>
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
const AuthenticatedWebView = ({ fileUrl, authToken, fileName, fileType, localFileUri }: { fileUrl: string; authToken: string; fileName: string; fileType: string; localFileUri?: string | null }) => {
  const colors = useThemeColors();
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setLoading(true);
        setError(null);

        // For PDFs, use direct WebView with authenticated URL (iOS handles PDFs well)
        // Android PDFs are handled at higher level with native viewer
        const isPdf = fileType === 'pdf' || fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
        if (isPdf) {
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
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
      </View>
    );
  }

  // For PDFs, Office documents, and SVG files, use direct WebView with authenticated URL
  // Office documents will be converted to PDF by the backend view endpoint automatically
  // SVG files are vector graphics that need WebView rendering
  const isSvg = fileName.toLowerCase().endsWith('.svg') || fileType === 'image/svg+xml';
  if (fileType === 'pdf' || fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf') ||
      fileType === 'doc' || fileType === 'docx' || fileType.includes('document') || 
      fileName.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/) ||
      isSvg) {
    
    // Use view endpoint for Office documents - backend will convert to PDF automatically
    // No need to modify URL - view endpoint handles Office-to-PDF conversion
    let finalUrl = fileUrl;
    
    const isPdf = fileType === 'pdf' || fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    
    // Note: Native PDFs are handled at renderDocumentPreview level with native viewer
    // This WebView is used for iOS PDFs (when native viewer not available), Office documents, and SVG files.
    // On native platforms, use local file when provided so we don't rely on WebView sending headers.
    // iOS WebView doesn't reliably send Authorization headers, so local file is preferred.
    const source = localFileUri
      ? { uri: localFileUri }
      : {
          uri: finalUrl,
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Platform': Platform.OS,
          },
        };
    
    // For SVG files, embed in HTML for proper rendering
    if (isSvg && !localFileUri) {
      // SVG files need to be fetched and embedded in HTML
      return (
        <WebView
          source={{
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=3.0"/>
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    html, body { width: 100%; height: 100%; overflow: hidden; }
                    body { 
                      display: flex; 
                      justify-content: center; 
                      align-items: center; 
                      background: ${colors.isDark ? '#1c1c1e' : '#ffffff'};
                    }
                    img { 
                      max-width: 100%; 
                      max-height: 100%; 
                      width: auto; 
                      height: auto; 
                      object-fit: contain;
                    }
                  </style>
                </head>
                <body>
                  <img src="${finalUrl}" alt="${fileName}" />
                </body>
              </html>
            `
          }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('SVG WebView error:', nativeEvent);
            setError('Failed to load SVG');
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('SVG WebView HTTP error:', nativeEvent);
            setError(`Failed to load SVG: HTTP ${nativeEvent.statusCode}`);
          }}
          onLoadEnd={() => {
            console.log('SVG WebView loaded successfully');
          }}
        />
      );
    }
    
    return (
      <WebView
        source={source}
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
  const colors = useThemeColors();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit for text files

  useEffect(() => {
    const loadTextContent = async () => {
      if (!fileUrl) {
        console.warn('TextDocumentViewer: No fileUrl provided');
        setError('No file URL provided');
        setLoading(false);
        return;
      }
      if (!authToken) {
        console.warn('TextDocumentViewer: No authToken provided');
        setError('Authentication required');
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        console.log('TextDocumentViewer: Fetching text file from:', fileUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(fileUrl, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Platform': Platform.OS
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        console.log('TextDocumentViewer: Response status:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('TextDocumentViewer: Failed to load:', response.status, errorText);
          setError(`Failed to load text content: ${response.status} ${response.statusText}`);
          setLoading(false);
          return;
        }

        // Check content length before loading
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
          setError(`File is too large (${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
          setLoading(false);
          return;
        }

        const text = await response.text();
        console.log('TextDocumentViewer: Loaded text, length:', text.length);
        
        // Check actual size after loading
        if (text.length > MAX_FILE_SIZE) {
          setError(`File is too large (${(text.length / 1024 / 1024).toFixed(2)} MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
          setLoading(false);
          return;
        }
        
        setContent(text);
        setLoading(false);
      } catch (err: any) {
        console.error('TextDocumentViewer: Load error:', err);
        if (err.name === 'AbortError') {
          setError('Request timed out. Please try again.');
        } else {
          setError(err.message || 'Failed to load text document');
        }
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
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.textContainer, { backgroundColor: colors.background }]} 
      contentContainerStyle={styles.textContent}
      showsVerticalScrollIndicator={true}
    >
      <Text style={[styles.textDocument, { color: colors.text }]} selectable={true}>{content || '(Empty file)'}</Text>
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
  const [pdfLocalUri, setPdfLocalUri] = useState<string | null>(null);
  /** Local file URI for WebView (Office docs only when native PDF not used). PDF uses only native viewer. */
  const [webViewLocalUri, setWebViewLocalUri] = useState<string | null>(null);
  const [officePdfDataUri, setOfficePdfDataUri] = useState<string | null>(null); // For Office docs converted to PDF in Expo Go
  /** Expo Go only: PDF as data URI for WebView (no native PDF module in Expo Go). */
  const [webViewPdfDataUri, setWebViewPdfDataUri] = useState<string | null>(null);
  /** SVG content read from local file (for WebView rendering - iOS can't open file:// URIs) */
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<string | null>(null);
  const [actualFileType, setActualFileType] = useState<string | null>(null); // Store file_type from API
  const insets = useSafeAreaInsets();
  
  // Pinch-to-zoom state (moved to component level for hooks)
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  
  // Reset zoom when fileUrl changes
  useEffect(() => {
    if (fileUrl) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [fileUrl]);
  
  // Animated style for the image (must be at component level)
  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });
  
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
      paddingTop: Math.max(insets.top, 8) + 10,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
      zIndex: 1000,
      elevation: 5, // Android shadow
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

  // Download PDF to local cache for native viewer (only if native module is available)
  // Tiered strategy: Signed URLs for >= 5MB, Bearer token + base64 for smaller files
  useEffect(() => {
    const downloadPdfForNativeViewer = async () => {
      // Only download if native PDF viewer is available (not in Expo Go)
      if (!Pdf || isExpoGo || !fileUrl || !authToken || !isPdfFile(fileType)) {
        console.log('📄 [PDF-DOWNLOAD] Skipping download:', {
          hasPdf: !!Pdf,
          isExpoGo,
          hasFileUrl: !!fileUrl,
          hasAuthToken: !!authToken,
          isPdf: isPdfFile(fileType),
          fileType,
          fileUrl
        });
        return;
      }
      
      console.log('📄 [PDF-DOWNLOAD] Starting PDF download:', {
        fileUrl,
        fileType,
        fileName
      });

      let cancelled = false;

      try {
        setLoading(true);
        
        const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!cacheDir) {
          console.warn('Cache directory not available for PDF download');
          setLoading(false);
          return;
        }

        // Ensure filename has .pdf extension for proper MIME type detection
        let sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        if (!sanitizedFileName.toLowerCase().endsWith('.pdf')) {
          // Add .pdf extension if missing
          sanitizedFileName = `${sanitizedFileName}.pdf`;
        }
        const localUri = `${cacheDir}${sanitizedFileName}`;

        console.log('📥 Downloading PDF for native viewer:', fileUrl);
        console.log('📁 Saving to:', localUri);

        // Check if URL is a signed URL (contains sig= and exp= parameters)
        const isSignedUrl = fileUrl.includes('sig=') && fileUrl.includes('exp=');
        
        if (isSignedUrl) {
          // Signed URL: Use FileSystem.downloadAsync (no headers needed, signature is in URL)
          console.log('🔐 [SIGNED-URL] Using signed URL for PDF download');
          const result = await FileSystem.downloadAsync(fileUrl, localUri);
          if (cancelled) return;
          console.log('✅ PDF downloaded successfully for native viewer:', result.uri);
          setPdfLocalUri(result.uri);
          setLoading(false);
        } else {
          // Bearer token URL: Use fetch + base64 (for files < 5MB)
          console.log('🔐 [BEARER-TOKEN] Using Bearer token URL for PDF download');
          
          const response = await fetch(fileUrl, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'X-Platform': Platform.OS
            }
          });
          
          if (cancelled) return;
          
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
          }

          // Get blob and convert to base64
          const blob = await response.blob();
          if (cancelled) return;

          // Convert blob to base64 using FileReader (works in React Native)
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const dataUrl = reader.result as string;
                if (!dataUrl || !dataUrl.includes(',')) {
                  reject(new Error('Invalid data URL from FileReader'));
                  return;
                }
                const base64Data = dataUrl.split(',')[1];
                if (!base64Data) {
                  reject(new Error('Failed to extract base64 data'));
                  return;
                }
                resolve(base64Data);
              } catch (e) {
                reject(e);
              }
            };
            reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
            reader.readAsDataURL(blob);
          });

          if (cancelled) return;

          // Write base64 to file (FileSystem.writeAsStringAsync with Base64 encoding works in production)
          await FileSystem.writeAsStringAsync(localUri, base64, {
            encoding: FileSystem.EncodingType.Base64
          });

          if (cancelled) return;

          console.log('✅ PDF downloaded successfully for native viewer:', localUri);
          setPdfLocalUri(localUri);
          setLoading(false);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error('❌ [PDF-DOWNLOAD] Failed to download PDF for native viewer:', error);
          console.error('❌ [PDF-DOWNLOAD] Error details:', {
            message: error?.message,
            stack: error?.stack,
            fileUrl,
            fileType,
            fileName
          });
          setError('Failed to load PDF. Please try again.');
          setLoading(false);
        }
      }
    };

    downloadPdfForNativeViewer();
    
    return () => {
      // Cleanup on unmount
    };
  }, [fileUrl, authToken, fileType, fileName]);

  // Expo Go only: fetch PDF with auth and set base64 data URI so WebView can display it (no native PDF in Expo Go).
  const EXPO_GO_PDF_MAX_BYTES = 8 * 1024 * 1024; // 8MB
  useEffect(() => {
    if (!isExpoGo || !isPdfFile(fileType) || !fileUrl || !authToken) {
      console.log('📄 [EXPO-GO-PDF] Skipping Expo Go PDF load:', {
        isExpoGo,
        isPdf: isPdfFile(fileType),
        hasFileUrl: !!fileUrl,
        hasAuthToken: !!authToken,
        fileType
      });
      return;
    }
    
    console.log('📄 [EXPO-GO-PDF] Starting Expo Go PDF fetch:', fileUrl);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fileUrl, {
          headers: { 'Authorization': `Bearer ${authToken}`, 'X-Platform': Platform.OS },
        });
        if (cancelled) {
          console.log('📄 [EXPO-GO-PDF] Cancelled before response');
          return;
        }
        if (!res.ok) {
          console.error('📄 [EXPO-GO-PDF] Fetch failed:', res.status, res.statusText);
          return;
        }
        const blob = await res.blob();
        if (cancelled) {
          console.log('📄 [EXPO-GO-PDF] Cancelled after blob');
          return;
        }
        if (blob.size > EXPO_GO_PDF_MAX_BYTES) {
          console.warn('📄 [EXPO-GO-PDF] PDF too large:', blob.size, 'bytes');
          return;
        }
        console.log('📄 [EXPO-GO-PDF] Converting blob to data URL, size:', blob.size, 'bytes');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            console.log('📄 [EXPO-GO-PDF] Data URL created successfully');
            resolve(reader.result as string);
          };
          reader.onerror = () => {
            console.error('📄 [EXPO-GO-PDF] FileReader error:', reader.error);
            reject(reader.error);
          };
          reader.readAsDataURL(blob);
        });
        if (!cancelled) {
          console.log('✅ [EXPO-GO-PDF] PDF data URI set, length:', dataUrl.length);
          setWebViewPdfDataUri(dataUrl);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('❌ [EXPO-GO-PDF] PDF fetch failed:', e);
          setError('Failed to load PDF in Expo Go. Please try again.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl, authToken, fileType]);

  // For Office docs and SVG files (not PDF): download to local file for WebView on native platforms.
  // iOS WebView doesn't reliably send Authorization headers, so we need to download locally.
  // PDF is only shown via native viewer (download → cache → react-native-pdf); no WebView for PDF.
  // SVG files need WebView rendering (ExpoImage doesn't support SVG).
  // Tiered strategy: Signed URLs for >= 5MB, Bearer token + base64 for smaller files.
  useEffect(() => {
    // Use actualFileType from API if available, otherwise fall back to fileType prop
    const effectiveFileType = actualFileType || fileType;
    const isSvg = isSvgFile(fileName, effectiveFileType);
    const needOfficeFallback =
      (Platform.OS !== 'web') &&
      (isOfficeDocument(fileType) || isSvg) &&
      !isPdfFile(fileType) &&
      !!fileUrl &&
      !!authToken;
    if (!needOfficeFallback) return;

    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!cacheDir) return;
    
    let cancelled = false;
    
    (async () => {
      try {
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80);
        const baseName = safeName.replace(/\.[^.]+$/, ''); // Remove original extension
        
        // Office documents are converted to PDF by backend, so use PDF extension
        // SVG files keep their .svg extension
        const fileExtension = isSvg ? '.svg' : '.pdf';
        const localUri = `${cacheDir}webview_${Date.now()}_${baseName}${fileExtension}`;
        
        if (isSvg) {
          console.log('🖼️ [SVG-DOWNLOAD] Downloading SVG file:', fileUrl);
        } else {
          console.log('📄 [OFFICE-DOWNLOAD] Downloading Office document (will be converted to PDF by backend):', fileUrl);
        }
        
        // Check if URL is a signed URL (contains sig= and exp= parameters)
        const isSignedUrl = fileUrl.includes('sig=') && fileUrl.includes('exp=');
        
        if (isSignedUrl) {
          // Signed URL: Use FileSystem.downloadAsync (no headers needed)
          if (isSvg) {
            console.log('🔐 [SIGNED-URL] Using signed URL for SVG download');
          } else {
            console.log('🔐 [SIGNED-URL] Using signed URL for Office document download');
          }
          const result = await FileSystem.downloadAsync(fileUrl, localUri);
          if (cancelled) return;
          setWebViewLocalUri(result.uri);
          setLoading(false); // Clear loading state when file is ready
          if (isSvg) {
            console.log('✅ [SVG-DOWNLOAD] SVG file downloaded via signed URL:', result.uri);
          } else {
            console.log('✅ [OFFICE-DOWNLOAD] Office document downloaded via signed URL (as PDF):', result.uri);
          }
        } else {
          // Bearer token URL: Use fetch + base64
          console.log('🔐 [BEARER-TOKEN] Using Bearer token URL for Office document download');
          
          const response = await fetch(fileUrl, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'X-Platform': Platform.OS,
            },
          });
          
          if (cancelled) return;
          
          if (!response.ok) {
            const errorMsg = isSvg 
              ? `Failed to fetch SVG file: ${response.status} ${response.statusText}`
              : `Failed to fetch Office document: ${response.status} ${response.statusText}`;
            throw new Error(errorMsg);
          }

          // Check Content-Type - backend converts Office docs to PDF, but SVG stays as SVG
          const contentType = response.headers.get('content-type') || '';
          const isPdfResponse = !isSvg && contentType.includes('application/pdf');
          
          // If backend converted to PDF, use PDF extension (only for Office docs, not SVG)
          let finalLocalUri = localUri;
          if (isPdfResponse && !isSvg) {
            const pdfUri = localUri.replace(/\.[^.]+$/, '.pdf');
            console.log('📄 [OFFICE-PDF] Backend converted Office document to PDF, using PDF extension');
            finalLocalUri = pdfUri;
          }

          // Get blob and convert to base64
          const blob = await response.blob();
          if (cancelled) return;
          
          if (isSvg) {
            console.log('🖼️ [SVG-DOWNLOAD] Blob received:', {
              size: blob.size,
              type: blob.type,
              expectedType: 'image/svg+xml'
            });
          } else {
            console.log('📄 [OFFICE-DOWNLOAD] Blob received:', {
              size: blob.size,
              type: blob.type,
              isPdfResponse,
              expectedType: 'application/pdf'
            });
          }

          // Convert blob to base64 using FileReader
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const dataUrl = reader.result as string;
                if (!dataUrl || !dataUrl.includes(',')) {
                  reject(new Error('Invalid data URL from FileReader'));
                  return;
                }
                // Extract base64 part (everything after the comma)
                const base64Data = dataUrl.split(',')[1];
                if (!base64Data) {
                  reject(new Error('Failed to extract base64 data'));
                  return;
                }
                // Validate base64 format (basic check)
                if (base64Data.length < 100) {
                  reject(new Error('Base64 data too short, file may be corrupted'));
                  return;
                }
                console.log('📄 [OFFICE-DOWNLOAD] Base64 conversion successful, length:', base64Data.length);
                resolve(base64Data);
              } catch (e) {
                reject(e);
              }
            };
            reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
            reader.readAsDataURL(blob);
          });

          if (cancelled) return;

          // Write base64 to file (FileSystem.writeAsStringAsync with Base64 encoding decodes base64 and writes binary)
          if (isSvg) {
            console.log('🖼️ [SVG-DOWNLOAD] Writing SVG file to:', finalLocalUri);
          } else {
            console.log('📄 [OFFICE-DOWNLOAD] Writing file to:', finalLocalUri);
          }
          await FileSystem.writeAsStringAsync(finalLocalUri, base64, {
            encoding: FileSystem.EncodingType.Base64
          });

          if (cancelled) return;
          
          // Verify file was written
          const fileInfo = await FileSystem.getInfoAsync(finalLocalUri);
          if (!fileInfo.exists) {
            throw new Error('File was not written successfully');
          }
          if (isSvg) {
            console.log('✅ [SVG-DOWNLOAD] SVG file written successfully:', {
              uri: finalLocalUri,
              size: fileInfo.size,
              exists: fileInfo.exists
            });
          } else {
            console.log('✅ [OFFICE-DOWNLOAD] File written successfully:', {
              uri: finalLocalUri,
              size: fileInfo.size,
              exists: fileInfo.exists
            });
          }
          
          // If backend converted to PDF, also create data URI for Expo Go PDF viewer (only for Office docs, not SVG)
          if (isPdfResponse && isExpoGo && !isSvg) {
            // For Expo Go, use PDF.js viewer with data URI
            const dataUri = `data:application/pdf;base64,${base64}`;
            setOfficePdfDataUri(dataUri);
            console.log('📄 [OFFICE-PDF] Created PDF data URI for Expo Go viewer, length:', dataUri.length);
          }
          
          setWebViewLocalUri(finalLocalUri);
          setLoading(false); // Clear loading state when file is ready
          if (isSvg) {
            console.log('✅ [SVG-DOWNLOAD] SVG file downloaded and ready:', finalLocalUri);
          } else {
            console.log('✅ [OFFICE-DOWNLOAD] Office document downloaded and ready:', finalLocalUri, isPdfResponse ? '(converted to PDF)' : '');
          }
        }
      } catch (e) {
        if (!cancelled) {
          if (isSvg) {
            console.error('❌ [SVG-DOWNLOAD] SVG download failed:', e);
            setError('Failed to load SVG file. Please try again.');
          } else {
            console.error('❌ [OFFICE-DOWNLOAD] WebView fallback download failed:', e);
            setError('Failed to load Office document. Please try again.');
          }
          setLoading(false);
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [fileUrl, authToken, fileType, fileName, actualFileType]);

  // Read SVG file content when local file is available (iOS WebView can't open file:// URIs)
  useEffect(() => {
    const effectiveFileType = actualFileType || fileType;
    const isSvg = isSvgFile(fileName, effectiveFileType);
    
    if (!isSvg || !webViewLocalUri || Platform.OS === 'web') {
      setSvgContent(null);
      return;
    }

    let cancelled = false;
    
    (async () => {
      try {
        console.log('🖼️ [SVG] Reading SVG file content from:', webViewLocalUri);
        const content = await FileSystem.readAsStringAsync(webViewLocalUri);
        if (!cancelled) {
          console.log('✅ [SVG] SVG content read successfully, length:', content.length);
          setSvgContent(content);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('❌ [SVG] Failed to read SVG file content:', e);
          setSvgContent(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [webViewLocalUri, fileName, fileType, actualFileType]);

  const loadFileUrl = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // For image files containing documents, we need to get the file info first
      // then construct a preview URL that serves the image content directly
      console.log('📥 Fetching file info for fileId:', fileId);
      const fileInfo = await apiClient.getFileById(parseInt(fileId));
      
      console.log('📦 File info response:', {
        success: fileInfo.success,
        hasFile: !!fileInfo.file,
        fileKeys: fileInfo.file ? Object.keys(fileInfo.file) : [],
        viewUrl: fileInfo.file?.view_url,
        downloadUrl: fileInfo.file?.download_url,
        file_kind: fileInfo.file?.file_kind,
        file_type: fileInfo.file?.file_type,
        fileCategory: fileCategory,
        fileType: fileType
      });
      
      if (fileInfo.success && fileInfo.file) {
        // Use view endpoint - backend automatically decrypts encrypted files
        // All file operations go through backend encryption class
        // If view endpoint doesn't exist, fallback to download endpoint
        console.log('🔐 File will be decrypted by backend encryption class for viewing');
        
        // Tiered strategy: Use signed URLs for files >= 5MB, Bearer token URLs for smaller files
        const fileSize = fileInfo.file.file_size || 0;
        const hasSignedUrl = !!(fileInfo.file.signed_view_url || fileInfo.file.signed_download_url);
        
        // Prefer signed URL if available (files >= 5MB)
        let previewUrl = fileInfo.file.signed_view_url || fileInfo.file.view_url;
        let downloadUrl = fileInfo.file.signed_download_url || fileInfo.file.download_url;
        
        if (!previewUrl) {
          // Fallback: construct URL manually
          console.warn('⚠️ No view_url in response, constructing URL manually');
          previewUrl = `${API_BASE_URL}/api/v1/mobile/file/${fileId}/view`;
        }
        
        if (hasSignedUrl) {
          console.log('🔐 Using signed URL (file size:', Math.round(fileSize / 1024 / 1024), 'MB)');
        } else {
          console.log('🔐 Using Bearer token URL (file size:', Math.round(fileSize / 1024 / 1024), 'MB)');
        }
        console.log('📄 Using preview URL:', previewUrl);
        
        // Store URLs and metadata for tiered download strategy
        setFileUrl(previewUrl);
        // Store file_kind and file_type for image detection
        setFileKind(fileInfo.file.file_kind || null);
        setActualFileType(fileInfo.file.file_type || null);
        // Store signed URL flag and file size for download logic
        (window as any).__fileMetadata = {
          signedUrl: hasSignedUrl,
          fileSize: fileSize,
          downloadUrl: downloadUrl
        };
        
        // For images, get dimensions with authentication
        // Check both file_kind from API and fileCategory prop
        // Skip dimensions for SVG files (vector graphics, no fixed dimensions)
        const detectedFileKind = fileInfo.file.file_kind || fileCategory;
        const detectedFileType = fileInfo.file.file_type || fileType;
        if (isImageFile(fileType, detectedFileKind, fileCategory) && !isSvgFile(fileName, detectedFileType)) {
          console.log('🖼️ [IMAGE-DETECT] Image file detected, getting dimensions:', { fileType, file_kind: detectedFileKind, fileCategory });
          await getImageDimensionsWithAuth(previewUrl);
        } else if (isSvgFile(fileName, detectedFileType)) {
          console.log('🖼️ [SVG] SVG file detected, skipping dimension check (vector graphics)');
        }
        
        // For text files and images, loading is complete (no secondary download)
        // For PDF/Office, loading continues until native viewer or WebView data is ready
        if (isTextDocument(fileType) || isImageFile(fileType, detectedFileKind, fileCategory)) {
          console.log('Text/image file loaded, clearing loading state');
          setLoading(false);
        } else if (isPdfFile(fileType)) {
          // For PDFs, loading will be cleared by the PDF download effect
          // But if native PDF viewer is not available, clear loading here
          if (isExpoGo || !Pdf) {
            console.log('PDF file URL set, but native viewer not available - will use WebView fallback');
            // Loading will be cleared when WebView data is ready
          } else {
            console.log('PDF file URL set, waiting for native viewer download to complete');
          }
        }
      } else {
        const errorMsg = 'Failed to load file information';
        setError(errorMsg);
        setLoading(false);
        
        // Log error when file info fetch fails
        try {
          await apiClient.logError({
            errorType: 'FileInfoError',
            errorMessage: `Failed to get file info for file ${fileId}: ${fileInfo?.message || 'Unknown error'}`,
            severity: 'error',
            screenName: 'DocumentViewer',
            userAction: 'get_file_info',
            platform: Platform.OS,
            deviceInfo: {
              fileId: fileId,
              fileType: fileType,
              responseSuccess: fileInfo?.success,
              hasFile: !!fileInfo?.file
            }
          });
        } catch (logError) {
          console.warn('Failed to log file info error:', logError);
        }
      }
    } catch (error: any) {
      const message = error?.message ?? '';
      const is404 = error?.response?.status === 404 || /not found|404/i.test(message);

      if (is404) {
        console.warn('File not found:', fileId, message);
        setError('File not found. It may have been deleted or moved.');
        setLoading(false);
        return;
      }
      console.error('Failed to load file URL:', error);
      setLoading(false);

      // If view endpoint returns 404, try download endpoint as fallback (axios error with response)
      if (error.response?.status === 404) {
        console.log('⚠️ View endpoint not available, falling back to download endpoint');
        try {
          const downloadUrl = `${API_BASE_URL}/api/v1/mobile/file/${fileId}/download`;
          console.log('🔐 Using download endpoint - backend will decrypt file');
          setFileUrl(downloadUrl);

          const detectedFileKind = fileKind || fileCategory;
          if (isImageFile(fileType, detectedFileKind, fileCategory) && !isSvgFile(fileName, fileType)) {
            await getImageDimensionsWithAuth(downloadUrl);
          } else if (isSvgFile(fileName, fileType)) {
            console.log('🖼️ [SVG] SVG file detected in fallback, skipping dimension check');
          }
          if (isTextDocument(fileType) || isImageFile(fileType, detectedFileKind, fileCategory)) {
            setLoading(false);
          }
          return;
        } catch (fallbackError: any) {
          console.error('Fallback to download endpoint also failed:', fallbackError);
          setError('File not found. It may have been deleted or moved.');
          setLoading(false);
        }
      } else if (error.response?.status === 401) {
        setError('Authentication required. Please log in again.');
        setLoading(false);
      } else if (error.response?.status === 403) {
        setError('You do not have permission to access this file.');
        setLoading(false);
      } else if (message.includes('Network Error')) {
        setError('Network error. Please check your connection and try again.');
        setLoading(false);
      } else {
        setError(`Failed to load file: ${message || 'Unknown error'}`);
        setLoading(false);
      }
    } finally {
      // Ensure loading is cleared for files that don't need secondary processing
      // PDF/Office continue loading until native viewer or WebView data is ready
      const needsSecondaryLoad = isPdfFile(fileType) || isOfficeDocument(fileType);
      if (!needsSecondaryLoad) {
        console.log('No secondary load needed, clearing loading state');
        setLoading(false);
      }
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

  const isImageFile = (type: string, kind?: string | null, category?: string | null) => {
    const kindLower = kind?.toLowerCase();
    const categoryLower = category?.toLowerCase();
    const fileNameLower = fileName.toLowerCase();
    const typeLower = type?.toLowerCase() || '';
    const isSvg = fileNameLower.endsWith('.svg') || typeLower === 'image/svg+xml' || typeLower.includes('svg');
    
    const isImage = type === 'image' || 
           type.includes('image/') || 
           fileNameLower.match(/\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|svg)$/) ||
           kindLower === 'picture' ||
           kindLower === 'image' ||
           categoryLower === 'picture' ||
           categoryLower === 'image';
    
    if (isImage && (kindLower === 'picture' || categoryLower === 'picture')) {
      console.log('🖼️ [IMAGE-DETECT] Detected picture file_kind:', { type, kind, category, fileName, isSvg });
    }
    
    return isImage;
  };
  
  const isSvgFile = (fileName: string, fileType?: string) => {
    const fileNameLower = fileName.toLowerCase();
    const fileTypeLower = fileType?.toLowerCase() || '';
    return fileNameLower.endsWith('.svg') || 
           fileTypeLower === 'image/svg+xml' || 
           fileTypeLower.includes('svg');
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
           type === 'txt' ||
           type.includes('text/') ||
           type.includes('plain') ||
           fileName.toLowerCase().match(textExtensions);
  };

  const isDocumentImage = (type: string, category?: string) => {
    // Check if this is an image file that contains a document (scanned document, receipt, etc.)
    const detectedFileKind = fileKind || category;
    return isImageFile(type, detectedFileKind, category) && (
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
    } else if (isImageFile(fileType, fileKind, fileCategory)) {
      return 'Image Viewer';
    }
    
    return 'Document Preview';
  };

  const renderImage = () => {
    if (!fileUrl) return null;

    // SVG files need special handling - use WebView instead of ExpoImage
    // Wait for local file download on native platforms (iOS WebView doesn't send headers reliably)
    // Use actualFileType from API if available, otherwise fall back to fileType prop
    const effectiveFileType = actualFileType || fileType;
    if (isSvgFile(fileName, effectiveFileType)) {
      if (Platform.OS !== 'web' && !webViewLocalUri && fileUrl && authToken) {
        console.log('🖼️ [SVG] Waiting for SVG file download...');
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={dynamicStyles.loadingText}>Loading SVG...</Text>
          </View>
        );
      }
      
      // On native platforms, read SVG content and embed in HTML (iOS WebView can't open file:// URIs)
      if (Platform.OS !== 'web' && webViewLocalUri) {
        if (!svgContent) {
          console.log('🖼️ [SVG] Reading SVG content...');
          return (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={dynamicStyles.loadingText}>Loading SVG...</Text>
            </View>
          );
        }
        
        console.log('🖼️ [SVG] Rendering SVG file in WebView with embedded content');
        // Embed SVG content directly in HTML (SVG is valid HTML)
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=3.0"/>
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body { width: 100%; height: 100%; overflow: auto; }
                body { 
                  display: flex; 
                  justify-content: center; 
                  align-items: center; 
                  background: ${colors.isDark ? '#1c1c1e' : '#ffffff'};
                  padding: 20px;
                }
                svg { 
                  max-width: 100%; 
                  max-height: 100%; 
                  width: auto; 
                  height: auto; 
                }
              </style>
            </head>
            <body>
              ${svgContent}
            </body>
          </html>
        `;
        
        return (
          <View style={styles.imageContainer}>
            <WebView
              source={{ html }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={false}
              scalesPageToFit={true}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('SVG WebView error:', nativeEvent);
                setError('Failed to load SVG');
              }}
              onLoadEnd={() => {
                console.log('SVG WebView loaded successfully');
              }}
            />
          </View>
        );
      }
      
      // On web or when no local file, use AuthenticatedWebView with URL
      console.log('🖼️ [SVG] Rendering SVG file in WebView:', fileName, webViewLocalUri ? '(using local file)' : '(using URL)');
      return (
        <View style={styles.imageContainer}>
          <AuthenticatedWebView
            fileUrl={fileUrl}
            authToken={authToken || ''}
            fileName={fileName}
            fileType="image/svg+xml"
            localFileUri={undefined}
          />
        </View>
      );
    }

    // Calculate available height: screen height minus header height
    // Header height = safe area top + padding top (10) + content height (~44) + padding bottom (10) + border (1)
    const headerHeight = Math.max(insets.top, 8) + 10 + 44 + 10 + 1; // ~73-100px depending on device
    const availableHeight = screenHeight - headerHeight;
    
    // Use full screen width, but account for header height
    const maxWidth = screenWidth;
    const maxHeight = availableHeight;

    let imageWidth = maxWidth;
    let imageHeight = maxHeight;

    if (imageDimensions) {
      const aspectRatio = imageDimensions.width / imageDimensions.height;
      const screenAspectRatio = maxWidth / maxHeight;
      
      if (aspectRatio > screenAspectRatio) {
        // Image is wider - fill width, height will be less
        imageWidth = maxWidth;
        imageHeight = maxWidth / aspectRatio;
      } else {
        // Image is taller - fill height, width will be less
        imageHeight = maxHeight;
        imageWidth = maxHeight * aspectRatio;
      }
    }

    // Pinch gesture for zoom
    const pinchGesture = Gesture.Pinch()
      .onUpdate((e) => {
        scale.value = savedScale.value * e.scale;
        // Limit zoom between 1x and 5x
        scale.value = Math.max(1, Math.min(5, scale.value));
      })
      .onEnd(() => {
        savedScale.value = scale.value;
        // Reset to 1x if zoomed out too much
        if (scale.value < 1.1) {
          scale.value = withSpring(1);
          savedScale.value = 1;
          translateX.value = withSpring(0);
          translateY.value = withSpring(0);
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
        }
      });

    // Pan gesture for dragging when zoomed
    // On Android, configure activeOffset to make it more responsive
    const panGesture = Gesture.Pan()
      .minPointers(1)
      .maxPointers(1)
      .activeOffsetX([-10, 10]) // Activate after 10px horizontal movement
      .activeOffsetY([-10, 10]) // Activate after 10px vertical movement
      .onUpdate((e) => {
        // Only pan if zoomed in
        if (scale.value > 1) {
          translateX.value = savedTranslateX.value + e.translationX;
          translateY.value = savedTranslateY.value + e.translationY;
        }
      })
      .onEnd(() => {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        // Constrain panning to image bounds
        const maxTranslateX = (imageWidth * scale.value - maxWidth) / 2;
        const maxTranslateY = (imageHeight * scale.value - maxHeight) / 2;
        if (Math.abs(translateX.value) > maxTranslateX) {
          translateX.value = withSpring(Math.sign(translateX.value) * maxTranslateX);
          savedTranslateX.value = translateX.value;
        }
        if (Math.abs(translateY.value) > maxTranslateY) {
          translateY.value = withSpring(Math.sign(translateY.value) * maxTranslateY);
          savedTranslateY.value = translateY.value;
        }
      });

    // Double tap to zoom
    const doubleTapGesture = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e) => {
        if (scale.value > 1.5) {
          // Zoom out
          scale.value = withSpring(1);
          savedScale.value = 1;
          translateX.value = withSpring(0);
          translateY.value = withSpring(0);
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
        } else {
          // Zoom in to 2x
          scale.value = withSpring(2);
          savedScale.value = 2;
        }
      });

    // Compose gestures for Android compatibility
    // Use Simultaneous for pinch+pan so they can work together
    // Use Race so double-tap takes priority over pinch+pan
    const pinchAndPan = Gesture.Simultaneous(pinchGesture, panGesture);
    const composedGesture = Gesture.Race(doubleTapGesture, pinchAndPan);

    return (
      <View style={styles.imageContainer}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View
            style={[
              styles.imageScrollContent,
              {
                width: '100%',
                height: '100%',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 0, // Remove padding for full screen
              },
            ]}
          >
            <Animated.View style={animatedImageStyle}>
              <AuthenticatedImage
                source={{ uri: fileUrl }}
                style={[
                  styles.image,
                  {
                    width: imageWidth,
                    height: imageHeight,
                    maxWidth: maxWidth,
                    maxHeight: maxHeight,
                  }
                ]}
                contentFit="contain"
                onError={(error: Error | string) => {
                  console.error('Image load error:', error);
                  setError('Failed to load image. The file may be corrupted or in an unsupported format.');
                }}
                onLoad={() => {
                  console.log('Image loaded successfully');
                }}
              />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
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

    // For PDFs, use native PDF viewer if available (development builds only)
    // In Expo Go, fall back to WebView or external opening
    if (isPdfFile(fileType)) {
      // Check if native PDF viewer is available
      if (Pdf && pdfLocalUri) {
        // Native PDF viewer available - use it
        console.log('📄 Using native PDF viewer (react-native-pdf)');
        return (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <Pdf
              source={{ uri: pdfLocalUri, cache: true }}
              onLoadComplete={(numberOfPages: number) => {
                console.log(`✅ PDF loaded successfully: ${numberOfPages} pages`);
                setLoading(false);
              }}
              onPageChanged={(page: number, numberOfPages: number) => {
                console.log(`PDF page ${page} of ${numberOfPages}`);
              }}
              onError={(error: Error | string) => {
                console.error('PDF render error:', error);
                setError('Failed to render PDF. The file may be corrupted.');
              }}
              style={{
                flex: 1,
                width: screenWidth,
                height: screenHeight,
                backgroundColor: colors.background,
              }}
              enablePaging={true}
              horizontal={false}
              spacing={10}
              enableRTL={false}
              enableAnnotationRendering={true}
              fitPolicy={0} // 0 = width, 1 = height, 2 = both
              singlePage={false}
              page={1}
              scale={1.0}
              minScale={0.5}
              maxScale={3.0}
              activityIndicator={
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={dynamicStyles.loadingText}>Loading PDF...</Text>
                </View>
              }
            />
          </View>
        );
      }

      // Native PDF viewer not available (Expo Go or no native module).
      // Expo Go: use WebView + base64 so PDFs can still be viewed in-app.
      if (isExpoGo || !Pdf) {
        if (isExpoGo && webViewPdfDataUri) {
          return (
            <WebView
              source={{ html: buildExpoGoPdfViewerHtml(webViewPdfDataUri) }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              originWhitelist={['*']}
              mixedContentMode="compatibility"
              scalesPageToFit={Platform.OS === 'android'}
              setSupportZoom={false}
              showsHorizontalScrollIndicator={true}
              showsVerticalScrollIndicator={true}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'log') {
                    console.log('[PDF.js]', data.message);
                  } else if (data.type === 'error') {
                    console.error('[PDF.js Error]', data.message);
                    setError(`PDF.js error: ${data.message}`);
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('PDF WebView error:', nativeEvent);
                setError(`Failed to display PDF: ${nativeEvent.description || 'Unknown error'}`);
              }}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('PDF WebView HTTP error:', nativeEvent);
                setError(`HTTP error loading PDF: ${nativeEvent.statusCode}`);
              }}
            />
          );
        }
        if (isExpoGo && fileUrl && authToken && !webViewPdfDataUri) {
          return (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={dynamicStyles.loadingText}>Loading PDF...</Text>
            </View>
          );
        }
        return (
          <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Ionicons name="document-text-outline" size={64} color={colors.primary} />
            <Text style={[dynamicStyles.errorText, { color: colors.textSecondary, marginTop: 16, textAlign: 'center' }]}>
              {isExpoGo ? 'PDF could not be loaded in Expo Go.' : 'Native PDF viewer requires a development build.'}
            </Text>
            <Text style={[dynamicStyles.errorText, { color: colors.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center' }]}>
              {isExpoGo ? 'Try again or open in your browser.' : 'Run with a dev or production build to view PDFs in-app.'}
            </Text>
            <TouchableOpacity
              style={{
                marginTop: 24,
                backgroundColor: colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 14,
                borderRadius: 10,
              }}
              onPress={async () => {
                try {
                  if (fileUrl) await Linking.openURL(fileUrl);
                } catch (err: any) {
                  Alert.alert('Error', 'Failed to open PDF. Please try again.');
                }
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                Open in Browser
              </Text>
            </TouchableOpacity>
          </View>
        );
      }

      // Native module available but PDF still downloading
      if (loading || !pdfLocalUri) {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={dynamicStyles.loadingText}>Loading PDF...</Text>
          </View>
        );
      }

      // Error downloading PDF for native viewer
      if (error) {
        return (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={64} color="#FF3B30" />
            <Text style={[dynamicStyles.errorText, { color: colors.textSecondary }]}>{error}</Text>
            <TouchableOpacity
              style={{
                marginTop: 16,
                backgroundColor: '#007AFF',
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
              }}
              onPress={() => {
                setError(null);
                setPdfLocalUri(null);
                // Retry download
                const downloadPdf = async () => {
                  if (!fileUrl || !authToken) return;
                  try {
                    setLoading(true);
                    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
                    if (!cacheDir) return;
                    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const localUri = `${cacheDir}${sanitizedFileName}`;
                    const downloadResult = await FileSystem.downloadAsync(fileUrl, localUri, {
                      headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'X-Platform': Platform.OS
                      }
                    });
                    setPdfLocalUri(downloadResult.uri);
                    setLoading(false);
                  } catch (err: any) {
                    setError('Failed to load PDF. Please try again.');
                    setLoading(false);
                  }
                };
                downloadPdf();
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        );
      }
    }

    // Office documents converted to PDF: Use PDF viewer (same as PDFs)
    // Check if we have a PDF data URI (Expo Go) or local PDF file (production)
    if (isOfficeDocument(fileType)) {
      // Expo Go: Use PDF.js viewer with data URI if available
      // Wait for PDF data URI to be ready
      if (isExpoGo) {
        if (officePdfDataUri) {
          return (
            <WebView
              source={{ html: buildExpoGoPdfViewerHtml(officePdfDataUri) }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              originWhitelist={['*']}
              mixedContentMode="compatibility"
              scalesPageToFit={Platform.OS === 'android'}
              setSupportZoom={false}
              showsHorizontalScrollIndicator={true}
              showsVerticalScrollIndicator={true}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'log') {
                    console.log('[PDF.js]', data.message);
                  } else if (data.type === 'error') {
                    console.error('[PDF.js Error]', data.message);
                    setError(`PDF.js error: ${data.message}`);
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('PDF WebView error:', nativeEvent);
                setError('Failed to load PDF');
              }}
              onLoadEnd={() => {
                console.log('PDF WebView loaded successfully');
                setLoading(false);
              }}
            />
          );
        } else if (loading) {
          // Still loading the PDF data URI
          return (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={dynamicStyles.loadingText}>Converting to PDF...</Text>
            </View>
          );
        }
      }
      
      // Production Android: Use native PDF viewer if we have local PDF file
      if (!isExpoGo && Pdf && webViewLocalUri && webViewLocalUri.endsWith('.pdf')) {
        console.log('📄 Using native PDF viewer for converted Office document');
        return (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <Pdf
              source={{ uri: webViewLocalUri, cache: true }}
              onLoadComplete={(numberOfPages: number) => {
                console.log(`✅ Office document (converted to PDF) loaded successfully: ${numberOfPages} pages`);
                setLoading(false);
              }}
              onPageChanged={(page: number, numberOfPages: number) => {
                console.log(`PDF page ${page} of ${numberOfPages}`);
              }}
              onError={(error: Error | string) => {
                console.error('PDF render error:', error);
                setError('Failed to render PDF. The file may be corrupted.');
              }}
              style={{
                flex: 1,
                width: screenWidth,
                height: screenHeight,
                backgroundColor: colors.background,
              }}
              enablePaging={true}
              horizontal={false}
              spacing={10}
              enableRTL={false}
              enableAnnotationRendering={true}
              fitPolicy={0}
              singlePage={false}
              page={1}
              scale={1.0}
              minScale={0.5}
              maxScale={3.0}
              activityIndicator={
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={dynamicStyles.loadingText}>Loading PDF...</Text>
                </View>
              }
            />
          </View>
        );
      }
    }
    
    // Use the AuthenticatedWebView for Office documents (fallback if PDF viewer not available)
    // On native platforms (Android/iOS), wait for webViewLocalUri so the WebView doesn't load the URL without auth
    // iOS WebView doesn't reliably send headers, so we need to download locally first
    if (Platform.OS !== 'web' && !webViewLocalUri && fileUrl && authToken) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={dynamicStyles.loadingText}>Loading document...</Text>
        </View>
      );
    }
    return (
      <AuthenticatedWebView 
        fileUrl={fileUrl} 
        authToken={authToken} 
        fileName={fileName} 
        fileType={fileType}
        localFileUri={Platform.OS !== 'web' ? webViewLocalUri : undefined}
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

    const isImage = isImageFile(fileType, fileKind, fileCategory);
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

  // Use same layout for all file types: header + content (no overlay for images)
  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <SafeAreaView 
        style={dynamicStyles.container} 
        edges={['left', 'right', 'bottom']}
      >
        <View style={dynamicStyles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={dynamicStyles.title} numberOfLines={1}>
            {getViewerTitle()}
          </Text>
          <View style={styles.placeholder} />
        </View>
        <View style={[styles.content, isImageFile(fileType, fileKind, fileCategory) && styles.imageViewerContent]}>
          {renderContent()}
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
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  imageViewerContent: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageViewerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  imageViewerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  imageViewerCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.95)',
    marginHorizontal: 12,
  },
  imageContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  imageScrollContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0, // No padding for full-screen image viewer
  },
  image: {
    backgroundColor: 'transparent',
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
    backgroundColor: '#fff',
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
