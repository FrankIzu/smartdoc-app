import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Types and interfaces
interface DeviceFingerprint {
  deviceId: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  installationId: string;
  createdAt: string;
}

interface DeviceTrust {
  deviceId: string;
  trustLevel: 'unknown' | 'trusted' | 'verified';
  trustedUntil: string;
  lastSeen: string;
  authMethods: string[];
}

interface BiometricConfig {
  enabled: boolean;
  types: LocalAuthentication.AuthenticationType[];
  fallbackEnabled: boolean;
}

interface RiskContext {
  isNewDevice: boolean;
  locationChanged: boolean;
  networkChanged: boolean;
  daysSinceLastLogin: number;
  failedAttempts: number;
  timeOfDay: 'normal' | 'unusual';
}

interface User2FAPreferences {
  biometricEnabled: boolean;
  rememberDevice: boolean;
  trustedDevicesDuration: 7 | 30 | 90; // days
  smsBackupRequired: boolean;
  highRiskSMSRequired: boolean;
  riskThreshold: 'low' | 'medium' | 'high';
}

// Storage keys
const STORAGE_KEYS = {
  DEVICE_FINGERPRINT: 'device_fingerprint',
  DEVICE_TRUST: 'device_trust',
  USER_PREFERENCES: 'user_2fa_preferences',
  LAST_LOGIN: 'last_login_data',
  FAILED_ATTEMPTS: 'failed_attempts',
  BIOMETRIC_CONFIG: 'biometric_config',
} as const;

class DeviceSecurityService {
  private deviceFingerprint: DeviceFingerprint | null = null;
  private biometricConfig: BiometricConfig | null = null;

  // ==================== DEVICE FINGERPRINTING ====================

