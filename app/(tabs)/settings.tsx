import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService as api } from '../../services/api';

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
  theme: string;
  notifications: {
    push_enabled: boolean;
    email_enabled: boolean;
    file_upload: boolean;
    file_processing: boolean;
    form_responses: boolean;
  };
  auto_categorization: boolean;
  file_preview: boolean;
  analytics_tracking: boolean;
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

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
        },
        auto_categorization: true,
        file_preview: true,
        analytics_tracking: true,
      };
      setPreferences(defaultPreferences);
      
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
    } else {
      updatedPreferences = {
        ...preferences,
        [key]: value,
      };
    }

    updatePreferences(updatedPreferences);
  };

  const formatJoinDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const SettingItem = ({
    icon,
    title,
    subtitle,
    value,
    onToggle,
    disabled = false,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    value: boolean;
    onToggle: (value: boolean) => void;
    disabled?: boolean;
  }) => (
    <View style={[styles.settingItem, disabled && styles.disabledSetting]}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon as any} size={20} color="#007AFF" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled || updating}
        trackColor={{ false: '#767577', true: '#007AFF' }}
        thumbColor="#fff"
      />
    </View>
  );

  const InfoItem = ({
    icon,
    title,
    value,
    onPress,
  }: {
    icon: string;
    title: string;
    value: string;
    onPress?: () => void;
  }) => (
    <TouchableOpacity style={styles.infoItem} onPress={onPress} disabled={!onPress}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon as any} size={20} color="#666" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingValue}>{value}</Text>
      </View>
      {onPress && (
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      )}
    </TouchableOpacity>
  );

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
        {/* Profile Section */}
        {profile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile</Text>
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
          </View>
        )}

        {/* Notifications Section */}
        {preferences && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <SettingItem
              icon="notifications-outline"
              title="Push Notifications"
              subtitle="Receive notifications on your device"
              value={preferences.notifications.push_enabled}
              onToggle={(value) => togglePreference('notifications.push_enabled', value)}
            />
            <SettingItem
              icon="mail-outline"
              title="Email Notifications"
              subtitle="Receive notifications via email"
              value={preferences.notifications.email_enabled}
              onToggle={(value) => togglePreference('notifications.email_enabled', value)}
            />
            <SettingItem
              icon="cloud-upload-outline"
              title="File Upload Notifications"
              subtitle="Notify when files are uploaded"
              value={preferences.notifications.file_upload}
              onToggle={(value) => togglePreference('notifications.file_upload', value)}
            />
            <SettingItem
              icon="settings-outline"
              title="File Processing Notifications"
              subtitle="Notify when files are processed"
              value={preferences.notifications.file_processing}
              onToggle={(value) => togglePreference('notifications.file_processing', value)}
            />
            <SettingItem
              icon="document-text-outline"
              title="Form Response Notifications"
              subtitle="Notify when forms receive responses"
              value={preferences.notifications.form_responses}
              onToggle={(value) => togglePreference('notifications.form_responses', value)}
            />
          </View>
        )}

        {/* App Preferences Section */}
        {preferences && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>App Preferences</Text>
            <SettingItem
              icon="sparkles-outline"
              title="Auto Categorization"
              subtitle="Automatically categorize uploaded files"
              value={preferences.auto_categorization}
              onToggle={(value) => togglePreference('auto_categorization', value)}
            />
            <SettingItem
              icon="eye-outline"
              title="File Preview"
              subtitle="Show file previews in lists"
              value={preferences.file_preview}
              onToggle={(value) => togglePreference('file_preview', value)}
            />
            <SettingItem
              icon="analytics-outline"
              title="Analytics Tracking"
              subtitle="Help improve the app with usage data"
              value={preferences.analytics_tracking}
              onToggle={(value) => togglePreference('analytics_tracking', value)}
            />
          </View>
        )}

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <InfoItem
            icon="information-circle-outline"
            title="App Version"
            value="1.0.0"
          />
          <InfoItem
            icon="help-circle-outline"
            title="Help & Support"
            value="Get help with the app"
            onPress={() => Alert.alert('Help', 'Help & support features coming soon!')}
          />
          <InfoItem
            icon="document-text-outline"
            title="Privacy Policy"
            value="Read our privacy policy"
            onPress={() => Alert.alert('Privacy', 'Privacy policy viewer coming soon!')}
          />
          <InfoItem
            icon="shield-checkmark-outline"
            title="Terms of Service"
            value="Read our terms of service"
            onPress={() => Alert.alert('Terms', 'Terms of service viewer coming soon!')}
          />
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Account</Text>
          <TouchableOpacity 
            style={styles.dangerItem}
            onPress={() => {
              Alert.alert(
                'Sign Out',
                'Are you sure you want to sign out?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign Out', style: 'destructive', onPress: () => {
                    // Handle sign out
                    Alert.alert('Signed Out', 'Sign out functionality coming soon!');
                  }},
                ]
              );
            }}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.dangerText}>Sign Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
    color: '#666',
    marginTop: 2,
  },
  dangerText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FF3B30',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
}); 