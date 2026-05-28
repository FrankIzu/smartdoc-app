import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FileNameText from '../FileNameText';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { FillSubmission } from '../../services/fillApi';
import type { Envelope } from '../../types/signature';
import {
  envelopeSignerSummary,
  envelopeSourceTypeBadge,
  envelopeStatusBadge,
  formatEnvelopeListDate,
} from '../../utils/envelopeDisplay';
import {
  envelopeLastActivityIso,
  formatSignatureActivityLabel,
  submissionDisplayTitle,
  submissionLastActivityIso,
  templateLastActivityIso,
  type SignatureActivityItem,
} from '../../utils/signatureActivity';

interface Props {
  item: SignatureActivityItem;
  onPress: () => void;
  onSign?: () => void;
  onViewDocument?: () => void;
  onFillDocument?: () => void;
  onDeleteDocument?: () => void;
  onViewSubmission?: () => void;
  onViewSubmissions?: () => void;
  onShare?: () => void;
}

function Badge({ badge }: { badge: { label: string; backgroundColor: string; color: string } }) {
  return (
    <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
    </View>
  );
}

const IN_PROGRESS_BADGE = {
  label: 'In progress',
  backgroundColor: '#FEF3C7',
  color: '#92400E',
};

const COMPLETED_BADGE = {
  label: 'Completed',
  backgroundColor: '#DCFCE7',
  color: '#166534',
};

function EnvelopeRow({
  envelope,
  onPress,
  onSign,
}: {
  envelope: Envelope;
  onPress: () => void;
  onSign?: () => void;
}) {
  const colors = useThemeColors();
  const canSign = envelope.inbox_context?.can_sign && envelope.inbox_context?.is_my_turn;
  const statusBadge = envelopeStatusBadge(envelope.status);
  const sourceBadge = envelopeSourceTypeBadge(envelope);
  const signerSummary = envelopeSignerSummary(envelope, 'all');
  const activityLabel = formatSignatureActivityLabel(envelopeLastActivityIso(envelope), {
    uploadedAt: envelope.created_at,
  });
  const metaParts = [activityLabel, signerSummary].filter(Boolean);

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.body}>
        <FileNameText
          name={envelope.title || 'Untitled envelope'}
          style={[styles.title, { color: colors.text }]}
          sanitize={false}
        />
        <View style={styles.badgeRow}>
          <Badge badge={statusBadge} />
          {sourceBadge ? <Badge badge={sourceBadge} /> : null}
        </View>
        {metaParts.length > 0 ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>
            {metaParts.join(' · ')}
          </Text>
        ) : null}
      </View>
      {canSign && onSign ? (
        <TouchableOpacity
          style={[styles.signBtn, { backgroundColor: colors.primary }]}
          onPress={(e) => {
            e.stopPropagation?.();
            onSign();
          }}
        >
          <Text style={styles.signText}>Sign</Text>
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
  );
}

function TemplateRow({
  template,
  onPress,
  onViewDocument,
  onFillDocument,
  onDeleteDocument,
  onShare,
}: {
  template: NonNullable<SignatureActivityItem['template']>;
  onPress?: () => void;
  onViewDocument?: () => void;
  onFillDocument?: () => void;
  onDeleteDocument?: () => void;
  onShare?: () => void;
}) {
  const colors = useThemeColors();
  const activityIso = templateLastActivityIso(template);
  const activityLabel =
    formatSignatureActivityLabel(activityIso, { uploadedAt: template.created_at }) ??
    (activityIso ? `Updated ${formatEnvelopeListDate(activityIso)}` : null);

  const openMenu = useCallback(() => {
    Alert.alert(template.name || 'Document', undefined, [
      ...(onFillDocument ? [{ text: 'Continue filling', onPress: onFillDocument }] : []),
      ...(onViewDocument ? [{ text: 'View original', onPress: onViewDocument }] : []),
      ...(onShare ? [{ text: 'Share', onPress: onShare }] : []),
      ...(onDeleteDocument
        ? [{ text: 'Delete', style: 'destructive' as const, onPress: onDeleteDocument }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [onDeleteDocument, onFillDocument, onShare, onViewDocument, template.name]);

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress ?? onFillDocument}
      activeOpacity={0.7}
      disabled={!onPress && !onFillDocument}
    >
      <View style={styles.body}>
        <FileNameText
          name={template.name || 'Untitled document'}
          style={[styles.title, { color: colors.text }]}
          sanitize={false}
        />
        <View style={styles.badgeRow}>
          <Badge badge={IN_PROGRESS_BADGE} />
        </View>
        {activityLabel ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>
            {activityLabel}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.kebabBtn}
        onPress={(e) => {
          e.stopPropagation?.();
          openMenu();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Document actions"
        accessibilityRole="button"
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SubmissionRow({
  submission,
  onPress,
  onViewSubmission,
  onViewSubmissions,
  onShare,
}: {
  submission: FillSubmission;
  onPress?: () => void;
  onViewSubmission?: () => void;
  onViewSubmissions?: () => void;
  onShare?: () => void;
}) {
  const colors = useThemeColors();
  const filledIso = submissionLastActivityIso(submission);
  const filledDate = formatEnvelopeListDate(filledIso);
  const metaParts = [
    filledDate ? `Completed ${filledDate}` : null,
    submission.filled_by_name?.trim() || null,
  ].filter(Boolean);

  const openMenu = useCallback(() => {
    Alert.alert(submissionDisplayTitle(submission), undefined, [
      ...(onViewSubmission ? [{ text: 'View completed PDF', onPress: onViewSubmission }] : []),
      ...(onShare ? [{ text: 'Share', onPress: onShare }] : []),
      ...(onViewSubmissions ? [{ text: 'All submissions', onPress: onViewSubmissions }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [onShare, onViewSubmission, onViewSubmissions, submission]);

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress ?? onViewSubmission}
      activeOpacity={0.7}
      disabled={!onPress && !onViewSubmission}
    >
      <View style={styles.body}>
        <FileNameText
          name={submissionDisplayTitle(submission)}
          style={[styles.title, { color: colors.text }]}
          sanitize={false}
        />
        <View style={styles.badgeRow}>
          <Badge badge={COMPLETED_BADGE} />
        </View>
        {metaParts.length > 0 ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>
            {metaParts.join(' · ')}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.kebabBtn}
        onPress={(e) => {
          e.stopPropagation?.();
          openMenu();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Submission actions"
        accessibilityRole="button"
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function SignatureActivityListItem({
  item,
  onPress,
  onSign,
  onViewDocument,
  onFillDocument,
  onDeleteDocument,
  onViewSubmission,
  onViewSubmissions,
  onShare,
}: Props) {
  if (item.kind === 'envelope' && item.envelope) {
    return <EnvelopeRow envelope={item.envelope} onPress={onPress} onSign={onSign} />;
  }
  if (item.kind === 'fillable' && item.template) {
    return (
      <TemplateRow
        template={item.template}
        onPress={onFillDocument}
        onViewDocument={onViewDocument}
        onFillDocument={onFillDocument}
        onDeleteDocument={onDeleteDocument}
        onShare={onShare}
      />
    );
  }
  if (item.kind === 'submission' && item.submission) {
    return (
      <SubmissionRow
        submission={item.submission}
        onPress={onViewSubmission}
        onViewSubmission={onViewSubmission}
        onViewSubmissions={onViewSubmissions}
        onShare={onShare}
      />
    );
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  body: { flex: 1, marginRight: 8, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  meta: { fontSize: 12, lineHeight: 16 },
  signBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  signText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  kebabBtn: { padding: 4, marginLeft: 4 },
});