  async generateDeviceFingerprint(): Promise<DeviceFingerprint> {
    if (this.deviceFingerprint) {
      return this.deviceFingerprint;
    }

    try {
      // Generate unique installation ID if not exists
      let installationId = await SecureStore.getItemAsync('installation_id');
      if (!installationId) {
        installationId = await Crypto.randomUUID();
        await SecureStore.setItemAsync('installation_id', installationId);
      }

      const fingerprint: DeviceFingerprint = {
        deviceId: Device.osInternalBuildId || Device.modelId || 'unknown',
        deviceName: Device.deviceName || Device.modelName || 'Unknown Device',
        platform: Platform.OS,
        osVersion: Device.osVersion || 'unknown',
        appVersion: '1.0.0', // Get from app.json in real implementation
        installationId,
        createdAt: new Date().toISOString(),
      };

      // Cache and store
      this.deviceFingerprint = fingerprint;
      await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_FINGERPRINT, JSON.stringify(fingerprint));

      return fingerprint;
    } catch (error) {
      console.error('Failed to generate device fingerprint:', error);
      throw new Error('Device fingerprinting failed');
    }
  }

  async getDeviceFingerprint(): Promise<DeviceFingerprint> {
    if (this.deviceFingerprint) {
      return this.deviceFingerprint;
    }

    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_FINGERPRINT);
      if (stored) {
        this.deviceFingerprint = JSON.parse(stored);
        return this.deviceFingerprint!;
      }
    } catch (error) {
      console.warn('Failed to load device fingerprint:', error);
    }

    // Generate new if not found
    return this.generateDeviceFingerprint();
  }

  // ==================== DEVICE TRUST MANAGEMENT ====================

  async setDeviceTrust(trustLevel: DeviceTrust['trustLevel'], duration: number = 30): Promise<void> {
    try {
      const fingerprint = await this.getDeviceFingerprint();
      const trustData: DeviceTrust = {
        deviceId: fingerprint.deviceId,
        trustLevel,
        trustedUntil: new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString(),
        lastSeen: new Date().toISOString(),
        authMethods: await this.getAvailableAuthMethods(),
      };

      await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_TRUST, JSON.stringify(trustData));
      console.log(`Device trust set to: ${trustLevel} for ${duration} days`);
    } catch (error) {
      console.error('Failed to set device trust:', error);
      throw new Error('Failed to update device trust');
    }
  }

  async getDeviceTrust(): Promise<DeviceTrust | null> {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_TRUST);
      if (!stored) return null;

      const trust: DeviceTrust = JSON.parse(stored);
      
      // Check if trust has expired
      if (new Date() > new Date(trust.trustedUntil)) {
        await SecureStore.deleteItemAsync(STORAGE_KEYS.DEVICE_TRUST);
        return null;
      }

      // Update last seen
      trust.lastSeen = new Date().toISOString();
      await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_TRUST, JSON.stringify(trust));

      return trust;
    } catch (error) {
      console.warn('Failed to get device trust:', error);
      return null;
    }
  }

  async revokeDeviceTrust(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.DEVICE_TRUST);
      console.log('Device trust revoked');
    } catch (error) {
      console.error('Failed to revoke device trust:', error);
    }
  }

  // ==================== BIOMETRIC AUTHENTICATION ====================

  async initializeBiometrics(): Promise<BiometricConfig> {
    if (this.biometricConfig) {
      return this.biometricConfig;
    }

    try {
      // Check hardware support
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      console.log('🔐 Biometric hardware check:', {
        hasHardware,
        supportedTypes: supportedTypes.map(type => 
          type === LocalAuthentication.AuthenticationType.FINGERPRINT ? 'Fingerprint' :
          type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ? 'Face ID' :
          type === LocalAuthentication.AuthenticationType.IRIS ? 'Iris' : 'Unknown'
        ),
        isEnrolled
      });

      const config: BiometricConfig = {
        enabled: hasHardware && isEnrolled && supportedTypes.length > 0,
        types: supportedTypes,
        fallbackEnabled: false, // Disable fallback to force biometric authentication
      };

      this.biometricConfig = config;
      await SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_CONFIG, JSON.stringify(config));

      console.log('🔐 Final biometric config:', config);
      return config;
    } catch (error) {
      console.error('Failed to initialize biometrics:', error);
      return {
        enabled: false,
        types: [],
        fallbackEnabled: false, // Disable fallback to force biometric authentication
      };
    }
  }

  async authenticateWithBiometrics(reason: string = 'Authenticate to access your account'): Promise<boolean> {
    try {
      const config = await this.initializeBiometrics();
      console.log('🔐 Biometric config:', config);
      
      if (!config.enabled) {
        console.log('❌ Biometric authentication not enabled');
        return false;
      }

      console.log('🔐 Starting biometric authentication with config:', {
        promptMessage: reason,
        fallbackLabel: 'Use Password',
        disableDeviceFallback: true,
        cancelLabel: 'Cancel',
      });

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        fallbackLabel: 'Use Password',
        disableDeviceFallback: true, // Disable device passcode fallback to force biometric authentication
        cancelLabel: 'Cancel',
      });

      console.log('🔐 Biometric authentication result:', result);
      return result.success;
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return false;
    }
  }

  async getBiometricTypesAvailable(): Promise<string[]> {
    const config = await this.initializeBiometrics();
    return config.types.map(type => {
      switch (type) {
        case LocalAuthentication.AuthenticationType.FINGERPRINT:
          return 'Fingerprint';
        case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
          return 'Face ID';
        case LocalAuthentication.AuthenticationType.IRIS:
          return 'Iris';
        default:
          return 'Biometric';
      }
    });
  }

  // ==================== RISK ASSESSMENT ====================

  async calculateRiskScore(context?: Partial<RiskContext>): Promise<number> {
    try {
      let riskScore = 0;
      const trust = await this.getDeviceTrust();
      const lastLogin = await this.getLastLoginData();
      const failedAttempts = await this.getFailedAttemptsCount();

      // Device trust factor (0-40 points)
      if (!trust) {
        riskScore += 40; // New/untrusted device
      } else if (trust.trustLevel === 'unknown') {
        riskScore += 25;
      } else if (trust.trustLevel === 'trusted') {
        riskScore += 10;
      }
      // Verified devices add 0 points

      // Time since last login (0-25 points)
      if (lastLogin) {
        const daysSince = (Date.now() - new Date(lastLogin.timestamp).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 90) riskScore += 25;
        else if (daysSince > 30) riskScore += 15;
        else if (daysSince > 7) riskScore += 5;
      } else {
        riskScore += 20; // No previous login
      }

      // Failed attempts (0-20 points)
      if (failedAttempts > 5) riskScore += 20;
      else if (failedAttempts > 2) riskScore += 10;
      else if (failedAttempts > 0) riskScore += 5;

      // Time of day factor (0-10 points)
      const hour = new Date().getHours();
      if (hour < 6 || hour > 23) riskScore += 10; // Very late/early
      else if (hour < 8 || hour > 22) riskScore += 5; // Unusual hours

      // Context-specific factors
      if (context) {
        if (context.isNewDevice) riskScore += 15;
        if (context.locationChanged) riskScore += 10;
        if (context.networkChanged) riskScore += 5;
        if (context.failedAttempts && context.failedAttempts > failedAttempts) {
          riskScore += Math.min(context.failedAttempts * 5, 20);
        }
      }

      // Cap at 100
      return Math.min(riskScore, 100);
    } catch (error) {
      console.error('Risk calculation failed:', error);
      return 50; // Medium risk as fallback
    }
  }

  determineRequiredAuthMethod(riskScore: number, userPrefs?: User2FAPreferences): string {
    const prefs = userPrefs || this.getDefaultPreferences();
    
    // High risk always requires SMS
    if (riskScore >= 70 || prefs.highRiskSMSRequired) {
      return 'SMS_2FA';
    }
    
    // Medium risk
    if (riskScore >= 40) {
      if (prefs.biometricEnabled) {
        return 'BIOMETRIC_PLUS_PASSWORD';
      }
      return 'PASSWORD_PLUS_SMS';
    }
    
    // Low risk
    if (riskScore < 40) {
      if (prefs.biometricEnabled) {
        return 'BIOMETRIC_ONLY';
      }
      if (prefs.rememberDevice) {
        return 'PASSWORD_ONLY';
      }
    }
    
    return 'PASSWORD_PLUS_SMS'; // Fallback
  }

  // ==================== USER PREFERENCES ====================

  async getUserPreferences(): Promise<User2FAPreferences> {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEYS.USER_PREFERENCES);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load user preferences:', error);
    }
    
    return this.getDefaultPreferences();
  }

  async setUserPreferences(prefs: User2FAPreferences): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(prefs));
    } catch (error) {
      console.error('Failed to save user preferences:', error);
      throw new Error('Failed to save preferences');
    }
  }

  private getDefaultPreferences(): User2FAPreferences {
    return {
      biometricEnabled: true,
      rememberDevice: true,
      trustedDevicesDuration: 30,
      smsBackupRequired: true,
      highRiskSMSRequired: true,
      riskThreshold: 'medium',
    };
  }

  // ==================== HELPER METHODS ====================

  private async getAvailableAuthMethods(): Promise<string[]> {
    const methods: string[] = ['password'];
    
    const biometricTypes = await this.getBiometricTypesAvailable();
    methods.push(...biometricTypes);
    
    return methods;
  }

  private async getLastLoginData(): Promise<{ timestamp: string; location?: string } | null> {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEYS.LAST_LOGIN);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  async setLastLoginData(data: { timestamp: string; location?: string }): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.LAST_LOGIN, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save last login data:', error);
    }
  }

  private async getFailedAttemptsCount(): Promise<number> {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEYS.FAILED_ATTEMPTS);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      return 0;
    }
  }

  async incrementFailedAttempts(): Promise<number> {
    const current = await this.getFailedAttemptsCount();
    const newCount = current + 1;
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.FAILED_ATTEMPTS, newCount.toString());
    } catch (error) {
      console.warn('Failed to increment failed attempts:', error);
    }
    return newCount;
  }

  async resetFailedAttempts(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.FAILED_ATTEMPTS);
    } catch (error) {
      console.warn('Failed to reset failed attempts:', error);
    }
  }

  // ==================== CLEANUP METHODS ====================

  async clearAllDeviceData(): Promise<void> {
    try {
      const keys = Object.values(STORAGE_KEYS);
      await Promise.all(keys.map(key => SecureStore.deleteItemAsync(key).catch(() => {})));
      
      this.deviceFingerprint = null;
      this.biometricConfig = null;
      
      console.log('All device security data cleared');
    } catch (error) {
      console.error('Failed to clear device data:', error);
    }
  }

  // ==================== DEBUG METHODS ====================

  async getDeviceSecurityStatus(): Promise<{
    deviceFingerprint: DeviceFingerprint | null;
    deviceTrust: DeviceTrust | null;
    biometricConfig: BiometricConfig | null;
    userPreferences: User2FAPreferences;
    riskScore: number;
    failedAttempts: number;
  }> {
    return {
      deviceFingerprint: await this.getDeviceFingerprint(),
      deviceTrust: await this.getDeviceTrust(),
      biometricConfig: await this.initializeBiometrics(),
      userPreferences: await this.getUserPreferences(),
      riskScore: await this.calculateRiskScore(),
      failedAttempts: await this.getFailedAttemptsCount(),
    };
  }
}

// Export singleton instance
export const deviceSecurityService = new DeviceSecurityService();
export default deviceSecurityService;

// Export types for use in other files
export type {
  BiometricConfig, DeviceFingerprint,
  DeviceTrust, RiskContext,
  User2FAPreferences
};

