import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { API_BASE_URL, APPLE_CLIENT_ID, APPLE_REDIRECT_URI } from '../constants/Config';
import { deviceSecurityService } from './deviceSecurity';

// ==================== UTILITY FUNCTIONS ====================

/**
 * Formats user data from backend response to match auth context expectations
 */
function formatUserDataForAuth(backendUser: any): { id: string; email: string; name: string } | null {
  if (!backendUser) {
    return null;
  }

  // Extract user ID (handle different possible fields)
  const userId = backendUser.id || backendUser.user_id || backendUser.userId;
  if (!userId) {
    console.warn('No user ID found in backend response:', backendUser);
    return null;
  }

  // Extract email (handle different possible fields)
  const email = backendUser.email || backendUser.username || '';
  if (!email) {
    console.warn('No email found in backend response:', backendUser);
  }

  // Format name (handle different possible fields)
  const firstName = backendUser.first_name || backendUser.firstName || '';
  const lastName = backendUser.last_name || backendUser.lastName || '';
  const fullName = firstName && lastName 
    ? `${firstName} ${lastName}`.trim()
    : firstName || lastName || '';
  
  const displayName = fullName || backendUser.name || backendUser.username || email || 'Apple User';

  return {
    id: userId.toString(),
    email: email || 'apple-user@example.com', // Fallback if email is hidden
    name: displayName,
  };
}

// Apple Sign In configuration
interface AppleUserInfo {
  user: string; // Apple user ID (stable identifier)
  email: string | null;
  fullName: {
    givenName: string | null;
    familyName: string | null;
  } | null;
  identityToken: string | null;
  authorizationCode: string | null;
  realUserStatus: AppleAuthentication.AppleAuthenticationUserDetectionStatus;
}

interface AppleAuthResult {
  success: boolean;
  user?: AppleUserInfo;
  error?: string;
}

interface MobileAppleLoginResponse {
  success: boolean;
  message: string;
  user?: any;
  requires2FA?: boolean;
  deviceTrusted?: boolean;
  deviceName?: string;
}

class AppleAuthService {
  private isAvailable: boolean = false;

  constructor() {
    // Check availability on iOS
    if (Platform.OS === 'ios') {
      this.checkAvailability();
    }
  }

  private async checkAvailability() {
    try {
      this.isAvailable = await AppleAuthentication.isAvailableAsync();
      console.log('Apple Sign In available:', this.isAvailable);
    } catch (error) {
      console.error('Error checking Apple Sign In availability:', error);
      this.isAvailable = false;
    }
  }

  // ==================== APPLE SIGN-IN FLOW ====================

  async signInWithApple(): Promise<AppleAuthResult> {
    try {
      // Only available on iOS
      if (Platform.OS !== 'ios') {
        return {
          success: false,
          error: 'Apple Sign In is only available on iOS devices',
        };
      }

      // Check if Apple Sign In is available
      if (!this.isAvailable) {
        await this.checkAvailability();
      }

      if (!this.isAvailable) {
        return {
          success: false,
          error: 'Apple Sign In is not available on this device',
        };
      }

      console.log('Starting Apple Sign In...');

      // Request Apple authentication
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Extract user information
      const userInfo: AppleUserInfo = {
        user: credential.user, // Stable Apple user ID
        email: credential.email || null,
        fullName: credential.fullName
          ? {
              givenName: credential.fullName.givenName || null,
              familyName: credential.fullName.familyName || null,
            }
          : null,
        identityToken: credential.identityToken || null,
        authorizationCode: credential.authorizationCode || null,
        realUserStatus: credential.realUserStatus,
      };

      // Validate that we have at least a user ID
      if (!userInfo.user) {
        console.error('Apple Sign In failed: No user ID received');
        return {
          success: false,
          error: 'Apple Sign In failed: No user ID received',
        };
      }

      console.log('Apple Sign In successful:', {
        userId: userInfo.user,
        email: userInfo.email || '(hidden)',
        hasName: !!userInfo.fullName,
        hasEmail: !!userInfo.email,
      });

      return {
        success: true,
        user: userInfo,
      };
    } catch (error: any) {
      console.error('Apple Sign In error:', error);

      // Handle user cancellation
      if (error.code === 'ERR_CANCELED') {
        return {
          success: false,
          error: 'User cancelled Apple Sign In',
        };
      }

      // Handle other errors
      return {
        success: false,
        error: error.message || 'Apple Sign In failed',
      };
    }
  }

  // ==================== BACKEND INTEGRATION ====================

