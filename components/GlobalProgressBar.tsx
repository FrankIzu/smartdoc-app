import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProgressData {
  id: string;
  title: string;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  message?: string;
}

interface GlobalProgressBarProps {
  visible: boolean;
  minimized: boolean;
  progressData: ProgressData[];
  onMinimize: () => void;
  onExpand: () => void;
  onClose: () => void;
}

function SmoothProgressFill({
  progress,
  backgroundColor,
  style,
}: {
  progress: number;
  backgroundColor: string;
  style?: object;
}) {
  const anim = React.useRef(new Animated.Value(progress)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [progress, anim]);
  const widthPct = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
  return (
    <Animated.View
      style={[
        styles.progressFill,
        style,
        {
          width: widthPct,
          backgroundColor,
        },
      ]}
    />
  );
}

function overallProgress(progressData: ProgressData[]): number {
  if (progressData.length === 0) return 0;
  const sum = progressData.reduce((acc, item) => acc + Math.min(100, Math.max(0, item.progress)), 0);
  return sum / progressData.length;
}

function overallStatus(progressData: ProgressData[]): ProgressData['status'] {
  if (progressData.some((p) => p.status === 'error')) return 'error';
  if (progressData.some((p) => p.status === 'in-progress' || p.status === 'pending')) return 'in-progress';
  if (progressData.length > 0 && progressData.every((p) => p.status === 'completed')) return 'completed';
  return 'in-progress';
}

function getStatusColor(status: ProgressData['status']) {
  switch (status) {
    case 'completed':
      return '#10B981';
    case 'error':
      return '#EF4444';
    case 'in-progress':
      return '#3B82F6';
    default:
      return '#6B7280';
  }
}

export default function GlobalProgressBar({
  visible,
  minimized,
  progressData,
  onMinimize,
  onExpand,
  onClose,
}: GlobalProgressBarProps) {
  const insets = useSafeAreaInsets();
  const slideAnimation = React.useRef(new Animated.Value(0)).current;
  const swipeAnimation = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.timing(slideAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnimation]);

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationY, velocityY } = event.nativeEvent;

      if (translationY < -50 || velocityY < -500) {
        Animated.timing(swipeAnimation, {
          toValue: -200,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          onClose();
          swipeAnimation.setValue(0);
        });
      } else {
        Animated.spring(swipeAnimation, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    }
  };

  if (!visible) return null;

  const collapsedProgress = overallProgress(progressData);
  const collapsedStatus = overallStatus(progressData);
  const completedCount = progressData.filter((p) => p.status === 'completed').length;
  const slideHiddenOffset = minimized ? -(insets.top + 6) : -120;

  const translateY = Animated.add(
    slideAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [slideHiddenOffset, 0],
    }),
    swipeAnimation
  );

  // Collapsed: only a thin progress strip below the safe area. Tap to expand.
  if (minimized) {
    return (
      <Animated.View
        style={[
          styles.collapsedContainer,
          {
            paddingTop: insets.top,
            transform: [{ translateY }],
          },
        ]}
      >
        <Pressable
          onPress={onExpand}
          style={styles.collapsedTapArea}
          accessibilityLabel={`Upload progress ${Math.round(collapsedProgress)} percent. Tap to expand.`}
          accessibilityRole="button"
        >
          <View style={styles.collapsedTrack}>
            <SmoothProgressFill
              progress={collapsedProgress}
              backgroundColor={getStatusColor(collapsedStatus)}
              style={styles.collapsedFill}
            />
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // Expanded: full header, controls, and per-file progress rows.
  return (
    <PanGestureHandler
      onGestureEvent={Animated.event(
        [{ nativeEvent: { translationY: swipeAnimation } }],
        { useNativeDriver: true }
      )}
      onHandlerStateChange={onHandlerStateChange}
      activeOffsetY={[-10, 10]}
      failOffsetX={[-50, 50]}
    >
      <Animated.View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            transform: [{ translateY }],
          },
        ]}
        accessibilityLabel={`Upload progress: ${completedCount} of ${progressData.length} complete`}
        accessibilityRole="progressbar"
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.dragHandle} />
            <Text style={styles.title}>Progress</Text>
            <Text style={styles.count}>
              {completedCount} / {progressData.length}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={onMinimize}
              style={styles.button}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Minimize upload progress"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              style={styles.button}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Close upload progress"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
          {progressData.map((item) => (
            <View
              key={item.id}
              style={styles.progressItem}
              accessibilityLabel={`${item.title}: ${Math.round(item.progress)}% ${item.status === 'completed' ? 'complete' : item.status === 'error' ? 'failed' : 'in progress'}`}
              accessibilityRole="progressbar"
            >
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBar}>
                  <SmoothProgressFill
                    progress={Math.min(100, Math.max(0, item.progress))}
                    backgroundColor={getStatusColor(item.status)}
                  />
                </View>
                <Text style={[styles.progressPercent, { color: getStatusColor(item.status) }]}>
                  {Math.round(item.progress)}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  collapsedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'transparent',
  },
  collapsedTapArea: {
    minHeight: 20,
    justifyContent: 'flex-end',
  },
  collapsedTrack: {
    height: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  collapsedFill: {
    height: 3,
    borderRadius: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  dragHandle: {
    width: 30,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  count: {
    fontSize: 14,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    padding: 8,
    marginLeft: 4,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    maxHeight: 200,
  },
  progressItem: {
    marginBottom: 4,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    flex: 1,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
