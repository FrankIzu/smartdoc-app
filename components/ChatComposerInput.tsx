import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  CHAT_COMPOSER_FONT_SIZE,
  CHAT_COMPOSER_LINE_HEIGHT,
  CHAT_COMPOSER_MAX_HEIGHT,
  CHAT_COMPOSER_MIN_HEIGHT,
  CHAT_COMPOSER_V_PAD,
  clampComposerHeight,
  composerShouldScroll,
} from '../utils/chatComposerMetrics';

const ANDROID_TEXT_INPUT_PROPS =
  Platform.OS === 'android' ? { underlineColorAndroid: 'transparent' as const } : {};

const INPUT_PAD = {
  paddingHorizontal: 2,
  paddingVertical: CHAT_COMPOSER_V_PAD,
};

export type ChatComposerInputProps = Omit<
  TextInputProps,
  'multiline' | 'scrollEnabled' | 'style' | 'onContentSizeChange'
> & {
  shellStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  onComposerHeightChange?: (height: number) => void;
};

/**
 * Multiline chat composer that grows with wrapped text (not just explicit newlines).
 * Uses a hidden Text mirror for reliable height on Android where onContentSizeChange
 * alone often misses word-wrap.
 */
const ChatComposerInput = forwardRef<TextInput, ChatComposerInputProps>(
  function ChatComposerInput(
    {
      value = '',
      shellStyle,
      inputStyle,
      onComposerHeightChange,
      onChangeText,
      ...rest
    },
    ref
  ) {
    const innerRef = useRef<TextInput>(null);
    const [inputHeight, setInputHeight] = useState(CHAT_COMPOSER_MIN_HEIGHT);
    const [measureWidth, setMeasureWidth] = useState(0);

    useImperativeHandle(ref, () => innerRef.current as TextInput);

    const applyHeight = useCallback(
      (raw: number) => {
        const next = clampComposerHeight(raw);
        setInputHeight((prev) => {
          if (prev !== next) {
            onComposerHeightChange?.(next);
          }
          return next;
        });
      },
      [onComposerHeightChange]
    );

    useEffect(() => {
      if (!String(value).trim()) {
        applyHeight(CHAT_COMPOSER_MIN_HEIGHT);
      }
    }, [value, applyHeight]);

    const text = String(value);
    const clampedHeight = clampComposerHeight(inputHeight);
    const scrollAtMax = composerShouldScroll(clampedHeight);

    const keepCaretVisible = useCallback(() => {
      if (!scrollAtMax || text.length === 0) return;
      const len = text.length;
      requestAnimationFrame(() => {
        innerRef.current?.setSelection(len, len);
      });
    }, [scrollAtMax, text]);

    useEffect(() => {
      keepCaretVisible();
    }, [text, scrollAtMax, keepCaretVisible]);

    const sharedTextStyle = {
      fontSize: CHAT_COMPOSER_FONT_SIZE,
      lineHeight: CHAT_COMPOSER_LINE_HEIGHT,
      ...INPUT_PAD,
    };

    return (
      <View style={shellStyle}>
        <View
          style={{ width: '100%' }}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width > 0 && Math.abs(width - measureWidth) > 1) {
              setMeasureWidth(width);
            }
          }}
        >
          {measureWidth > 0 ? (
            <Text
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[
                inputStyle,
                sharedTextStyle,
                {
                  position: 'absolute',
                  opacity: 0,
                  width: measureWidth,
                },
              ]}
              onLayout={(event) => {
                applyHeight(event.nativeEvent.layout.height);
              }}
            >
              {text.length > 0 ? text : ' '}
            </Text>
          ) : null}
          <TextInput
            {...ANDROID_TEXT_INPUT_PROPS}
            {...rest}
            ref={innerRef}
            value={value}
            multiline
            blurOnSubmit={false}
            scrollEnabled={scrollAtMax}
            onChangeText={(next) => {
              onChangeText?.(next);
              keepCaretVisible();
            }}
            style={[
              inputStyle,
              sharedTextStyle,
              {
                width: '100%',
                height: clampedHeight,
                maxHeight: CHAT_COMPOSER_MAX_HEIGHT,
              },
            ]}
            onContentSizeChange={() => {
              keepCaretVisible();
            }}
          />
        </View>
      </View>
    );
  }
);

export default ChatComposerInput;

export { CHAT_COMPOSER_FONT_SIZE, CHAT_COMPOSER_LINE_HEIGHT };
