import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

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
  onClose: () => void;
}

const { width: screenWidth } = Dimensions.get('window');

export default function GlobalProgressBar({
  visible,
  minimized,
  progressData,
  onMinimize,
  onClose,
}: GlobalProgressBarProps) {
  const slideAnimation = React.useRef(new Animated.Value(0)).current;
  const swipeAnimation = React.useRef(new Animated.Value(0)).current;
  const lastGestureY = React.useRef(0);

  React.useEffect(() => {
    if (visible) {
      Animated.timing(slideAnimation, {
        toValue: minimized ? 0 : 1,
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
  }, [visible, minimized, slideAnimation]);

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: swipeAnimation } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationY, velocityY } = event.nativeEvent;
      
      // If swiped up significantly or with high velocity, close the progress bar
      if (translationY < -50 || velocityY < -500) {
        // Animate out and close
        Animated.timing(swipeAnimation, {
          toValue: -200,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          onClose();
          swipeAnimation.setValue(0); // Reset for next time
        });
      } else {
        // Snap back to original position
        Animated.spring(swipeAnimation, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    }
  };

  if (!visible) return null;

  const translateY = Animated.add(
    slideAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [minimized ? -60 : 0, 0],
    }),
    swipeAnimation
  );

  const getStatusIcon = (status: ProgressData['status']) => {
    switch (status) {
      case 'completed':
        return <Ionicons name="checkmark-circle" size={16} color="#10B981" />;
      case 'error':
        return <Ionicons name="close-circle" size={16} color="#EF4444" />;
      case 'in-progress':
        return <Ionicons name="time" size={16} color="#3B82F6" />;
      default:
        return <Ionicons name="ellipse" size={16} color="#6B7280" />;
    }
  };

  const getStatusColor = (status: ProgressData['status']) => {
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
  };

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      activeOffsetY={[-10, 10]}
      failOffsetX={[-50, 50]}
    >
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY }],
          },
        ]}
        accessibilityLabel={`Upload progress: ${progressData.filter((p) => p.status === 'completed').length} of ${progressData.length} complete`}
        accessibilityRole="progressbar"
      >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.dragHandle} />
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.count}>
            {progressData.filter(p => p.status === 'completed').length} / {progressData.length}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={onMinimize}
            style={styles.button}
            accessibilityLabel={minimized ? 'Expand upload progress' : 'Minimize upload progress'}
            accessibilityRole="button"
          >
            <Ionicons
              name={minimized ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#6B7280"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={styles.button}
            accessibilityLabel="Close upload progress"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>

      {!minimized && (
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
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${item.progress}%`,
                        backgroundColor: getStatusColor(item.status),
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressPercent, { color: getStatusColor(item.status) }]}>
                  {Math.round(item.progress)}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
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
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  progressText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
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
  progressMessage: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
});
