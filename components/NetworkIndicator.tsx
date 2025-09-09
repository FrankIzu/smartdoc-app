import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { apiClient } from '../services/api';

interface NetworkStatus {
  isConnected: boolean;
  isChecking: boolean;
  lastCheck: Date | null;
  error?: string;
}

export default function NetworkIndicator() {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: false,
    isChecking: true,
    lastCheck: null,
  });
  
  const [pulseAnim] = useState(new Animated.Value(1));

  // Pulse animation for checking state
  useEffect(() => {
    if (status.isChecking) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [status.isChecking, pulseAnim]);

  const checkConnection = async () => {
    setStatus(prev => ({ ...prev, isChecking: true }));
    
    try {
      const result = await apiClient.testConnectivity();
      setStatus({
        isConnected: result.success,
        isChecking: false,
        lastCheck: new Date(),
        error: result.success ? undefined : result.message,
      });
    } catch (error) {
      setStatus({
        isConnected: false,
        isChecking: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  };

  // Check connection on mount and every 30 seconds
  useEffect(() => {
    checkConnection();
    
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    if (status.isChecking) return '#FFA500'; // Orange for checking
    if (status.isConnected) return '#4CAF50'; // Green for connected
    return '#F44336'; // Red for disconnected
  };

  const getStatusText = () => {
    if (status.isChecking) return 'Checking...';
    if (status.isConnected) return 'Connected';
    return 'Disconnected';
  };

  const getIcon = () => {
    if (status.isChecking) return 'sync';
    if (status.isConnected) return 'checkmark-circle';
    return 'close-circle';
  };

  return (
    <View style={styles.container}>
      <Animated.View 
        style={[
          styles.indicator,
          { 
            backgroundColor: getStatusColor(),
            opacity: pulseAnim 
          }
        ]}
      >
        <Ionicons 
          name={getIcon() as any} 
          size={16} 
          color="white" 
        />
      </Animated.View>
      <Text style={styles.text}>{getStatusText()}</Text>
      {status.error && !status.isChecking && (
        <Text style={styles.errorText} numberOfLines={1}>
          {status.error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 20,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  indicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    marginLeft: 8,
    flex: 1,
  },
});
