import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';

interface Props {
  position?: number;
  total?: number;
  isMyTurn?: boolean;
}

export default function SigningOrderStrip({ position, total, isMyTurn }: Props) {
  const colors = useThemeColors();
  if (!total || total <= 1) return null;
  return (
    <View style={[styles.strip, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: isMyTurn ? colors.primary : colors.textSecondary }]}>
        {isMyTurn
          ? `Your turn · Signer ${position ?? '?'} of ${total}`
          : `Waiting · Signer ${position ?? '?'} of ${total}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  text: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
