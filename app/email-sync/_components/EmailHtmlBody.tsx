import { WebView } from 'react-native-webview';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function EmailHtmlBody({
  html,
  text,
  textColor,
  background,
  isDark,
  expanded,
}: {
  html?: string | null;
  text?: string | null;
  textColor: string;
  background: string;
  isDark?: boolean;
  expanded?: boolean;
}) {
  const sourceHtml = useMemo(() => {
    const inner = (html || '').trim()
      ? html
      : `<pre style="white-space:pre-wrap;font-family:system-ui">${escapeHtml(text || '')}</pre>`;
    const themeCss = isDark
      ? `html,body{color:${textColor}!important;background:${background}!important;color-scheme:dark}
body *:not(img):not(a){color:inherit!important;background-color:transparent!important;border-color:#4b5563}
a{color:#93c5fd!important;background:transparent!important}`
      : `html,body{color:${textColor};background:${background};color-scheme:light}
a{color:#2563eb}`;
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body{margin:0;padding:8px;font:15px/1.5 -apple-system,sans-serif;}
img{max-width:100%;height:auto}
${themeCss}
</style></head><body>${inner}</body></html>`;
  }, [html, text, textColor, background, isDark]);

  if (!(html || '').trim() && !(text || '').trim()) {
    return <Text style={{ color: textColor, opacity: 0.6, padding: 8 }}>(empty)</Text>;
  }

  return (
    <View style={[styles.wrap, expanded ? styles.wrapExpanded : styles.wrapCollapsed]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: sourceHtml }}
        javaScriptEnabled={false}
        scrollEnabled
        nestedScrollEnabled
        style={[styles.web, { backgroundColor: background }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 8, overflow: 'hidden' },
  wrapCollapsed: { minHeight: 88, maxHeight: 200 },
  wrapExpanded: { minHeight: 220, maxHeight: 480 },
  web: { flex: 1 },
});