  async loginWithAppleToBackend(appleUser: AppleUserInfo): Promise<MobileAppleLoginResponse> {
    try {
      // Get device fingerprint for security
      const deviceFingerprint = await deviceSecurityService.getDeviceFingerprint();
      const deviceTrust = await deviceSecurityService.getDeviceTrust();

      // Calculate risk score
      const riskScore = await deviceSecurityService.calculateRiskScore({
        isNewDevice: !deviceTrust,
        daysSinceLastLogin: 0,
        failedAttempts: 0,
      });

      // Prepare user name
      const fullName = appleUser.fullName
        ? `${appleUser.fullName.givenName || ''} ${appleUser.fullName.familyName || ''}`.trim()
        : null;
      const displayName = fullName || appleUser.email || 'Apple User';

      // Prepare login request
      const loginData = {
        appleId: appleUser.user, // Stable Apple user ID
        email: appleUser.email,
        name: displayName,
        firstName: appleUser.fullName?.givenName || null,
        lastName: appleUser.fullName?.familyName || null,
        identityToken: appleUser.identityToken, // JWT token for backend verification
        authorizationCode: appleUser.authorizationCode,
        realUserStatus: appleUser.realUserStatus,
        deviceInfo: {
          fingerprint: deviceFingerprint,
          trustLevel: deviceTrust?.trustLevel || 'unknown',
          riskScore,
        },
      };

      // Send request to mobile backend
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/apple-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        credentials: 'include',
        body: JSON.stringify(loginData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Apple login HTTP error:', response.status, errorText);
        throw new Error(`Apple login failed: ${response.status} ${response.statusText}`);
      }

      const result: MobileAppleLoginResponse = await response.json();

      if (result.success) {
        // Update device trust if login successful
        if (result.deviceTrusted) {
          await deviceSecurityService.setDeviceTrust('trusted', 30);
        }

        // Reset failed attempts
        await deviceSecurityService.resetFailedAttempts();

        // Update last login data
        await deviceSecurityService.setLastLoginData({
          timestamp: new Date().toISOString(),
        });

        console.log('Apple login successful:', result.message);
      } else {
        // Increment failed attempts
        await deviceSecurityService.incrementFailedAttempts();
        console.warn('Apple login failed:', result.message);
      }

      return result;
    } catch (error) {
      console.error('Backend Apple login error:', error);
      await deviceSecurityService.incrementFailedAttempts();

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  // ==================== ENHANCED 2FA INTEGRATION ====================

  async signInWithAppleEnhanced(): Promise<{
    success: boolean;
    user?: any;
    requires2FA?: boolean;
    authMethod?: string;
    message?: string;
  }> {
    try {
      // Step 1: Apple Sign In
      const appleResult = await this.signInWithApple();

      if (!appleResult.success || !appleResult.user) {
        return {
          success: false,
          message: appleResult.error || 'Apple authentication failed',
        };
      }

      // Step 2: Risk Assessment
      const riskScore = await deviceSecurityService.calculateRiskScore();
      const userPrefs = await deviceSecurityService.getUserPreferences();
      const requiredAuthMethod = deviceSecurityService.determineRequiredAuthMethod(riskScore, userPrefs);

      console.log(`Risk score: ${riskScore}, Required auth: ${requiredAuthMethod}`);

      // Step 3: Enhanced Authentication (if needed)
      if (requiredAuthMethod === 'BIOMETRIC_ONLY') {
        const biometricSuccess = await deviceSecurityService.authenticateWithBiometrics(
          'Verify your identity to complete Apple sign-in'
        );

        if (!biometricSuccess) {
          return {
            success: false,
            message: 'Biometric authentication required',
            requires2FA: true,
            authMethod: 'BIOMETRIC',
          };
        }
      }

      // Step 4: Backend Login
      const backendResult = await this.loginWithAppleToBackend(appleResult.user);

      if (backendResult.success) {
        return {
          success: true,
          user: backendResult.user,
          message: 'Apple sign-in successful',
        };
      }

      // Step 5: Handle 2FA requirement
      if (backendResult.requires2FA || requiredAuthMethod.includes('SMS')) {
        return {
          success: false,
          requires2FA: true,
          authMethod: 'SMS_2FA',
          message: 'Additional verification required',
        };
      }

      return {
        success: false,
        message: backendResult.message || 'Login failed',
      };
    } catch (error) {
      console.error('Enhanced Apple sign-in error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Sign-in failed',
      };
    }
  }

  // ==================== UTILITY METHODS ====================

  async isAvailableAsync(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }
    await this.checkAvailability();
    return this.isAvailable;
  }

  async signOut(): Promise<void> {
    try {
      // Note: Apple doesn't provide a sign-out method
      // The user needs to sign out from their Apple ID in Settings
      console.log('Apple sign-out: User must sign out from Apple ID in Settings');
    } catch (error) {
      console.error('Apple sign-out error:', error);
    }
  }

  // ==================== CONFIGURATION ====================

  getClientId(): string {
    return APPLE_CLIENT_ID;
  }

  getRedirectUri(): string {
    return APPLE_REDIRECT_URI;
  }
}

// Export singleton instance
export const appleAuthService = new AppleAuthService();
export default appleAuthService;

// Export types
export type {
  AppleUserInfo,
  AppleAuthResult,
  MobileAppleLoginResponse,
};

