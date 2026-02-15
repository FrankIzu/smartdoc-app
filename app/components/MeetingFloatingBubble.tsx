import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STORAGE_KEY_POSITION = 'reach_meeting_bubble_position';
const DEFAULT_OFFSET = 16;
const BUBBLE_WIDTH = 220;
const BUBBLE_HEIGHT = 56;

export interface MeetingFloatingBubbleProps {
  participantName: string;
  onExpand: () => void;
  onLeave: () => void;
  meetingStartTime?: string;
  meetingTitle?: string;
  isAudioEnabled?: boolean;
  onToggleMute?: () => void;
}

function useMeetingDuration(meetingStartTime?: string): string {
  const [duration, setDuration] = useState('00:00');
  useEffect(() => {
    if (!meetingStartTime) return;
    const start = new Date(meetingStartTime).getTime();
    const update = () => {
      const diff = Math.max(0, Date.now() - start);
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDuration(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [meetingStartTime]);
  return duration;
}

export default function MeetingFloatingBubble({
  participantName,
  onExpand,
  onLeave,
  meetingStartTime,
  meetingTitle,
  isAudioEnabled = true,
  onToggleMute,
}: MeetingFloatingBubbleProps) {
  const insets = useSafeAreaInsets();
  const duration = useMeetingDuration(meetingStartTime);
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [positionLoaded, setPositionLoaded] = useState(false);
  const didDragRef = useRef(false);
  const positionRef = useRef({ x: 0, y: 0 });

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const loadPosition = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY_POSITION);
        if (stored) {
          const { x, y } = JSON.parse(stored);
          setPosition({ x: Number(x), y: Number(y) });
        } else {
          const bottomInset = Platform.OS === 'ios' ? insets.bottom : 0;
          const rightInset = Platform.OS === 'ios' ? insets.right : 0;
          setPosition({
            x: screenWidth - BUBBLE_WIDTH - DEFAULT_OFFSET - rightInset,
            y: screenHeight - BUBBLE_HEIGHT - DEFAULT_OFFSET - bottomInset,
          });
        }
      } catch (_) {
        const bottomInset = Platform.OS === 'ios' ? insets.bottom : 0;
        const rightInset = Platform.OS === 'ios' ? insets.right : 0;
        setPosition({
          x: screenWidth - BUBBLE_WIDTH - DEFAULT_OFFSET - rightInset,
          y: screenHeight - BUBBLE_HEIGHT - DEFAULT_OFFSET - bottomInset,
        });
      }
      setPositionLoaded(true);
    };
    loadPosition();
  }, [screenWidth, screenHeight, insets.bottom, insets.right]);

  const persistPosition = useCallback(async (x: number, y: number) => {
    setPosition({ x, y });
    try {
      await AsyncStorage.setItem(STORAGE_KEY_POSITION, JSON.stringify({ x, y }));
    } catch (_) {}
  }, []);

  const dragStartRef = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 5 || Math.abs(dy) > 5;
      },
      onPanResponderGrant: () => {
        didDragRef.current = false;
        dragStartRef.current = { ...positionRef.current };
      },
      onPanResponderMove: (_, gestureState) => {
        didDragRef.current = true;
        const { dx, dy } = gestureState;
        const start = dragStartRef.current;
        let x = Math.max(0, Math.min(screenWidth - 140, start.x + dx));
        let y = Math.max(0, Math.min(screenHeight - 100, start.y + dy));
        setPosition({ x, y });
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, dy } = gestureState;
        const start = dragStartRef.current;
        const newX = Math.max(0, Math.min(screenWidth - 140, start.x + dx));
        const newY = Math.max(0, Math.min(screenHeight - 100, start.y + dy));
        setPosition({ x: newX, y: newY });
        persistPosition(newX, newY);
      },
    })
  ).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const handlePress = useCallback(() => {
    if (didDragRef.current) return;
    onExpand();
  }, [onExpand]);

  const handleLeaveClick = useCallback(() => {
    Alert.alert(
      'End meeting?',
      'You will leave this meeting. Others can continue without you.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: onLeave },
      ]
    );
  }, [onLeave]);

  const handleToggleMute = useCallback(
    (e: any) => {
      e?.stopPropagation?.();
      onToggleMute?.();
    },
    [onToggleMute]
  );

  if (!positionLoaded) return null;

  return (
    <>
      <View
        style={[
          styles.bubble,
          {
            left: position.x,
            top: position.y,
            marginBottom: insets.bottom,
            marginRight: insets.right,
          },
        ]}
        {...panResponder.panHandlers}
        accessible
        accessibilityLabel="Return to meeting"
        accessibilityHint="Double tap to expand meeting"
        accessibilityRole="button"
      >
        <TouchableOpacity
          style={styles.bubbleContent}
          onPress={handlePress}
          activeOpacity={1}
        >
          <Animated.View
            style={[
              styles.liveDot,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
          <View style={styles.textContent}>
            {meetingTitle ? (
              <Text style={styles.meetingTitle} numberOfLines={1}>
                {meetingTitle}
              </Text>
            ) : null}
            <Text style={styles.participantName} numberOfLines={1}>
              {participantName || 'You'}
            </Text>
            <Text style={styles.duration}>{duration}</Text>
          </View>
          {onToggleMute !== undefined && (
            <TouchableOpacity
              style={styles.muteButton}
              onPress={handleToggleMute}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isAudioEnabled ? (
                <Ionicons name="mic" size={18} color="#34C759" />
              ) : (
                <Ionicons name="mic-off" size={18} color="#666" />
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.tapHint}>Tap to return</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.leaveButton}
          onPress={handleLeaveClick}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessible
          accessibilityLabel="Leave meeting"
        >
          <Ionicons name="close" size={22} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4B5563',
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
  },
  bubbleContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  textContent: {
    flex: 1,
    minWidth: 0,
  },
  meetingTitle: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 1,
  },
  participantName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  duration: {
    fontSize: 11,
    color: '#6B7280',
    fontVariant: ['tabular-nums'],
  },
  tapHint: {
    fontSize: 10,
    color: '#6B7280',
    marginLeft: 4,
  },
  muteButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leaveButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
