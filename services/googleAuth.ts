import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE_URL, GOOGLE_CLIENT_ID } from '../constants/Config';
import { deviceSecurityService } from './deviceSecurity';

// Google OAuth configuration
interface GoogleAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  verified_email: boolean;
}

interface GoogleAuthResult {
  success: boolean;
  user?: GoogleUserInfo;
  accessToken?: string;
  idToken?: string;
  error?: string;
}

interface MobileGoogleLoginResponse {
  success: boolean;
  message: string;
  user?: any;
  requires2FA?: boolean;
  deviceTrusted?: boolean;
  deviceName?: string;
}

class GoogleAuthService {
  private config: GoogleAuthConfig;
  private request: AuthSession.AuthRequest | null = null;
  private discovery: AuthSession.DiscoveryDocument | null = null;

  constructor() {
    // Use Expo's auth proxy for development (provides HTTPS URL that Google accepts)
    const redirectUri = __DEV__ 
      ? 'https://auth.expo.io/@anonymous/grabdocs' // Expo auth proxy with HTTPS
      : 'https://api.grabdocs.com/auth/callback'; // Secure App Link for production

    // Initialize configuration
    this.config = {
      clientId: GOOGLE_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '', // Will be set from environment or config
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
    };

    console.log('Google Auth initialized with redirect URI:', this.config.redirectUri);
    this.initializeAuth();
  }

  private async initializeAuth() {
    try {
      // Set up WebBrowser for better UX
      WebBrowser.maybeCompleteAuthSession();

      // Create discovery document
      this.discovery = await AuthSession.fetchDiscoveryAsync(
        'https://accounts.google.com'
      );

      // Create auth request
      this.request = new AuthSession.AuthRequest({
        clientId: this.config.clientId,
        scopes: this.config.scopes,
        redirectUri: this.config.redirectUri,
        responseType: AuthSession.ResponseType.Code,
        extraParams: {
          access_type: 'offline',
        },
      });

      console.log('Google Auth initialized with redirect URI:', this.config.redirectUri);
    } catch (error) {
      console.error('Failed to initialize Google Auth:', error);
    }
  }

  // ==================== GOOGLE SIGN-IN FLOW ====================

  async signInWithGoogle(): Promise<GoogleAuthResult> {
    try {
      // Check if client ID is properly configured
      if (!this.config.clientId || this.config.clientId === '') {
        return {
          success: false,
          error: 'Google OAuth is not configured. Please set up Google OAuth credentials.',
        };
      }

      if (!this.request || !this.discovery) {
        await this.initializeAuth();
        if (!this.request || !this.discovery) {
          throw new Error('Google Auth initialization failed');
        }
      }

      console.log('Starting Google OAuth with redirect URI:', this.config.redirectUri);

      // Start the authentication flow
      const result = await this.request.promptAsync(this.discovery);

      if (result.type === 'success') {
        const { code } = result.params;
        
        if (code) {
          // Exchange code for tokens
          const tokenResponse = await AuthSession.exchangeCodeAsync(
            {
              clientId: this.config.clientId,
              code,
              redirectUri: this.config.redirectUri,
              extraParams: {},
            },
            this.discovery
          );

          if (tokenResponse.accessToken) {
            // Get user info from Google
            const userInfo = await this.fetchGoogleUserInfo(tokenResponse.accessToken);
            
            if (userInfo) {
              return {
                success: true,
                user: userInfo,
                accessToken: tokenResponse.accessToken,
                idToken: tokenResponse.idToken || undefined,
              };
            }
          }
        }
      }

      return {
        success: false,
        error: result.type === 'cancel' ? 'User cancelled' : 'Authentication failed',
      };

    } catch (error) {
      console.error('Google Sign-In error:', error);
      
      // Check if it's a redirect URI error
      if (error instanceof Error && error.message.includes('invalid_request')) {
        return {
          success: false,
          error: 'Google OAuth configuration error. The redirect URI is not properly configured. Please contact support.',
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private async fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const userInfo: GoogleUserInfo = await response.json();
        return userInfo;
      }

      console.error('Failed to fetch user info:', response.status, response.statusText);
      return null;
    } catch (error) {
      console.error('Error fetching Google user info:', error);
      return null;
    }
  }

  // ==================== BACKEND INTEGRATION ====================

  async loginWithGoogleToBackend(googleUser: GoogleUserInfo, accessToken: string): Promise<MobileGoogleLoginResponse> {
    try {
      // Get device fingerprint for security
      const deviceFingerprint = await deviceSecurityService.getDeviceFingerprint();
      const deviceTrust = await deviceSecurityService.getDeviceTrust();

      // Calculate risk score
      const riskScore = await deviceSecurityService.calculateRiskScore({
        isNewDevice: !deviceTrust,
        daysSinceLastLogin: 0, // Will be determined by backend
        failedAttempts: 0,
      });

      // Prepare login request
      const loginData = {
        googleId: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        firstName: googleUser.given_name,
        lastName: googleUser.family_name,
        picture: googleUser.picture,
        accessToken,
        deviceInfo: {
          fingerprint: deviceFingerprint,
          trustLevel: deviceTrust?.trustLevel || 'unknown',
          riskScore,
        },
      };

      // Send request to mobile backend
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/google-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        credentials: 'include',
        body: JSON.stringify(loginData),
      });

      const result: MobileGoogleLoginResponse = await response.json();

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

        console.log('Google login successful:', result.message);
      } else {
        // Increment failed attempts
        await deviceSecurityService.incrementFailedAttempts();
        console.warn('Google login failed:', result.message);
      }

