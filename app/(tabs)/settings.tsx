import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEnhanced2FAAuth } from '../../contexts/Enhanced2FAAuthContext';
import { apiService as api } from '../../services/api';
import deviceSecurityService from '../../services/deviceSecurity';
import { useAuth } from '../context/auth';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  created_at: string;
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    push_enabled: boolean;
    email_enabled: boolean;
    file_upload: boolean;
    file_processing: boolean;
    form_responses: boolean;
    upload_link_activity: boolean;
    workspace_updates: boolean;
  };
  file_management: {
  auto_categorization: boolean;
    auto_receipt_processing: boolean;
  file_preview: boolean;
    auto_backup: boolean;
    compress_images: boolean;
  };
  upload_settings: {
    wifi_only_upload: boolean;
    max_file_size_mb: number;
    allowed_file_types: string[];
  };
  privacy: {
  analytics_tracking: boolean;
    crash_reporting: boolean;
    usage_statistics: boolean;
  };
  display: {
    show_file_sizes: boolean;
    show_upload_dates: boolean;
    grid_view_default: boolean;
    items_per_page: number;
  };
}

interface ProfileResponse {
  success: boolean;
  profile: UserProfile;
}

interface PreferencesResponse {
  success: boolean;
  preferences: UserPreferences;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user, logout } = useEnhanced2FAAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [deviceTrustEnabled, setDeviceTrustEnabled] = useState(true);
  const [remember2FA, setRemember2FA] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);

  // Collapsible sections state - only About and Account expanded by default
  const [expandedSections, setExpandedSections] = useState({
    notifications: false,
    security: true,
    fileManagement: false,
    uploadSettings: false,
    display: false,
    privacy: false,
    analytics: false,
    about: true,
    account: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load user profile using the getUserProfile method
      const profileResponse = await api.getUserProfile();
      
      if (profileResponse.success && profileResponse.data) {
        // Transform the user data to match our UserProfile interface
        const userData = profileResponse.data;
        const profileData: UserProfile = {
          id: userData.id || 0,
          username: userData.username || '',
          email: userData.email || '',
          first_name: userData.first_name || userData.name?.split(' ')[0] || '',
          last_name: userData.last_name || userData.name?.split(' ').slice(1).join(' ') || '',
          is_admin: userData.is_admin || false,
          created_at: userData.created_at || new Date().toISOString(),
        };
        setProfile(profileData);
      }

      // Set default preferences since we don't have a specific endpoint yet
      const defaultPreferences: UserPreferences = {
        theme: 'light',
        notifications: {
          push_enabled: true,
          email_enabled: true,
          file_upload: true,
          file_processing: true,
          form_responses: true,
          upload_link_activity: true,
          workspace_updates: true,
        },
        file_management: {
        auto_categorization: true,
          auto_receipt_processing: true,
        file_preview: true,
          auto_backup: false,
          compress_images: true,
        },
        upload_settings: {
          wifi_only_upload: false,
          max_file_size_mb: 50,
          allowed_file_types: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif'],
        },
        privacy: {
        analytics_tracking: true,
          crash_reporting: true,
          usage_statistics: true,
        },
        display: {
          show_file_sizes: true,
          show_upload_dates: true,
          grid_view_default: false,
          items_per_page: 20,
        },
      };
      setPreferences(defaultPreferences);
      
      // Check biometric availability
      const biometricConfig = await deviceSecurityService.initializeBiometrics();
      setBiometricAvailable(biometricConfig.enabled);

      // Load device info
      const info = await deviceSecurityService.getDeviceFingerprint();
      setDeviceInfo(info);

      // Load user preferences
      const userPrefs = await deviceSecurityService.getUserPreferences();
      setBiometricEnabled(userPrefs.biometricEnabled);
      setDeviceTrustEnabled(userPrefs.rememberDevice);
      setRemember2FA(userPrefs.rememberDevice);

    } catch (error) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (updatedPreferences: UserPreferences) => {
    try {
      setUpdating(true);
      
      // For now, just update the local state since we don't have a preferences endpoint
      // In the future, this would call api.updateUserProfile() or a specific preferences endpoint
      setPreferences(updatedPreferences);
      
      // You could save to local storage here for persistence
      console.log('Updated preferences:', updatedPreferences);
      
    } catch (error) {
      console.error('Failed to update preferences:', error);
      Alert.alert('Error', 'Failed to update preferences');
    } finally {
      setUpdating(false);
    }
  };

  const togglePreference = (key: string, value: boolean) => {
    if (!preferences) return;

    let updatedPreferences = { ...preferences };

    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      updatedPreferences = {
        ...preferences,
        [parent]: {
          ...(preferences[parent as keyof UserPreferences] as any),
          [child]: value,
        },
      };
    }

    updatePreferences(updatedPreferences);
  };

  const formatJoinDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  };

  // Check if user can access feature (admin-only features)
  const canAccessFeature = (feature: string): boolean => {
    const adminOnlyFeatures = [
      'analytics.dashboard',
      'analytics.export',
      'file_management.auto_backup',
      'privacy.usage_statistics',
      'upload_settings.max_file_size',
      'display.items_per_page'
    ];
    
    if (adminOnlyFeatures.includes(feature)) {
      return profile?.is_admin || false;
    }
    
    return true;
  };

  const InfoItem = ({
    icon,
    title,
    value,
    onPress,
    adminOnly = false,
  }: {
    icon: string;
    title: string;
    value: string;
    onPress?: () => void;
    adminOnly?: boolean;
  }) => {
    // Hide admin-only features for non-admin users
    if (adminOnly && !profile?.is_admin) {
      return null;
    }

    return (
      <TouchableOpacity style={styles.infoItem} onPress={onPress} disabled={!onPress}>
        <View style={styles.settingIcon}>
          <Ionicons name={icon as any} size={20} color="#666" />
        </View>
        <View style={styles.settingContent}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingValue}>{value}</Text>
        </View>
        {onPress && <Ionicons name="chevron-forward" size={20} color="#666" />}
      </TouchableOpacity>
    );
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)');
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const CollapsibleSection = ({
    title,
    isExpanded,
    onToggle,
    children,
    isDanger = false,
    adminOnly = false,
  }: {
    title: string;
    isExpanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    isDanger?: boolean;
    adminOnly?: boolean;
  }) => {
    // Hide admin-only sections for non-admin users
    if (adminOnly && !profile?.is_admin) {
      return null;
    }

    return (
      <View style={styles.section}>
        <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
          <Text style={[styles.sectionTitle, isDanger && styles.dangerText]}>{title}</Text>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color={isDanger ? "#FF3B30" : "#666"} 
          />
        </TouchableOpacity>
        {isExpanded && <View style={styles.sectionContent}>{children}</View>}
      </View>
    );
  };

  const getImplementationStatus = (feature: string): 'implemented' | 'partial' | 'placeholder' => {
    const implementedFeatures = [
      'notifications.push_enabled',
      'notifications.email_enabled',
      'file_management.auto_categorization',
      'file_management.auto_receipt_processing',
      'file_management.file_preview',
      'file_management.compress_images',
      'display.show_file_sizes',
      'display.show_upload_dates',
      'display.grid_view_default',
      'privacy.analytics_tracking',
      'privacy.crash_reporting',
      // Security features are now fully implemented
      'security.biometric',
      'security.remember_device',
      'security.remember_2fa',
    ];

    const partialFeatures = [
      'notifications.file_upload',
      'notifications.file_processing',
      'notifications.form_responses',
      'notifications.upload_link_activity',
      'notifications.workspace_updates',
      'upload_settings.wifi_only_upload',
    ];

    if (implementedFeatures.includes(feature)) {
      return 'implemented';
    } else if (partialFeatures.includes(feature)) {
      return 'partial';
    } else {
      return 'placeholder';
    }
  };

  const StatusIndicator = ({ status }: { status: 'implemented' | 'partial' | 'placeholder' }) => {
    const colors = {
      implemented: '#34C759',
      partial: '#FF9500', 
      placeholder: '#8E8E93'
    };
    
    const symbols = {
      implemented: '✓',
      partial: '◐',
      placeholder: '○'
    };

    return (
      <View style={[styles.statusIndicator, { backgroundColor: colors[status] }]}>
        <Text style={styles.statusText}>{symbols[status]}</Text>
      </View>
    );
  };

  const EnhancedSettingItem = ({
    icon,
    title,
    subtitle,
    value,
    onToggle,
    disabled = false,
    feature,
    adminOnly = false,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    value: boolean;
    onToggle: (value: boolean) => void;
    disabled?: boolean;
    feature: string;
    adminOnly?: boolean;
  }) => {
    // Hide admin-only features for non-admin users
    if (adminOnly && !profile?.is_admin) {
      return null;
    }

    const status = getImplementationStatus(feature);
    const isDisabled = disabled || status === 'placeholder';
    
    return (
      <View style={[styles.settingItem, isDisabled && styles.disabledItem]} key={feature}>
      <View style={styles.settingIcon}>
          <Ionicons name={icon as any} size={20} color={isDisabled ? "#ccc" : "#666"} />
      </View>
      <View style={styles.settingContent}>
          <View style={styles.settingTitleRow}>
            <Text style={[styles.settingTitle, isDisabled && styles.disabledText]}>{title}</Text>
            <StatusIndicator status={status} />
          </View>
          {subtitle && (
            <Text style={[styles.settingSubtitle, isDisabled && styles.disabledText]}>{subtitle}</Text>
          )}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
          disabled={isDisabled}
          trackColor={{ false: '#E5E5EA', true: '#34C759' }}
          thumbColor={value ? '#fff' : '#fff'}
      />
    </View>
  );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

        {/* Notifications Section */}
        {preferences && (
          <CollapsibleSection
            title="Notifications"
            isExpanded={expandedSections.notifications}
            onToggle={() => toggleSection('notifications')}
          >
            <EnhancedSettingItem
              icon="notifications-outline"
              title="Push Notifications"
              subtitle="Receive notifications on your device"
              value={preferences.notifications.push_enabled}
              onToggle={(value) => togglePreference('notifications.push_enabled', value)}
              feature="notifications.push_enabled"
            />
            <EnhancedSettingItem
              icon="mail-outline"
              title="Email Notifications"
              subtitle="Receive notifications via email"
              value={preferences.notifications.email_enabled}
              onToggle={(value) => togglePreference('notifications.email_enabled', value)}
              feature="notifications.email_enabled"
            />
            <EnhancedSettingItem
              icon="cloud-upload-outline"
              title="File Upload Notifications"
              subtitle="Notify when files are uploaded"
              value={preferences.notifications.file_upload}
              onToggle={(value) => togglePreference('notifications.file_upload', value)}
              feature="notifications.file_upload"
            />
            <EnhancedSettingItem
              icon="settings-outline"
              title="File Processing Notifications"
              subtitle="Notify when files are processed"
              value={preferences.notifications.file_processing}
              onToggle={(value) => togglePreference('notifications.file_processing', value)}
              feature="notifications.file_processing"
            />
            <EnhancedSettingItem
              icon="clipboard-outline"
              title="Form Response Notifications"
              subtitle="Notify when forms receive responses"
              value={preferences.notifications.form_responses}
              onToggle={(value) => togglePreference('notifications.form_responses', value)}
              feature="notifications.form_responses"
            />
            <EnhancedSettingItem
              icon="link-outline"
              title="Upload Link Activity"
              subtitle="Notify when someone uses your upload links"
              value={preferences.notifications.upload_link_activity}
              onToggle={(value) => togglePreference('notifications.upload_link_activity', value)}
              feature="notifications.upload_link_activity"
            />
            <EnhancedSettingItem
              icon="people-outline"
              title="Workspace Updates"
              subtitle="Notify about workspace changes and invitations"
              value={preferences.notifications.workspace_updates}
              onToggle={(value) => togglePreference('notifications.workspace_updates', value)}
              feature="notifications.workspace_updates"
            />
          </CollapsibleSection>
        )}

        {/* Enhanced 2FA Security Section */}
        <CollapsibleSection
          title="Security & 2FA"
          isExpanded={expandedSections.security}
          onToggle={() => toggleSection('security')}
        >
          <EnhancedSettingItem
            icon="finger-print"
            title="Biometric Authentication"
            subtitle={biometricAvailable 
              ? "Use Face ID or Touch ID for quick login" 
              : "Biometric authentication not available on this device"}
            value={biometricEnabled}
            onToggle={async (value) => {
              if (!biometricAvailable) {
                Alert.alert(
                  'Biometric Not Available',
                  'Biometric authentication is not set up on this device. Please set up Face ID or Touch ID in your device settings.',
                  [{ text: 'OK' }]
                );
                return;
              }
              
              if (value) {
                try {
                  const success = await deviceSecurityService.authenticateWithBiometrics('Enable biometric authentication');
                  if (success) {
                    setBiometricEnabled(true);
                    const userPrefs = await deviceSecurityService.getUserPreferences();
                    await deviceSecurityService.setUserPreferences({
                      ...userPrefs,
                      biometricEnabled: true,
                    });
                    Alert.alert('Success', 'Biometric authentication enabled!');
                  }
                } catch (error) {
                  Alert.alert('Error', 'Failed to enable biometric authentication');
                }
              } else {
                setBiometricEnabled(false);
                const userPrefs = await deviceSecurityService.getUserPreferences();
                await deviceSecurityService.setUserPreferences({
                  ...userPrefs,
                  biometricEnabled: false,
                });
              }
            }}
            disabled={!biometricAvailable}
            feature="security.biometric"
          />
          
          <EnhancedSettingItem
            icon="shield-checkmark"
            title="Device Trust"
            subtitle="Remember this device to reduce 2FA prompts"
            value={deviceTrustEnabled}
            onToggle={async (value) => {
              setDeviceTrustEnabled(value);
              const userPrefs = await deviceSecurityService.getUserPreferences();
              await deviceSecurityService.setUserPreferences({
                ...userPrefs,
                rememberDevice: value,
              });

              if (!value) {
                await deviceSecurityService.revokeDeviceTrust();
                Alert.alert(
                  'Device Trust Disabled',
                  'This device will no longer be remembered. You may need to go through 2FA verification on your next login.',
                  [{ text: 'OK' }]
                );
              }
            }}
            feature="security.remember_device"
          />
          
          <EnhancedSettingItem
            icon="time"
            title="Remember 2FA"
            subtitle="Skip 2FA on trusted devices for 30 days"
            value={remember2FA}
            onToggle={async (value) => {
              setRemember2FA(value);
              const userPrefs = await deviceSecurityService.getUserPreferences();
              await deviceSecurityService.setUserPreferences({
                ...userPrefs,
                rememberDevice: value,
              });
            }}
            feature="security.remember_2fa"
          />

          {biometricAvailable && (
            <TouchableOpacity 
              style={styles.testButton} 
              onPress={async () => {
                try {
                  const success = await deviceSecurityService.authenticateWithBiometrics('Test biometric authentication');
                  if (success) {
                    Alert.alert('Success', 'Biometric authentication successful!');
                  }
                } catch (error) {
                  Alert.alert('Error', error.message || 'Biometric authentication failed');
                }
              }}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="finger-print" size={20} color="#007AFF" />
              </View>
              <Text style={styles.testButtonText}>Test Biometric Authentication</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={async () => {
              try {
                const score = await deviceSecurityService.calculateRiskScore();
                Alert.alert(
                  'Current Risk Score',
                  `Your current risk score is ${score}/100\n\n` +
                  `0-30: Low Risk (Trusted)\n` +
                  `31-60: Medium Risk (2FA Required)\n` +
                  `61-100: High Risk (Full Verification)`
                );
              } catch (error) {
                Alert.alert('Error', 'Failed to calculate risk score');
              }
            }}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="analytics" size={20} color="#007AFF" />
            </View>
            <Text style={styles.actionButtonText}>Check Security Risk Score</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={async () => {
              try {
                const response = await api.getRegisteredDevices();
                if (response.success) {
                  const devices = (response as any).devices || [];
                  if (devices.length === 0) {
                    Alert.alert(
                      'Registered Devices',
                      'No registered devices found',
                      [{ text: 'OK' }]
                    );
                    return;
                  }
                  
                  const deviceList = devices.map((device: any) => 
                    `• ${device.deviceName || 'Unknown Device'}\n  ID: ${device.deviceId.substring(0, 12)}...\n  Last used: ${device.lastUsed ? new Date(device.lastUsed).toLocaleDateString() : 'Never'}\n  ${device.isActive ? '✅ Active' : '❌ Inactive'}`
                  ).join('\n\n');
                  
                  Alert.alert(
                    'Registered Devices',
                    deviceList,
                    [{ text: 'OK' }]
                  );
                } else {
                  Alert.alert('Error', response.message || 'Failed to retrieve devices');
                }
              } catch (error) {
                console.error('Device retrieval error:', error);
                Alert.alert('Error', 'Failed to retrieve registered devices');
              }
            }}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="phone-portrait" size={20} color="#007AFF" />
            </View>
            <Text style={styles.actionButtonText}>View Registered Devices</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.dangerButton} 
            onPress={() => {
              Alert.alert(
                'Clear All Device Trust',
                'This will remove trust from all devices and you will need to verify with 2FA on all devices. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear All',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deviceSecurityService.revokeDeviceTrust();
                        await deviceSecurityService.clearAllDeviceData();
                        
                        // Also clear from backend
                        const response = await api.revokeAllDevices();
                        if (response.success) {
                          Alert.alert('Success', `Device trust cleared for ${response.revokedCount || 'all'} devices`);
                        } else {
                          Alert.alert('Success', 'Local device trust cleared');
                        }
                      } catch (error) {
                        Alert.alert('Error', 'Failed to clear all device trust');
                      }
                    },
                  },
                ]
              );
            }}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="trash" size={20} color="#FF3B30" />
            </View>
            <Text style={styles.dangerButtonText}>Clear All Device Trust</Text>
          </TouchableOpacity>

          {deviceInfo && (
            <View style={styles.deviceInfoSection}>
              <Text style={styles.deviceInfoTitle}>Device Information</Text>
              <Text style={styles.deviceInfoText}>Device ID: {deviceInfo.deviceId.substring(0, 12)}...</Text>
              <Text style={styles.deviceInfoText}>Platform: {deviceInfo.platform}</Text>
              <Text style={styles.deviceInfoText}>OS Version: {deviceInfo.osVersion}</Text>
              <Text style={styles.deviceInfoText}>App Version: {deviceInfo.appVersion}</Text>
            </View>
          )}
        </CollapsibleSection>

        {/* File Management Section */}
        {preferences && (
          <CollapsibleSection
            title="File Management"
            isExpanded={expandedSections.fileManagement}
            onToggle={() => toggleSection('fileManagement')}
          >
            <EnhancedSettingItem
              icon="sparkles-outline"
              title="Auto Categorization"
              subtitle="Automatically categorize uploaded files"
              value={preferences.file_management.auto_categorization}
              onToggle={(value) => togglePreference('file_management.auto_categorization', value)}
              feature="file_management.auto_categorization"
            />
            <EnhancedSettingItem
              icon="receipt-outline"
              title="Auto Receipt Processing"
              subtitle="Automatically extract data from receipts"
              value={preferences.file_management.auto_receipt_processing}
              onToggle={(value) => togglePreference('file_management.auto_receipt_processing', value)}
              feature="file_management.auto_receipt_processing"
            />
            <EnhancedSettingItem
              icon="eye-outline"
              title="File Preview"
              subtitle="Show file previews in lists"
              value={preferences.file_management.file_preview}
              onToggle={(value) => togglePreference('file_management.file_preview', value)}
              feature="file_management.file_preview"
            />
            <EnhancedSettingItem
              icon="cloud-outline"
              title="Auto Backup"
              subtitle="Automatically backup files to cloud"
              value={preferences.file_management.auto_backup}
              onToggle={(value) => togglePreference('file_management.auto_backup', value)}
              feature="file_management.auto_backup"
              adminOnly={true}
            />
            <EnhancedSettingItem
              icon="image-outline"
              title="Compress Images"
              subtitle="Reduce image file sizes when uploading"
              value={preferences.file_management.compress_images}
              onToggle={(value) => togglePreference('file_management.compress_images', value)}
              feature="file_management.compress_images"
            />
          </CollapsibleSection>
        )}

        {/* Upload Settings Section */}
        {preferences && (
          <CollapsibleSection
            title="Upload Settings"
            isExpanded={expandedSections.uploadSettings}
            onToggle={() => toggleSection('uploadSettings')}
          >
            <EnhancedSettingItem
              icon="wifi-outline"
              title="WiFi Only Upload"
              subtitle="Only upload files when connected to WiFi"
              value={preferences.upload_settings.wifi_only_upload}
              onToggle={(value) => togglePreference('upload_settings.wifi_only_upload', value)}
              feature="upload_settings.wifi_only_upload"
            />
            <InfoItem
              icon="archive-outline"
              title="Max File Size"
              value={`${preferences.upload_settings.max_file_size_mb} MB`}
              onPress={() => Alert.alert('File Size Limit', 'Current maximum file size is 50MB. This helps ensure faster uploads and better performance. Contact support if you need to upload larger files.')}
              adminOnly={true}
            />
            <InfoItem
              icon="document-outline"
              title="Allowed File Types"
              value={`${preferences.upload_settings.allowed_file_types.length} types`}
              onPress={() => Alert.alert('Supported File Types', `Currently supported file types:\n\n• ${preferences.upload_settings.allowed_file_types.join('\n• ')}\n\nThese formats ensure optimal processing and compatibility with our AI analysis features.`)}
              adminOnly={true}
            />
          </CollapsibleSection>
        )}

        {/* Display Settings Section */}
        {preferences && (
          <CollapsibleSection
            title="Display"
            isExpanded={expandedSections.display}
            onToggle={() => toggleSection('display')}
          >
            <EnhancedSettingItem
              icon="resize-outline"
              title="Show File Sizes"
              subtitle="Display file sizes in document lists"
              value={preferences.display.show_file_sizes}
              onToggle={(value) => togglePreference('display.show_file_sizes', value)}
              feature="display.show_file_sizes"
            />
            <EnhancedSettingItem
              icon="time-outline"
              title="Show Upload Dates"
              subtitle="Display upload dates in document lists"
              value={preferences.display.show_upload_dates}
              onToggle={(value) => togglePreference('display.show_upload_dates', value)}
              feature="display.show_upload_dates"
            />
            <EnhancedSettingItem
              icon="grid-outline"
              title="Grid View Default"
              subtitle="Use grid view by default for documents"
              value={preferences.display.grid_view_default}
              onToggle={(value) => togglePreference('display.grid_view_default', value)}
              feature="display.grid_view_default"
            />
            <InfoItem
              icon="list-outline"
              title="Items Per Page"
              value={`${preferences.display.items_per_page} items`}
              onPress={() => Alert.alert('Items Per Page', 'This setting controls how many documents are shown per page in lists. Higher numbers may affect performance on older devices.')}
              adminOnly={true}
            />
          </CollapsibleSection>
        )}

        {/* Privacy Section */}
        {preferences && (
          <CollapsibleSection
            title="Privacy & Data"
            isExpanded={expandedSections.privacy}
            onToggle={() => toggleSection('privacy')}
          >
            <EnhancedSettingItem
              icon="analytics-outline"
              title="Analytics Tracking"
              subtitle="Help improve the app with usage data"
              value={preferences.privacy.analytics_tracking}
              onToggle={(value) => togglePreference('privacy.analytics_tracking', value)}
              feature="privacy.analytics_tracking"
            />
            <EnhancedSettingItem
              icon="bug-outline"
              title="Crash Reporting"
              subtitle="Send crash reports to help fix issues"
              value={preferences.privacy.crash_reporting}
              onToggle={(value) => togglePreference('privacy.crash_reporting', value)}
              feature="privacy.crash_reporting"
            />
            <EnhancedSettingItem
              icon="stats-chart-outline"
              title="Usage Statistics"
              subtitle="Share anonymous usage statistics"
              value={preferences.privacy.usage_statistics}
              onToggle={(value) => togglePreference('privacy.usage_statistics', value)}
              feature="privacy.usage_statistics"
              adminOnly={true}
            />
          </CollapsibleSection>
        )}

        {/* Analytics Section - Admin Only */}
        <CollapsibleSection
          title="Analytics & Insights"
          isExpanded={expandedSections.analytics}
          onToggle={() => toggleSection('analytics')}
          adminOnly={true}
        >
          <InfoItem
            icon="analytics-outline"
            title="View Analytics Dashboard"
            value="Detailed usage statistics and insights"
            onPress={() => router.push('/analytics/dashboard')}
            adminOnly={true}
          />
          <InfoItem
            icon="stats-chart-outline"
            title="Export Data"
            value="Download your usage data"
            onPress={() => Alert.alert('Export Data', 'Export your data in various formats:\n\n• CSV for spreadsheet analysis\n• JSON for technical integration\n• PDF reports for sharing\n\nYour data export will include document metadata, upload history, and usage statistics while respecting your privacy settings.')}
            adminOnly={true}
          />
        </CollapsibleSection>

        {/* About Section */}
        <CollapsibleSection
          title="About"
          isExpanded={expandedSections.about}
          onToggle={() => toggleSection('about')}
        >
          <InfoItem
            icon="information-circle-outline"
            title="App Version"
            value="1.0.0 (Build 2025.1)"
          />
          <InfoItem
            icon="help-circle-outline"
            title="Help & Support"
            value="Get help with the app"
            onPress={() => Alert.alert('Help & Support', 'Get assistance with GrabDocs:\n\n📧 Email: support@grabdocs.com\n💬 Live Chat: Available 9AM-5PM EST\n📖 Documentation: grabdocs.com/help\n🎥 Video Tutorials: grabdocs.com/tutorials\n\nCommon topics:\n• Setting up document categories\n• Using AI-powered search\n• Managing upload links\n• Form builder guide\n• Workspace collaboration\n\nOur support team typically responds within 24 hours.')}
          />
          <InfoItem
            icon="document-text-outline"
            title="Privacy Policy"
            value="Read our privacy policy"
            onPress={() => {
              Alert.alert(
                'Privacy Policy',
                'Open Privacy Policy in browser?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Open', 
                    onPress: () => {
                                             const url = 'https://www.grabdocs.com/privacy-policy';
                       if (Platform.OS === 'web') {
                         window.open(url, '_blank');
                       } else {
                         Linking.openURL(url);
                       }
                    }
                  }
                ]
              );
            }}
          />
          <InfoItem
            icon="shield-checkmark-outline"
            title="Terms of Service"
            value="Read our terms of service"
            onPress={() => {
              Alert.alert(
                'Terms of Service',
                'Open Terms of Service in browser?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Open', 
                    onPress: () => {
                                             const url = 'https://www.grabdocs.com/terms-of-service';
                       if (Platform.OS === 'web') {
                         window.open(url, '_blank');
                       } else {
                         Linking.openURL(url);
                       }
                    }
                  }
                ]
              );
            }}
          />
        </CollapsibleSection>

        {/* Account Section */}
        <CollapsibleSection
          title="Account"
          isExpanded={expandedSections.account}
          onToggle={() => toggleSection('account')}
        >
          {/* User Profile Info */}
          {profile && (
            <>
              <View style={styles.profileCard}>
                <View style={styles.profileIcon}>
                  <Ionicons name="person" size={32} color="#fff" />
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>
                    {profile.first_name || profile.last_name
                      ? `${profile.first_name} ${profile.last_name}`.trim()
                      : profile.username}
                  </Text>
                  <Text style={styles.profileEmail}>{profile.email}</Text>
                  {profile.is_admin && (
                    <View style={styles.adminBadge}>
                      <Ionicons name="shield" size={12} color="#fff" />
                      <Text style={styles.adminText}>Admin</Text>
                    </View>
                  )}
                </View>
        </View>

              <InfoItem
                icon="calendar-outline"
                title="Member since"
                value={formatJoinDate(profile.created_at)}
              />
              
              <InfoItem
                icon="card-outline"
                title="Subscription Plan"
                value={profile.is_admin ? "Enterprise" : "Free Plan"}
                onPress={() => Alert.alert('Subscription Plan', profile.is_admin 
                  ? 'Enterprise Plan\n\n✓ Unlimited storage\n✓ Advanced analytics\n✓ Priority support\n✓ Admin features\n✓ Custom integrations'
                  : 'Free Plan\n\n• 5GB storage\n• Basic features\n• Community support\n\nUpgrade to Pro for:\n✓ 100GB storage\n✓ Advanced features\n✓ Priority support'
                )}
              />
            </>
          )}
          
          <TouchableOpacity 
            style={styles.dangerItem}
            onPress={handleSignOut}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, styles.dangerText]}>Sign Out</Text>
              <Text style={styles.settingSubtitle}>Sign out of your account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </CollapsibleSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  dangerTitle: {
    color: '#FF3B30',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  profileIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  adminText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  disabledSetting: {
    opacity: 0.5,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  settingValue: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  dangerText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginVertical: 8,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    marginHorizontal: 20,
  },
  testButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
    marginLeft: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginVertical: 4,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    marginHorizontal: 20,
  },
  actionButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
    marginLeft: 12,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginVertical: 4,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    marginHorizontal: 20,
  },
  dangerButtonText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
    marginLeft: 12,
  },
  deviceInfoSection: {
    marginTop: 16,
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  deviceInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  deviceInfoText: {
    fontSize: 12,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  settingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  implementationNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionContent: {
    paddingTop: 0,
  },
  disabledItem: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#ccc',
  },
}); 