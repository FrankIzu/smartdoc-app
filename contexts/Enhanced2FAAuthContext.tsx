import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../app/context/auth';
import { API_BASE_URL } from '../constants/Config';
import { deviceSecurityService } from '../services/deviceSecurity';
import { googleAuthService } from '../services/googleAuth';

// Import types from the real service
type DeviceFingerprint = any;
type User2FAPreferences = any;

// Enhanced auth types
interface Enhanced2FAUser {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  isSystemAdmin?: boolean;
  authMethod?: 'password' | 'google' | 'phone_2fa';
  deviceTrusted?: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  user: Enhanced2FAUser | null;
  isLoading: boolean;
  deviceFingerprint: DeviceFingerprint | null;
  userPreferences: User2FAPreferences | null;
  lastRiskScore: number;
}

interface LoginCredentials {
  username: string;
  password: string;
  rememberDevice?: boolean;
}

interface Enhanced2FAContextType {
  // Auth state
  isAuthenticated: boolean;
  user: Enhanced2FAUser | null;
  isLoading: boolean;
  
  // Device security
  deviceFingerprint: DeviceFingerprint | null;
  userPreferences: User2FAPreferences | null;
  lastRiskScore: number;
  
  // Authentication methods
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; requires2FA?: boolean; authMethod?: string; message?: string }>;
  loginWithBiometric: () => Promise<{ success: boolean; message?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; requires2FA?: boolean; authMethod?: string; message?: string }>;
  signup: (data: { username: string; email: string; password: string; firstName?: string; lastName?: string }) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  
  // 2FA methods
  requestOTP: (phoneNumber: string, countryCode?: string) => Promise<{ success: boolean; message?: string; testOtp?: string }>;
  verifyOTP: (phoneNumber: string, otpCode: string) => Promise<{ success: boolean; message?: string }>;
  loginWithPhone: (phoneNumber: string, password: string) => Promise<{ success: boolean; message?: string }>;
  
  // Device management
  updateUserPreferences: (prefs: User2FAPreferences) => Promise<void>;
  revokeDeviceTrust: () => Promise<void>;
  getSecurityStatus: () => Promise<any>;
  
  // Utility
  refreshAuth: () => Promise<void>;
  calculateCurrentRiskScore: () => Promise<number>;
}

const Enhanced2FAAuthContext = createContext<Enhanced2FAContextType | undefined>(undefined);

