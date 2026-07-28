import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../hooks/useThemeColors';
import { formatFillDate } from '../../utils/fillDate';
import MinimizableBottomSheet from '../MinimizableBottomSheet';

interface Props {
  visible: boolean;
  fieldLabel?: string;
  value: Date;
  onClose: () => void;
  onSave: (dateStr: string) => void;
  /** Bump on every open so a minimized sheet expands again. */
  expandNonce?: number;
}

function getValidDate(d: Date | undefined): Date {
  if (d != null && !Number.isNaN(d.getTime())) return d;
  return new Date();
}

export default function FillDatePickerModal({
  visible,
  fieldLabel,
  value,
  onClose,
  onSave,
  expandNonce = 0,
}: Props) {
  const colors = useThemeColors();
  const [pickerValue, setPickerValue] = useState(value);
  const iosPickerTheme = colors.isDark ? 'dark' : 'light';

  useEffect(() => {
    if (visible) setPickerValue(getValidDate(value));
  }, [visible, value]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 8,
        },
        title: {
          flex: 1,
          textAlign: 'center',
          fontSize: 16,
          fontWeight: '600',
          color: colors.text,
          marginHorizontal: 8,
        },
        cancelButton: {
          fontSize: 16,
          color: colors.textSecondary,
        },
        doneButton: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.tint,
        },
        headerRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        iconBtn: { paddingHorizontal: 2 },
        picker: {
          width: '100%',
          height: 200,
        },
      }),
    [colors]
  );

  if (Platform.OS !== 'ios') return null;

  const handleDone = () => {
    onSave(formatFillDate(pickerValue));
    onClose();
  };

  return (
    <MinimizableBottomSheet
      visible={visible}
      onClose={onClose}
      expandNonce={expandNonce}
      heightRatio={0.38}
      showHandle={false}
      renderHeader={({ minimized, onMinimize, onExpand, onClose }) => (
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {fieldLabel || 'Select date'}
          </Text>
          <View style={styles.headerRight}>
            {!minimized ? (
              <TouchableOpacity onPress={onMinimize} hitSlop={8} style={styles.iconBtn}>
                <Text style={styles.cancelButton}>↓</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onExpand} hitSlop={8} style={styles.iconBtn}>
                <Text style={styles.cancelButton}>↑</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleDone} hitSlop={8}>
              <Text style={styles.doneButton}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    >
      <DateTimePicker
        value={getValidDate(pickerValue)}
        mode="date"
        display="spinner"
        themeVariant={iosPickerTheme}
        onChange={(_, date) => {
          if (date) setPickerValue(date);
        }}
        style={styles.picker}
        textColor={colors.text}
        accentColor={colors.primary}
      />
    </MinimizableBottomSheet>
  );
}
