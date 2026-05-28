import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    AI_FM_HELP_ACTIONS,
    AI_FM_HELP_INTRO,
} from '../../constants/aiFileManagerHelp';
import { useThemeColors } from '../../hooks/useThemeColors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** In-sheet overlay — must not use Modal (parent sheet is already a Modal; iOS blocks nested modals). */
export default function AiFileManagerHelpModal({ visible, onClose }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close help" />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.helpIcon, { backgroundColor: colors.primary + '22' }]}>
            <Ionicons name="help" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text, flex: 1 }]}>
            AI FM - what you can ask
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close help">
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>{AI_FM_HELP_INTRO}</Text>
          {AI_FM_HELP_ACTIONS.map((action) => (
            <Text key={action.title} style={[styles.actionRow, { color: colors.text }]}>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={{ color: colors.textSecondary }}> — {action.description}</Text>
            </Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderRadius: 14,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  helpIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600' },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  actionRow: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  actionTitle: { fontWeight: '600' },
});
