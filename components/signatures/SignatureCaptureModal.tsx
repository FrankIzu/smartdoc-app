import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { useThemeColors } from '../../hooks/useThemeColors';
import MinimizableBottomSheet from '../MinimizableBottomSheet';

interface Props {
  visible: boolean;
  fieldLabel?: string;
  onClose: () => void;
  onSave: (dataUri: string) => void;
  /** signature vs initials — adjusts labels only; both support type and draw. */
  variant?: 'signature' | 'initials';
  /** When false, only cursive typing is offered. Default true. */
  allowDraw?: boolean;
  /** Bump on every open so a minimized sheet expands again. */
  expandNonce?: number;
}

export default function SignatureCaptureModal({
  visible,
  fieldLabel,
  onClose,
  onSave,
  variant = 'signature',
  allowDraw = true,
  expandNonce = 0,
}: Props) {
  const isInitials = variant === 'initials';
  const colors = useThemeColors();
  const [fontsLoaded] = useFonts({
    DancingScript_400Regular: require('../../assets/fonts/DancingScript_400Regular.ttf'),
  });
  const [mode, setMode] = useState<'draw' | 'type'>('type');
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [typedText, setTypedText] = useState('');
  const canvasRef = useRef<View>(null);
  const typePreviewRef = useRef<View>(null);
  const modeRef = useRef(mode);
  const currentPathRef = useRef('');
  const prevVisibleRef = useRef(false);
  modeRef.current = mode;
  currentPathRef.current = currentPath;

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setMode('type');
      setPaths([]);
      setCurrentPath('');
      setTypedText('');
    }
    if (!visible) {
      Keyboard.dismiss();
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => modeRef.current === 'draw',
        onMoveShouldSetPanResponder: () => modeRef.current === 'draw',
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const next = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
          currentPathRef.current = next;
          setCurrentPath(next);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrentPath((p) => {
            const next = `${p} L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
            currentPathRef.current = next;
            return next;
          });
        },
        onPanResponderRelease: () => {
          const path = currentPathRef.current;
          if (path) {
            setPaths((prev) => [...prev, path]);
          }
          currentPathRef.current = '';
          setCurrentPath('');
        },
      }),
    [],
  );

  const handleClear = useCallback(() => {
    setPaths([]);
    setCurrentPath('');
    currentPathRef.current = '';
    setTypedText('');
  }, []);

  const handleSave = async () => {
    try {
      if (mode === 'type') {
        const trimmed = typedText.trim();
        if (!trimmed || !typePreviewRef.current) return;
        const uri = await captureRef(typePreviewRef, {
          format: 'png',
          quality: 0.92,
          result: 'tmpfile',
        });
        const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
        const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
        onSave(`data:image/png;base64,${b64}`);
        handleClear();
        onClose();
        return;
      }
      if (!canvasRef.current || paths.length === 0) return;
      const uri = await captureRef(canvasRef, { format: 'png', quality: 0.92, result: 'tmpfile' });
      const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
      const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
      onSave(`data:image/png;base64,${b64}`);
      handleClear();
      onClose();
    } catch {
      onClose();
    }
  };

  const cursiveFont = fontsLoaded ? { fontFamily: 'DancingScript_400Regular' as const } : undefined;

  return (
    <MinimizableBottomSheet
      visible={visible}
      onClose={onClose}
      expandNonce={expandNonce}
      title={fieldLabel || (isInitials ? 'Add initials' : 'Sign here')}
      heightRatio={0.72}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }} bounces={false}>
          <View style={{ paddingHorizontal: 16 }}>
            {allowDraw ? (
              <View style={styles.tabs}>
                {(['type', 'draw'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.tab,
                      mode === m && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
                    ]}
                    onPress={() => setMode(m)}
                  >
                    <Text style={{ color: mode === m ? colors.primary : colors.textSecondary }}>
                      {m === 'draw' ? 'Draw' : 'Type'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {allowDraw && mode === 'draw' ? (
              <View style={[styles.canvasFrame, { borderColor: colors.border, backgroundColor: `${colors.border}33` }]}>
                <View
                  ref={canvasRef}
                  style={styles.canvasCapture}
                  collapsable={false}
                  {...panResponder.panHandlers}
                >
                  <Svg width="100%" height="100%">
                    {paths.map((d, i) => (
                      <Path key={i} d={d} stroke="#111" strokeWidth={2} fill="none" />
                    ))}
                    {currentPath ? (
                      <Path d={currentPath} stroke="#111" strokeWidth={2} fill="none" />
                    ) : null}
                  </Svg>
                </View>
              </View>
            ) : (
              <View style={styles.typeArea}>
                <TextInput
                  style={[
                    styles.typeInput,
                    { color: colors.text, borderColor: colors.border },
                    cursiveFont,
                  ]}
                  value={typedText}
                  onChangeText={setTypedText}
                  placeholder={isInitials ? 'Type your initials' : 'Type your signature'}
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete={isInitials ? 'off' : 'name'}
                  textContentType={isInitials ? 'none' : 'name'}
                  importantForAutofill={isInitials ? 'no' : 'yes'}
                  autoFocus
                  returnKeyType="done"
                  blurOnSubmit
                />
                {typedText.trim() && fontsLoaded ? (
                  <Text style={[styles.typePreviewHint, { color: colors.textSecondary }, cursiveFont]}>
                    Preview: {typedText}
                  </Text>
                ) : null}
                {!fontsLoaded ? <ActivityIndicator color={colors.primary} style={styles.fontSpinner} /> : null}
                <View ref={typePreviewRef} collapsable={false} pointerEvents="none" style={styles.typeCaptureTarget}>
                  <Text style={[styles.cursiveCapture, cursiveFont]}>{typedText || ' '}</Text>
                </View>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity onPress={handleClear} style={styles.btn}>
                <Text style={{ color: colors.textSecondary }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.btn}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={() => void handleSave()}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </MinimizableBottomSheet>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 24,
    minHeight: 320,
  },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  tabs: { flexDirection: 'row', marginBottom: 12 },
  tab: { marginRight: 16, paddingBottom: 6 },
  canvasFrame: {
    height: 180,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  canvasCapture: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  typeArea: { gap: 8 },
  typeInput: {
    height: 56,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 28,
  },
  typePreviewHint: {
    fontSize: 16,
    paddingHorizontal: 4,
  },
  fontSpinner: { alignSelf: 'center' },
  typeCaptureTarget: {
    position: 'absolute',
    width: 400,
    height: 120,
    left: -2000,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  cursiveCapture: {
    fontSize: 48,
    color: '#111',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  btn: { padding: 8 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveText: { color: '#fff', fontWeight: '600' },
});
