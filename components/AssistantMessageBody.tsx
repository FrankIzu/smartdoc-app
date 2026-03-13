import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SermonCitationType } from '../utils/sermonParagraphLinks';
import {
  buildParagraphToCiteMap,
  normalizeAssistantListMarkdown,
  segmentAssistantBody,
  segmentParagraphForLinksEnriched,
  splitIntoDisplayParagraphs,
  stripCiteAnchors,
  stripChartLinkLine,
} from '../utils/sermonParagraphLinks';

export interface AssistantMessageBodyProps {
  content: string;
  citations?: SermonCitationType[] | null;
  isPreview?: boolean;
  chartFileId?: number;
  textColor: string;
  previewColor?: string;
  onOpenSermon: (
    fileId: number,
    paragraph: number,
    title?: string,
    paragraphEnd?: number
  ) => void;
}

/** Turn `foo **bar** baz` into Text children with bold mid segments. */
function renderInlineBold(text: string, color: string, boldWeight: '600' | '700' = '600') {
  const parts = (text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      return (
        <Text key={i} style={{ fontWeight: boldWeight, color }}>
          {m[1]}
        </Text>
      );
    }
    return (
      <Text key={i} style={{ color }}>
        {part}
      </Text>
    );
  });
}

export default function AssistantMessageBody({
  content,
  citations,
  isPreview,
  chartFileId,
  textColor,
  previewColor,
  onOpenSermon,
}: AssistantMessageBodyProps) {
  const citeMap = useMemo(() => buildParagraphToCiteMap(content || ''), [content]);
  const displayRaw = useMemo(
    () => stripChartLinkLine(content || '', !!chartFileId),
    [content, chartFileId]
  );
  const clean = useMemo(() => stripCiteAnchors(displayRaw), [displayRaw]);
  const normalized = useMemo(() => normalizeAssistantListMarkdown(clean), [clean]);
  const bodySegments = useMemo(() => segmentAssistantBody(normalized), [normalized]);
  const hasList = bodySegments.some((s) => s.type === 'ul');
  const citeList = citations || [];
  const color = isPreview ? previewColor || textColor : textColor;

  if (!clean.trim()) return null;

  const renderProseBlock = (para: string, keyPrefix: string) => {
    const segments = segmentParagraphForLinksEnriched(para, citeList, citeMap);
    return (
      <View key={keyPrefix} style={styles.paraBlock}>
        <Text style={[styles.line, { color }]}>
          {segments.map((seg, j) =>
            seg.type === 'text' ? (
              <Text key={j}>{renderInlineBold(seg.text, color)}</Text>
            ) : (
              <Text
                key={j}
                style={styles.link}
                onPress={() =>
                  onOpenSermon(seg.fileId, seg.openStart, seg.title, seg.openEnd)
                }
              >
                {seg.text}
              </Text>
            )
          )}
        </Text>
      </View>
    );
  };

  if (hasList) {
    return (
      <View style={styles.wrap}>
        {bodySegments.map((seg, i) => {
          if (seg.type === 'ul') {
            return (
              <View key={`ul-${i}`} style={styles.listBlock}>
                {seg.items.map((item, j) => {
                  const trimmed = item.replace(/^[-*•]\s+/, '');
                  const bulletSegments = segmentParagraphForLinksEnriched(
                    trimmed,
                    citeList,
                    citeMap
                  );
                  return (
                    <View key={j} style={styles.listRow}>
                      <Text style={[styles.bullet, { color }]}>{'\u2022 '}</Text>
                      <Text style={[styles.line, styles.listItemText, { color }]}>
                        {bulletSegments.map((seg2, k) =>
                          seg2.type === 'text' ? (
                            <Text key={k}>{renderInlineBold(seg2.text, color)}</Text>
                          ) : (
                            <Text
                              key={k}
                              style={styles.link}
                              onPress={() =>
                                onOpenSermon(
                                  seg2.fileId,
                                  seg2.openStart,
                                  seg2.title,
                                  seg2.openEnd
                                )
                              }
                            >
                              {seg2.text}
                            </Text>
                          )
                        )}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          }
          const paras = splitIntoDisplayParagraphs(seg.text);
          return (
            <React.Fragment key={`prose-${i}`}>
              {paras.map((p, j) => renderProseBlock(p, `prose-${i}-${j}`))}
            </React.Fragment>
          );
        })}
      </View>
    );
  }

  const paras = splitIntoDisplayParagraphs(normalized);
  return (
    <View style={styles.wrap}>
      {paras.map((para, i) => renderProseBlock(para, `p-${i}`))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  paraBlock: { marginBottom: 10 },
  line: { fontSize: 16, lineHeight: 22 },
  link: { color: '#007AFF', textDecorationLine: 'underline' },
  listBlock: { marginBottom: 10, alignSelf: 'stretch' },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  bullet: { fontSize: 16, lineHeight: 22, width: 18 },
  listItemText: { flex: 1 },
});
