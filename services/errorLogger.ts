/**
 * Mobile Error Logging Service
 * Sends errors from the mobile app to the backend for centralized logging
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { APP_VERSION } from '../constants/Config';
import { apiClient } from './api';

export interface ErrorLogData {
  errorType: string;
  errorMessage: string;
  errorTraceback?: string;
  severity?: 'critical' | 'error' | 'warning';
  screenName?: string;
  userAction?: string;
  url?: string;
  userId?: number | string;
  workspaceId?: number;
  metadata?: Record<string, unknown>;
  deviceInfo?: {
    platform: string;
    osVersion?: string;
    deviceModel?: string;
    appVersion: string;
  };
}

class ErrorLoggerService {
  private isEnabled: boolean = true;
  private queue: ErrorLogData[] = [];
  private isProcessing: boolean = false;
  private maxQueueSize: number = 50;

  constructor() {
    // Enable error logging by default
    this.isEnabled = true;
  }

  /**
   * Get device information for error logging
   */
  private getDeviceInfo(): ErrorLogData['deviceInfo'] {
    try {
      return {
        platform: Platform.OS || 'unknown',
        osVersion: Platform.Version?.toString() || 'unknown',
        deviceModel: Constants?.deviceName || 'Unknown',
        appVersion: APP_VERSION || '1.0.0',
      };
    } catch (err) {
      // Fallback if any constants are unavailable
      return {
        platform: 'unknown',
        osVersion: 'unknown',
        deviceModel: 'Unknown',
        appVersion: '1.0.0',
      };
    }
  }

  /**
   * Log an error to the backend
   */
  async logError(
    error: Error | string,
    options: {
      severity?: 'critical' | 'error' | 'warning';
      screenName?: string;
      userAction?: string;
      url?: string;
      userId?: number | string;
      workspaceId?: number;
      errorType?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    if (!this.isEnabled) {
      console.warn('Error logging is disabled');
      return;
    }

    try {
      const { isCrashReportingEnabled } = await import('../utils/userPreferences');
      if (!(await isCrashReportingEnabled())) {
        return;
      }
    } catch {
      /* if prefs unavailable, continue logging */
    }

    try {
      // Convert error to ErrorLogData format
      const errorMessage = typeof error === 'string' ? error : error.message;
      const errorTraceback = typeof error === 'string' 
        ? undefined 
        : error.stack || new Error().stack;
      const errorType = options.errorType || 
        (typeof error === 'string' ? 'UnknownError' : error.constructor?.name || 'Error');

      const errorLogData: ErrorLogData = {
        errorType,
        errorMessage,
        errorTraceback,
        severity: options.severity || 'error',
        screenName: options.screenName,
        userAction: options.userAction,
        url: options.url,
        userId: options.userId,
        workspaceId: options.workspaceId,
        metadata: options.metadata,
        deviceInfo: this.getDeviceInfo(),
      };

      // Add to queue
      this.queue.push(errorLogData);

      // Limit queue size to prevent memory issues
      if (this.queue.length > this.maxQueueSize) {
        this.queue.shift(); // Remove oldest
      }

      // Process queue asynchronously
      this.processQueue();
    } catch (err) {
      // Don't let error logging break the app
      console.error('Failed to queue error for logging:', err);
    }
  }

  /**
   * Process the error queue and send to backend
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const errorLog = this.queue.shift();
      if (!errorLog) continue;

      try {
        // Safely access apiClient - it might not be initialized yet
        if (!apiClient || !apiClient.client) {
          console.warn('⚠️ API client not available for error logging');
          return;
        }
        
        await apiClient.client.post(
          '/api/v1/mobile/error-log',
          {
            ...errorLog,
            platform: Platform.OS || 'unknown',
            appVersion: APP_VERSION || '1.0.0',
          }
        );
        console.log('✅ Error logged to backend:', errorLog.errorType);
      } catch (err: any) {
        // Log failure but don't retry to prevent infinite loops
        // Don't use errorLogger here to prevent recursion
        console.error('Failed to log error to backend:', err?.message || err);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Log a critical error (highest priority)
   */
  async logCritical(
    error: Error | string,
    options: Omit<ErrorLogData, 'errorType' | 'errorMessage' | 'errorTraceback' | 'severity'> = {}
  ): Promise<void> {
    return this.logError(error, { ...options, severity: 'critical' });
  }

  /**
   * Log a warning (lowest priority)
   */
  async logWarning(
    error: Error | string,
    options: Omit<ErrorLogData, 'errorType' | 'errorMessage' | 'errorTraceback' | 'severity'> = {}
  ): Promise<void> {
    return this.logError(error, { ...options, severity: 'warning' });
  }

  /**
   * Enable or disable error logging
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Clear the error queue
   */
  clearQueue(): void {
    this.queue = [];
  }
}

// Export singleton instance
export const errorLogger = new ErrorLoggerService();

