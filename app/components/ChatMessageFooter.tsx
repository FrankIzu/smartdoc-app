import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';

export interface CitationItem {
  source_type?: string;
  source_name?: string;
  filename?: string;
  excerpt?: string;
  chunk_content?: string;
  document_id?: number;
  source_id?: string;
}

export interface ChatMessageFooterProps {
  /** Chat history id (e.g. selectedChat.id) */
  chatHistoryId?: number;
  /** Index of the user+assistant pair (0-based) */
  messagePairIndex: number;
  /** Previous user message content (query) */
  queryText?: string;
  /** Assistant response content */
  responseText: string;
  /** Message timestamp for display */
  createdAt: string;
  /** Sources/citations/references for this response (shown in sources dialog) */
  citations?: CitationItem[] | null;
  /** Initial feedback state from server (1 = up, -1 = down, null = none) */
  initialFeedbackScore?: number | null;
  /** Called after feedback is submitted so parent can persist */
  onFeedbackSubmitted?: (score: number | null) => void;
}

function truncateWithEllipsis(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

function formatTime(dateString: string): string {
  try {
    if (!dateString) return '';
    const iso = dateString.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)
      ? dateString
      : dateString + (dateString.includes('T') ? 'Z' : '');
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ChatMessageFooter({
  chatHistoryId,
  messagePairIndex,
  queryText,
  responseText,
  createdAt,
  citations = null,
  initialFeedbackScore = null,
  onFeedbackSubmitted,
}: ChatMessageFooterProps) {
  const colors = useThemeColors();
  const [feedbackScore, setFeedbackScore] = useState<number | null>(initialFeedbackScore ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const sourceList = citations && citations.length > 0 ? citations : [];

  const handleCopy = async () => {
    if (!responseText) return;
    try {
      await Clipboard.setStringAsync(responseText);
      setCopied(true);
      Toast.show({ type: 'success', text1: 'Copied to clipboard', visibilityTime: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to copy' });
    }
  };

  const submitFeedback = async (score: number) => {
    if (isSubmitting) return;
    const newScore = feedbackScore === score ? null : score;
    const scoreToSend = newScore === null ? 0 : newScore;

    setIsSubmitting(true);
    setFeedbackScore(newScore);

    try {
      await apiClient.submitChatFeedback({
        chat_history_id: chatHistoryId,
        message_pair_index: messagePairIndex,
        query_text: queryText,
        response_text: responseText,
        feedback_score: scoreToSend,
        workspace_id: null,
        conversation_id: null,
      });
      onFeedbackSubmitted?.(newScore);
    } catch {
      setFeedbackScore(feedbackScore);
      Toast.show({ type: 'error', text1: 'Failed to submit feedback' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const iconColor = colors.textSecondary ?? '#666';
  const activeUp = feedbackScore === 1 ? '#22c55e' : iconColor;
  const activeDown = feedbackScore === -1 ? '#f97316' : iconColor;

  return (
    <View style={[styles.row, styles.footerBelowResponse]}>
      <View style={styles.icons}>
        <TouchableOpacity
          onPress={handleCopy}
          disabled={!responseText}
          style={styles.iconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={18}
            color={copied ? '#007AFF' : iconColor}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => submitFeedback(1)}
          disabled={isSubmitting}
          style={styles.iconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons
            name={feedbackScore === 1 ? 'thumb-up' : 'thumb-up-outline'}
            size={20}
            color={activeUp}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => submitFeedback(-1)}
          disabled={isSubmitting}
          style={styles.iconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons
            name={feedbackScore === -1 ? 'thumb-down' : 'thumb-down-outline'}
            size={20}
            color={activeDown}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowSourcesModal(true)}
          style={styles.iconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="book-outline"
            size={20}
            color={sourceList.length > 0 ? iconColor : (colors.textLight ?? '#999')}
          />
        </TouchableOpacity>
      </View>
      <Text style={[styles.timestamp, { color: iconColor }]} numberOfLines={1}>
        {formatTime(createdAt)}
      </Text>

      <Modal
        visible={showSourcesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSourcesModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalOverlay}
          onPress={() => setShowSourcesModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.sourcesModal, { backgroundColor: colors.card }]}>
            <View style={[styles.sourcesModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sourcesModalTitle, { color: colors.text }]}>Sources</Text>
              <TouchableOpacity onPress={() => setShowSourcesModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sourcesModalScroll} contentContainerStyle={styles.sourcesModalContent}>
              {sourceList.length === 0 ? (
                <Text style={[styles.sourcesEmpty, { color: colors.textSecondary }]}>No sources for this response.</Text>
              ) : (
                sourceList.map((item, index) => {
                  const name = item.source_name || item.filename || item.source_type || `Source ${index + 1}`;
                  const excerpt = (item.excerpt || item.chunk_content || '').trim();
                  return (
                    <View key={index} style={[styles.sourceItem, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.sourceName, { color: colors.text }]} numberOfLines={2}>
                        {truncateWithEllipsis(name, 35)}
                      </Text>
                      {excerpt ? (
                        <Text style={[styles.sourceExcerpt, { color: colors.textSecondary }]} numberOfLines={3}>
                          {truncateWithEllipsis(excerpt, 35)}
                        </Text>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerBelowResponse: {
    marginTop: 12,
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    padding: 4,
  },
  timestamp: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  sourcesModal: {
    maxHeight: '70%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sourcesModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sourcesModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sourcesModalScroll: {
    maxHeight: 400,
  },
  sourcesModalContent: {
    padding: 16,
    paddingBottom: 24,
  },
  sourcesEmpty: {
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 24,
  },
  sourceItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '500',
  },
  sourceExcerpt: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
