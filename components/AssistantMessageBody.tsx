import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SermonCitationType } from '../utils/sermonParagraphLinks';
import {
  buildParagraphToCiteMap,
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
  const paras = useMemo(() => splitIntoDisplayParagraphs(clean), [clean]);
  const citeList = citations || [];
  const color = isPreview ? previewColor || textColor : textColor;

  if (!clean.trim()) return null;

  return (
    <View style={styles.wrap}>
      {paras.map((para, i) => {
        const segments = segmentParagraphForLinksEnriched(para, citeList, citeMap);
        return (
          <View key={i} style={styles.paraBlock}>
            <Text style={[styles.line, { color }]}>
              {segments.map((seg, j) =>
                seg.type === 'text' ? (
                  <Text key={j}>{seg.text}</Text>
                ) : (
                  <Text
                    key={j}
                    style={styles.link}
                    onPress={() =>
                      onOpenSermon(
                        seg.fileId,
                        seg.openStart,
                        seg.title,
                        seg.openEnd
                      )
                    }
                  >
                    {seg.text}
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

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  paraBlock: { marginBottom: 10 },
  line: { fontSize: 16, lineHeight: 22 },
  link: { color: '#007AFF', textDecorationLine: 'underline' },
});
