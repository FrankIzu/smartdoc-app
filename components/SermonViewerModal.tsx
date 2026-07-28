import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { secureStorage } from '../utils/storage';
import MinimizableBottomSheet from './MinimizableBottomSheet';

export interface SermonViewerModalProps {
  visible: boolean;
  fileId: number;
  paragraph: number;
  paragraphEnd?: number;
  title?: string;
  onClose: () => void;
  /** When set, PDF WebView loads this URL (e.g. signed chat link); no Bearer header. */
  pdfUri?: string | null;
  /** Preferred starting tab when sermon text is available. */
  defaultTab?: 'text' | 'pdf';
  /** Bump on every open so a minimized sheet expands again. */
  expandNonce?: number;
}

/**
 * Full HTML document wrapper only — sermon fragment in <body>.
 * Highlight/scroll run via injectedJavaScript so </script> inside sermon HTML cannot break the page.
 */
function buildSermonDocument(bodyHtml: string): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>
html, body { margin: 0; padding: 0; min-height: 100%; }
body { font-family: -apple-system, system-ui, sans-serif; padding: 14px; font-size: 16px; line-height: 1.55; color: #111; background: #fff; }
.sermon-para-highlight { background: #fff8c5 !important; padding: 8px 6px; border-radius: 6px; box-sizing: border-box; }
.sermon-para-num { margin-right: 0.35em; color: #555; font-weight: 600; }
p { margin: 0.65em 0; }
</style></head><body>${bodyHtml}</body></html>`;
}

export default function SermonViewerModal({
  visible,
  fileId,
  paragraph,
  paragraphEnd,
  title,
  onClose,
  pdfUri = null,
  defaultTab = 'text',
  expandNonce = 0,
}: SermonViewerModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.88);
  const webMinHeight = Math.max(320, Math.round(windowHeight * 0.55));

  const [tab, setTab] = useState<'text' | 'pdf'>(defaultTab);
  const [textAvailable, setTextAvailable] = useState<boolean | null>(null);
  const [htmlDoc, setHtmlDoc] = useState<string>('');
  const [fetchingText, setFetchingText] = useState(false);
  const [webReady, setWebReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const webRef = useRef<WebView>(null);
  const pdfWebRef = useRef<WebView>(null);

  const start = paragraph;
  const end =
    paragraphEnd != null && paragraphEnd >= start ? paragraphEnd : start;

  const highlightScript =
    start > 0
      ? `
    (function(){
      try {
        var s = ${start}, e = ${end};
        document.querySelectorAll('p[id^="para-"]').forEach(function(p){
          var m = p.id.match(/^para-(\\d+)$/);
          if (m && !p.querySelector('.sermon-para-num')) {
            var span = document.createElement('span');
            span.className = 'sermon-para-num';
            span.textContent = m[1] + '. ';
            p.insertBefore(span, p.firstChild);
          }
        });
        var first = document.getElementById('para-' + s);
        if (first) {
          first.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
        for (var n = s; n <= e; n++) {
          var el = document.getElementById('para-' + n);
          if (el) el.classList.add('sermon-para-highlight');
        }
      } catch (e) {}
      true;
    })();
  `
      : 'true;';

  const loadSermonText = useCallback(async () => {
    if (!visible || !fileId) return;
    setFetchingText(true);
    setError(null);
    setHtmlDoc('');
    setTextAvailable(null);
    try {
      const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      const url = `${API_BASE_URL}/api/v1/web/files/${fileId}/sermon-html`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status === 404) {
        setTextAvailable(false);
        return;
      }
      if (!res.ok) {
        setTextAvailable(false);
        return;
      }
      const data = await res.json();
      if (!data?.success || typeof data?.html !== 'string' || !data.html.trim()) {
        setTextAvailable(false);
        return;
      }
      setHtmlDoc(buildSermonDocument(data.html));
      setTextAvailable(true);
    } catch {
      setTextAvailable(false);
    } finally {
      setFetchingText(false);
    }
  }, [visible, fileId]);

  useEffect(() => {
    if (visible) {
      secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN).then(setAuthToken);
      setTab(defaultTab);
      loadSermonText();
    } else {
      setHtmlDoc('');
      setWebReady(false);
      setError(null);
      setPdfError(null);
      setTextAvailable(null);
    }
  }, [visible, fileId, defaultTab, loadSermonText]);

  useEffect(() => {
    if (tab === 'text' && textAvailable === true) {
      setWebReady(false);
    }
  }, [tab, textAvailable]);

  const pdfSource = pdfUri
    ? { uri: pdfUri }
    : {
        uri: `${API_BASE_URL}/api/v1/web/files/${fileId}/view`,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      };

  const showTabs = textAvailable === true;
  const effectiveTab = showTabs ? tab : 'pdf';

  const headerTitle =
    (title || 'Document') +
    (paragraph > 0
      ? ` — par ${
          paragraphEnd != null && paragraphEnd > paragraph
            ? `${paragraph}–${paragraphEnd}`
            : paragraph
        }`
      : '');

  return (
    <MinimizableBottomSheet
      visible={visible}
      onClose={onClose}
      expandNonce={expandNonce}
      sheetHeight={sheetHeight}
      title={headerTitle}
    >
      {showTabs ? (
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setTab('text')}
            style={[styles.tab, effectiveTab === 'text' && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, effectiveTab === 'text' && styles.tabLabelActive]}>Text</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('pdf')}
            style={[styles.tab, effectiveTab === 'pdf' && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, effectiveTab === 'pdf' && styles.tabLabelActive]}>PDF</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.body, { minHeight: webMinHeight }]}>
            {fetchingText && textAvailable === null ? (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.muted}>Loading…</Text>
              </View>
            ) : null}

            {effectiveTab === 'text' && showTabs ? (
              <>
                {error && !fetchingText ? (
                  <View style={styles.centered}>
                    <Text style={styles.error}>{error}</Text>
                  </View>
                ) : null}
                {!error && htmlDoc ? (
                  <WebView
                    originWhitelist={['*']}
                    source={{ html: htmlDoc, baseUrl: API_BASE_URL || 'https://grabdocs.com' }}
                    style={[styles.web, { minHeight: webMinHeight }]}
                    scrollEnabled
                    javaScriptEnabled
                    domStorageEnabled
                    startInLoadingState={false}
                    ref={webRef}
                    onLoadEnd={() => {
                      if (start > 0) {
                        webRef.current?.injectJavaScript(highlightScript);
                        setTimeout(() => webRef.current?.injectJavaScript(highlightScript), 120);
                      }
                      setWebReady(true);
                    }}
                    onError={() => setError('Could not display sermon.')}
                    onHttpError={() => setError('Could not display sermon.')}
                    injectedJavaScript={start > 0 ? highlightScript : undefined}
                  />
                ) : null}
                {!fetchingText && !error && htmlDoc && !webReady ? (
                  <View style={[styles.loadingOverlay, { backgroundColor: 'rgba(255,255,255,0.85)' }]}>
                    <ActivityIndicator size="large" color="#007AFF" />
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {pdfError ? (
                  <View style={styles.centered}>
                    <Text style={styles.error}>{pdfError}</Text>
                  </View>
                ) : (
                  <WebView
                    key={pdfUri || `id-${fileId}`}
                    ref={pdfWebRef}
                    source={pdfSource}
                    style={[styles.web, { minHeight: webMinHeight }]}
                    originWhitelist={['*']}
                    scalesPageToFit
                    startInLoadingState
                    onLoadStart={() => setPdfError(null)}
                    onError={() => setPdfError('Could not load PDF.')}
                    onHttpError={() => setPdfError('Could not load PDF.')}
                  />
                )}
              </>
            )}
          </View>
    </MinimizableBottomSheet>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    flexShrink: 0,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 8 },
  closeBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  closeText: { color: '#007AFF', fontSize: 16 },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  tabActive: {
    backgroundColor: '#007AFF22',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  tabLabel: { fontSize: 15, color: '#666', fontWeight: '600' },
  tabLabelActive: { color: '#007AFF' },
  body: {
    flex: 1,
    width: '100%',
    backgroundColor: '#fff',
    position: 'relative',
  },
  web: {
    flex: 1,
    width: '100%',
    backgroundColor: '#fff',
    opacity: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    zIndex: 2,
  },
  centered: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  muted: { marginTop: 12, color: '#666', fontSize: 15 },
  error: { color: '#c00', textAlign: 'center', fontSize: 15 },
});