      return result;

    } catch (error) {
      console.error('Backend Google login error:', error);
      await deviceSecurityService.incrementFailedAttempts();
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  // ==================== ENHANCED 2FA INTEGRATION ====================

  async signInWithGoogleEnhanced(): Promise<{
    success: boolean;
    user?: any;
    requires2FA?: boolean;
    authMethod?: string;
    message?: string;
  }> {
    try {
      // Step 1: Google OAuth
      const googleResult = await this.signInWithGoogle();
      
      if (!googleResult.success || !googleResult.user) {
        return {
          success: false,
          message: googleResult.error || 'Google authentication failed',
        };
      }

      // Step 2: Risk Assessment
      const riskScore = await deviceSecurityService.calculateRiskScore();
      const userPrefs = await deviceSecurityService.getUserPreferences();
      const requiredAuthMethod = deviceSecurityService.determineRequiredAuthMethod(riskScore, userPrefs);

      console.log(`Risk score: ${riskScore}, Required auth: ${requiredAuthMethod}`);

      // Step 3: Enhanced Authentication
      if (requiredAuthMethod === 'BIOMETRIC_ONLY') {
        const biometricSuccess = await deviceSecurityService.authenticateWithBiometrics(
          'Verify your identity to complete Google sign-in'
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
      const backendResult = await this.loginWithGoogleToBackend(
        googleResult.user,
        googleResult.accessToken!
      );

      if (backendResult.success) {
        return {
          success: true,
          user: backendResult.user,
          message: 'Google sign-in successful',
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
      console.error('Enhanced Google sign-in error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Sign-in failed',
      };
    }
  }

  // ==================== CONFIGURATION ====================

  setClientId(clientId: string): void {
    this.config.clientId = clientId;
    // Reinitialize with new client ID
    this.initializeAuth();
  }

  getRedirectUri(): string {
    return this.config.redirectUri;
  }

  // ==================== UTILITY METHODS ====================

  async signOut(): Promise<void> {
    try {
      // Clear any cached auth state
      this.request = null;
      
      // Revoke tokens if available
      // Note: In a real implementation, you might want to store and revoke tokens
      
      console.log('Google sign-out completed');
    } catch (error) {
      console.error('Google sign-out error:', error);
    }
  }

  isConfigured(): boolean {
    return !!this.config.clientId;
  }

  // ==================== DEBUG METHODS ====================

  getAuthConfig(): GoogleAuthConfig {
    return { ...this.config };
  }

  async testGoogleConnection(): Promise<boolean> {
    try {
      if (!this.discovery) {
        await this.initializeAuth();
      }
      return !!this.discovery;
    } catch (error) {
      console.error('Google connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const googleAuthService = new GoogleAuthService();
export default googleAuthService;

// Export types
export type {
  GoogleAuthConfig, GoogleAuthResult, GoogleUserInfo, MobileGoogleLoginResponse
};