export function Enhanced2FAAuthProvider({ children }: { children: React.ReactNode }) {
  const authContext = useAuth(); // Get the regular auth context
  
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
    deviceFingerprint: null,
    userPreferences: null,
    lastRiskScore: 0,
  });

  // ==================== INITIALIZATION ====================

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      // Initialize device security
      const deviceFingerprint = await deviceSecurityService.generateDeviceFingerprint();
      const userPreferences = await deviceSecurityService.getUserPreferences();
      const riskScore = await deviceSecurityService.calculateRiskScore();

      // Check authentication status
      console.log('🔍 Checking auth status...');
      const authResult = await checkAuthStatus();
      console.log('🔍 Auth check result:', authResult);

      setAuthState({
        isAuthenticated: authResult.success,
        user: authResult.user || null,
        isLoading: false,
        deviceFingerprint,
        userPreferences,
        lastRiskScore: riskScore,
      });

      console.log('Enhanced 2FA Auth initialized:', {
        authenticated: authResult.success,
        riskScore,
        deviceTrusted: await deviceSecurityService.getDeviceTrust(),
      });

    } catch (error) {
      console.error('Failed to initialize Enhanced 2FA Auth:', error);
      setAuthState(prev => ({ 
        ...prev, 
        isLoading: false,
        isAuthenticated: false
      }));
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth-check`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        credentials: 'include',
      });

      const result = await response.json();
      return {
        success: result.success,
        user: result.data ? {
          id: result.data.id,
          username: result.data.username,
          email: result.data.email,
          firstName: result.data.first_name,
          lastName: result.data.last_name,
        } : null,
      };
    } catch (error) {
      console.error('Auth check failed:', error);
      return { success: false, user: null };
    }
  };

  // ==================== ENHANCED LOGIN ====================

  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      console.log('🔐 LOGIN START:', credentials.username);
      setAuthState(prev => ({ ...prev, isLoading: true }));

      // Step 1: Calculate risk score
      const riskScore = await deviceSecurityService.calculateRiskScore();
      const userPrefs = await deviceSecurityService.getUserPreferences();
      const requiredAuthMethod = deviceSecurityService.determineRequiredAuthMethod(riskScore, userPrefs);

      console.log(`Login attempt - Risk: ${riskScore}, Method: ${requiredAuthMethod}`);

      // Step 2: Handle biometric pre-authentication
      if (requiredAuthMethod === 'BIOMETRIC_ONLY' || requiredAuthMethod === 'BIOMETRIC_PLUS_PASSWORD') {
        console.log('🔒 Biometric pre-auth required');
        
        // Check if biometrics are actually available
        const biometricConfig = await deviceSecurityService.initializeBiometrics();
        if (!biometricConfig.enabled) {
          console.log('⚠️ Biometrics not available, skipping biometric auth');
          // Continue with password-only login since biometrics aren't available
        } else {
          const biometricResult = await deviceSecurityService.authenticateWithBiometrics(
            'Verify your identity to sign in'
          );

          if (!biometricResult && requiredAuthMethod === 'BIOMETRIC_ONLY') {
            console.log('❌ Biometric pre-auth failed');
            setAuthState(prev => ({ ...prev, isLoading: false }));
            return {
              success: false,
              requires2FA: true,
              authMethod: 'BIOMETRIC',
              message: 'Biometric authentication required',
            };
          }
          console.log('✅ Biometric pre-auth success');
        }
      }

      // Step 3: Regular login attempt
      console.log('🌐 Making API login request...');
      const deviceFingerprint = await deviceSecurityService.generateDeviceFingerprint();
      const loginData = {
        username: credentials.username,
        password: credentials.password,
        deviceInfo: {
          fingerprint: deviceFingerprint,
          riskScore,
          requiredAuthMethod,
          rememberDevice: credentials.rememberDevice,
        },
      };

      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        credentials: 'include',
        body: JSON.stringify(loginData),
      });

      console.log('📡 API Response status:', response.status);
      const result = await response.json();
      console.log('📊 API Response data:', result);

              if (result.success) {
          console.log('✅ LOGIN SUCCESS');
          // Login successful
          await deviceSecurityService.resetFailedAttempts();
          
          if (result.session_info?.deviceTrusted) {
            await deviceSecurityService.setDeviceTrust('trusted', 30);
          }

          await deviceSecurityService.setLastLoginData({
            timestamp: new Date().toISOString(),
          });

          setAuthState(prev => ({
            ...prev,
            isAuthenticated: true,
            user: result.user,
            isLoading: false,
            lastRiskScore: riskScore,
          }));

          // 🔄 SYNC WITH REGULAR AUTH CONTEXT FOR NAVIGATION
          console.log('🔄 Syncing with regular auth context...');
          try {
            if (authContext?.signIn) {
              await authContext.signIn(credentials.username, credentials.password, credentials.rememberDevice || false);
              console.log('✅ Regular auth context updated successfully');
            }
          } catch (error) {
            console.warn('⚠️ Failed to sync with regular auth context:', error);
            // Continue anyway since Enhanced2FA login was successful
          }

          return {
            success: true,
            message: 'Login successful',
          };
      } else {
        console.log('❌ LOGIN FAILED:', result.message);
        // Login failed
        await deviceSecurityService.incrementFailedAttempts();
        
        // Check if 2FA is required
        if (requiredAuthMethod.includes('SMS') || riskScore >= 60) {
          setAuthState(prev => ({ ...prev, isLoading: false }));
          return {
            success: false,
            requires2FA: true,
            authMethod: 'SMS_2FA',
            message: 'Additional verification required',
          };
        }

        setAuthState(prev => ({ ...prev, isLoading: false }));
        return {
          success: false,
          message: result.message || 'Login failed',
        };
      }

    } catch (error) {
      console.error('💥 Enhanced login error:', error);
      await deviceSecurityService.incrementFailedAttempts();
      
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }, []);

  // ==================== BIOMETRIC LOGIN ====================

  const loginWithBiometric = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      // First, check if biometrics are available on this device
      const biometricConfig = await deviceSecurityService.initializeBiometrics();
      if (!biometricConfig.enabled) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return {
          success: false,
          message: 'Biometric authentication is not available on this device',
        };
      }

      // Perform biometric authentication first
      const biometricResult = await deviceSecurityService.authenticateWithBiometrics(
        'Sign in with biometric authentication'
      );

      if (!biometricResult) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return {
          success: false,
          message: 'Biometric authentication was cancelled or failed',
        };
      }

      // Check if device is trusted for biometric login
      const deviceTrust = await deviceSecurityService.getDeviceTrust();
      
      if (!deviceTrust || deviceTrust.trustLevel !== 'trusted') {
        // Device not trusted - inform user they need to login with username/password first
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return {
          success: false,
          message: 'Device not enrolled for biometric login. Please sign in with your username and password first to enable biometric authentication.',
        };
      }

      // Verify with backend using device trust
      const deviceFingerprint = await deviceSecurityService.generateDeviceFingerprint();
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/biometric-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        credentials: 'include',
        body: JSON.stringify({
          deviceFingerprint,
          trustData: deviceTrust,
        }),
      });

      const result = await response.json();

      if (result.success) {
        await deviceSecurityService.setLastLoginData({
          timestamp: new Date().toISOString(),
        });

        setAuthState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: result.user,
          isLoading: false,
        }));

        // 🔄 SYNC WITH REGULAR AUTH CONTEXT FOR NAVIGATION
        console.log('🔄 Syncing biometric login with regular auth context...');
        try {
          if (authContext?.signIn) {
            // For biometric login, we don't have the password, so just set authenticated state
            authContext.setUser(result.user);
            console.log('✅ Regular auth context updated successfully');
          }
        } catch (error) {
          console.warn('⚠️ Failed to sync with regular auth context:', error);
          // Continue anyway since biometric login was successful
        }

        return {
          success: true,
          message: 'Biometric login successful',
        };
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return {
          success: false,
          message: result.message || 'Biometric login failed',
        };
      }

    } catch (error) {
      console.error('Biometric login error:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Biometric login failed',
      };
    }
  }, [authContext]);

  // ==================== GOOGLE SIGN-IN ====================

  const signInWithGoogle = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      const result = await googleAuthService.signInWithGoogleEnhanced();

      if (result.success && result.user) {
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: result.user,
          isLoading: false,
        }));

        return {
          success: true,
          message: 'Google sign-in successful',
        };
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return {
          success: false,
          requires2FA: result.requires2FA,
          authMethod: result.authMethod,
          message: result.message || 'Google sign-in failed',
        };
      }

    } catch (error) {
      console.error('Google sign-in error:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Google sign-in failed',
      };
    }
  }, []);

  // ==================== 2FA METHODS ====================

  const requestOTP = useCallback(async (phoneNumber: string, countryCode: string = 'US') => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        body: JSON.stringify({
          phoneNumber,
          countryCode,
          purpose: 'verification',
        }),
      });

      const result = await response.json();
      return {
        success: result.success,
        message: result.message,
        testOtp: result.testOtp, // For development/test numbers
      };
    } catch (error) {
      console.error('OTP request error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send OTP',
      };
    }
  }, []);

  const verifyOTP = useCallback(async (phoneNumber: string, otpCode: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        body: JSON.stringify({
          phoneNumber,
          otpCode,
        }),
      });

      const result = await response.json();
      return {
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      console.error('OTP verification error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to verify OTP',
      };
    }
  }, []);

  const loginWithPhone = useCallback(async (phoneNumber: string, password: string) => {
    try {
      const deviceFingerprint = await deviceSecurityService.generateDeviceFingerprint();
      
      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/auth/login-with-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        credentials: 'include',
        body: JSON.stringify({
          phoneNumber,
          password,
          deviceInfo: {
            fingerprint: deviceFingerprint,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        await deviceSecurityService.resetFailedAttempts();
        await deviceSecurityService.setLastLoginData({
          timestamp: new Date().toISOString(),
        });

        setAuthState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: result.user,
        }));

        return {
          success: true,
          message: 'Phone login successful',
        };
      } else {
        await deviceSecurityService.incrementFailedAttempts();
        return {
          success: false,
          message: result.message || 'Phone login failed',
        };
      }

    } catch (error) {
      console.error('Phone login error:', error);
      await deviceSecurityService.incrementFailedAttempts();
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Phone login failed',
      };
    }
  }, []);

  // ==================== SIGNUP ====================

  const signup = useCallback(async (data: { username: string; email: string; password: string; firstName?: string; lastName?: string }) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      const response = await fetch(`${API_BASE_URL}/api/v1/mobile/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: result.user,
          isLoading: false,
        }));

        return {
          success: true,
          message: 'Account created successfully',
        };
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return {
          success: false,
          message: result.message || 'Signup failed',
        };
      }

    } catch (error) {
      console.error('Signup error:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Signup failed',
      };
    }
  }, []);

  // ==================== LOGOUT ====================

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/v1/mobile/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'mobile',
        },
        credentials: 'include',
      });

      // Clear Google auth if used
      await googleAuthService.signOut();

      setAuthState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        deviceFingerprint: authState.deviceFingerprint,
        userPreferences: authState.userPreferences,
        lastRiskScore: 0,
      });

      console.log('Logout successful');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [authState.deviceFingerprint, authState.userPreferences]);

  // ==================== DEVICE MANAGEMENT ====================

  const updateUserPreferences = useCallback(async (prefs: User2FAPreferences) => {
    try {
      await deviceSecurityService.setUserPreferences(prefs);
      setAuthState(prev => ({
        ...prev,
        userPreferences: prefs,
      }));
    } catch (error) {
      console.error('Failed to update preferences:', error);
      throw error;
    }
  }, []);

  const revokeDeviceTrust = useCallback(async () => {
    try {
      await deviceSecurityService.revokeDeviceTrust();
      console.log('Device trust revoked');
    } catch (error) {
      console.error('Failed to revoke device trust:', error);
      throw error;
    }
  }, []);

  const getSecurityStatus = useCallback(async () => {
    return await deviceSecurityService.getDeviceSecurityStatus();
  }, []);

  const refreshAuth = useCallback(async () => {
    await initializeAuth();
  }, [initializeAuth]);

  const calculateCurrentRiskScore = useCallback(async () => {
    const riskScore = await deviceSecurityService.calculateRiskScore();
    setAuthState(prev => ({ ...prev, lastRiskScore: riskScore }));
    return riskScore;
  }, []);

  // ==================== CONTEXT VALUE ====================

  const contextValue: Enhanced2FAContextType = {
    // Auth state
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    isLoading: authState.isLoading,
    
    // Device security
    deviceFingerprint: authState.deviceFingerprint,
    userPreferences: authState.userPreferences,
    lastRiskScore: authState.lastRiskScore,
    
    // Authentication methods
    login,
    loginWithBiometric,
    signInWithGoogle,
    signup,
    logout,
    
    // 2FA methods
    requestOTP,
    verifyOTP,
    loginWithPhone,
    
    // Device management
    updateUserPreferences,
    revokeDeviceTrust,
    getSecurityStatus,
    
    // Utility
    refreshAuth,
    calculateCurrentRiskScore,
  };

  return (
    <Enhanced2FAAuthContext.Provider value={contextValue}>
      {children}
    </Enhanced2FAAuthContext.Provider>
  );
}

// ==================== HOOK ====================

export function useEnhanced2FAAuth() {
  const context = useContext(Enhanced2FAAuthContext);
  if (context === undefined) {
    throw new Error('useEnhanced2FAAuth must be used within an Enhanced2FAAuthProvider');
  }
  return context;
}

// Export types
export type {
  AuthState, Enhanced2FAContextType, Enhanced2FAUser, LoginCredentials
};

