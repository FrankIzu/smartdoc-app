import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService as api } from '../../services/api';
import {
  anchoredPopoverCardStyle,
  anchoredPopoverOverlayStyle,
} from '../../utils/dialogSurfaceStyles';
import {
  DEFAULT_HOME_SCREEN_OPTIONS,
  extractDefaultHomeFromAuthPayload,
  loadPersistedDefaultHomeWebPath,
  MOBILE_MAIN_HOME_WEB_ALIAS,
  normalizeWebDefaultHomePath,
  persistDefaultHomeWebPath,
  reconcilePersistenceWithServerNoDefault,
  WebDefaultHomePath,
} from '../../utils/defaultHomePath';
import { useAuth } from '../context/auth';

type ProfileUser = {
  name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type MenuPanel = 'main' | 'defaultHome';

function getUserInitials(u: ProfileUser | null): string | null {
  if (!u) return null;
  const first = (u.first_name ?? '').trim();
  const last = (u.last_name ?? '').trim();
  if (first || last) {
    const initials = (first.charAt(0) + last.charAt(0)).toUpperCase();
    if (initials) return initials;
  }
  const name = (u.name ?? '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }
  const username = (u.username ?? '').trim();
  if (username) return username.slice(0, 2).toUpperCase();
  const email = (u.email ?? '').trim();
  if (email) {
    const local = email.split('@')[0] || '';
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return local.toUpperCase();
  }
  return null;
}

type ProfileMenuPopoverProps = {
  user: ProfileUser;
  buttonStyle?: ViewStyle;
};

export function ProfileMenuPopover({ user, buttonStyle }: ProfileMenuPopoverProps) {
  const router = useRouter();
  const { signOut } = useAuth();
  const colors = useThemeColors();
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<View>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPanel, setMenuPanel] = useState<MenuPanel>('main');
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, right: 0 });
  const [defaultHomeWebPath, setDefaultHomeWebPath] = useState<WebDefaultHomePath>(
    normalizeWebDefaultHomePath(MOBILE_MAIN_HOME_WEB_ALIAS),
  );
  const [defaultHomeSaving, setDefaultHomeSaving] = useState(false);

  const isDarkMode = resolvedTheme === 'dark';
  const initials = getUserInitials(user);

  const defaultHomeLabel = useMemo(() => {
    return DEFAULT_HOME_SCREEN_OPTIONS.find((o) => o.webPath === defaultHomeWebPath)?.label ?? 'Home';
  }, [defaultHomeWebPath]);

  const themeToggleLabel = isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';
  const themeToggleIcon = isDarkMode ? 'sunny-outline' : 'moon-outline';

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
    setMenuPanel('main');
  }, []);

  const refreshDefaultHome = useCallback(async () => {
    const fromPersist = await loadPersistedDefaultHomeWebPath();
    let resolvedForServer: WebDefaultHomePath = MOBILE_MAIN_HOME_WEB_ALIAS;
    let serverSpecified = false;

    try {
      const chk = await api.checkAuth();
      if (chk && typeof chk === 'object') {
        const p = extractDefaultHomeFromAuthPayload(chk);
        if (p?.kind === 'none') {
          serverSpecified = true;
          await reconcilePersistenceWithServerNoDefault();
          resolvedForServer = MOBILE_MAIN_HOME_WEB_ALIAS;
        } else if (p?.kind === 'path') {
          serverSpecified = true;
          await persistDefaultHomeWebPath(p.path);
          resolvedForServer = p.path;
        }
      }
    } catch {
      /* keep persisted / fallback */
    }

    let displaySelection: WebDefaultHomePath;
    if (!serverSpecified) {
      displaySelection =
        fromPersist && fromPersist !== MOBILE_MAIN_HOME_WEB_ALIAS
          ? (fromPersist as WebDefaultHomePath)
          : MOBILE_MAIN_HOME_WEB_ALIAS;
    } else {
      displaySelection = resolvedForServer;
    }

    setDefaultHomeWebPath(displaySelection);
  }, []);

  const openMenu = useCallback(() => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get('window').width;
      setMenuAnchor({ top: y + height + 6, right: Math.max(12, screenWidth - x - width) });
      setMenuPanel('main');
      setMenuVisible(true);
      void refreshDefaultHome();
    });
  }, [refreshDefaultHome]);

  const applyDefaultHomeSelection = async (selection: WebDefaultHomePath) => {
    try {
      setDefaultHomeSaving(true);
      let next = selection;
      if (selection === MOBILE_MAIN_HOME_WEB_ALIAS) {
        await api.updateWebDefaultHomePath(null);
        next = MOBILE_MAIN_HOME_WEB_ALIAS;
      } else {
        const res = await api.updateWebDefaultHomePath(selection);
        const returned =
          (res as { defaultHomePath?: string | null }).defaultHomePath ??
          (res as { default_home_path?: string | null }).default_home_path;
        next =
          typeof returned === 'string' && returned.trim()
            ? normalizeWebDefaultHomePath(returned)
            : selection;
      }
      await persistDefaultHomeWebPath(next);
      setDefaultHomeWebPath(next);
      closeMenu();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update default screen');
    } finally {
      setDefaultHomeSaving(false);
    }
  };

  const handleThemeToggle = async () => {
    await setTheme(isDarkMode ? 'light' : 'dark');
    closeMenu();
  };

  const handleOpenSettings = () => {
    closeMenu();
    router.navigate('/(tabs)/settings');
  };

  const handleOpenBillingUsage = () => {
    closeMenu();
    router.push('/billing' as any);
  };

  const handleSignOut = () => {
    closeMenu();
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
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
    ]);
  };

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        headerButton: {
          padding: 8,
          marginTop: 4,
        },
        headerAvatar: {
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: '#007AFF',
          justifyContent: 'center',
          alignItems: 'center',
        },
        headerAvatarText: {
          fontSize: 14,
          fontWeight: '600',
          color: '#fff',
        },
        popoverOverlay: anchoredPopoverOverlayStyle(isDarkMode),
        popoverCard: anchoredPopoverCardStyle(colors, isDarkMode, {
          minWidth: 268,
          maxWidth: 320,
        }),
        popoverItem: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 13,
          paddingHorizontal: 16,
        },
        popoverItemBorder: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        popoverItemIcon: { marginRight: 12 },
        popoverItemText: { fontSize: 16, color: colors.text, flex: 1 },
        popoverItemTextDestructive: { fontSize: 16, color: '#FF3B30', flex: 1 },
        popoverItemValue: {
          fontSize: 14,
          color: colors.textSecondary,
          marginRight: 4,
          maxWidth: 130,
        },
        submenuHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        submenuTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.text,
          flex: 1,
          marginLeft: 4,
        },
        defaultHomeOptionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        defaultHomeOptionLabel: {
          fontSize: 15,
          color: colors.text,
          flex: 1,
          marginRight: 8,
        },
      }),
    [colors, isDarkMode],
  );

  return (
    <>
      <TouchableOpacity
        ref={buttonRef}
        style={[dynamicStyles.headerButton, buttonStyle]}
        onPress={openMenu}
        accessibilityLabel="Profile menu"
        accessibilityRole="button"
      >
        {initials ? (
          <View style={dynamicStyles.headerAvatar}>
            <Text style={dynamicStyles.headerAvatarText}>{initials}</Text>
          </View>
        ) : (
          <Ionicons name="person-circle" size={38} color="#007AFF" />
        )}
      </TouchableOpacity>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={dynamicStyles.popoverOverlay}>
            <View style={[dynamicStyles.popoverCard, { top: menuAnchor.top, right: menuAnchor.right }]}>
                {menuPanel === 'main' ? (
                  <>
                    <TouchableOpacity
                      style={[dynamicStyles.popoverItem, dynamicStyles.popoverItemBorder]}
                      onPress={() => setMenuPanel('defaultHome')}
                      accessibilityRole="button"
                      accessibilityLabel="Default screen"
                    >
                      <Ionicons
                        name="home-outline"
                        size={20}
                        color={colors.text}
                        style={dynamicStyles.popoverItemIcon}
                      />
                      <Text style={dynamicStyles.popoverItemText}>Default screen</Text>
                      <Text style={dynamicStyles.popoverItemValue} numberOfLines={1}>
                        {defaultHomeLabel}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[dynamicStyles.popoverItem, dynamicStyles.popoverItemBorder]}
                      onPress={() => void handleThemeToggle()}
                      accessibilityRole="button"
                      accessibilityLabel={themeToggleLabel}
                    >
                      <Ionicons
                        name={themeToggleIcon as any}
                        size={20}
                        color={colors.text}
                        style={dynamicStyles.popoverItemIcon}
                      />
                      <Text style={dynamicStyles.popoverItemText}>{themeToggleLabel}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[dynamicStyles.popoverItem, dynamicStyles.popoverItemBorder]}
                      onPress={handleOpenBillingUsage}
                      accessibilityRole="button"
                      accessibilityLabel="Billing and Usage"
                    >
                      <Ionicons
                        name="card-outline"
                        size={20}
                        color={colors.text}
                        style={dynamicStyles.popoverItemIcon}
                      />
                      <Text style={dynamicStyles.popoverItemText}>Billing & Usage</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[dynamicStyles.popoverItem, dynamicStyles.popoverItemBorder]}
                      onPress={handleOpenSettings}
                      accessibilityRole="button"
                      accessibilityLabel="Settings"
                    >
                      <Ionicons
                        name="settings-outline"
                        size={20}
                        color={colors.text}
                        style={dynamicStyles.popoverItemIcon}
                      />
                      <Text style={dynamicStyles.popoverItemText}>Settings</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={dynamicStyles.popoverItem}
                      onPress={handleSignOut}
                      accessibilityRole="button"
                      accessibilityLabel="Sign out"
                    >
                      <Ionicons
                        name="log-out-outline"
                        size={20}
                        color="#FF3B30"
                        style={dynamicStyles.popoverItemIcon}
                      />
                      <Text style={dynamicStyles.popoverItemTextDestructive}>Sign Out</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={dynamicStyles.submenuHeader}>
                      <TouchableOpacity
                        onPress={() => setMenuPanel('main')}
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="chevron-back" size={22} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={dynamicStyles.submenuTitle}>Default screen</Text>
                      {defaultHomeSaving ? <ActivityIndicator size="small" color="#007AFF" /> : null}
                    </View>
                    <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                      {DEFAULT_HOME_SCREEN_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.webPath}
                          style={dynamicStyles.defaultHomeOptionRow}
                          onPress={() => !defaultHomeSaving && void applyDefaultHomeSelection(opt.webPath)}
                          disabled={defaultHomeSaving}
                        >
                          <Text style={dynamicStyles.defaultHomeOptionLabel}>{opt.label}</Text>
                          {defaultHomeWebPath === opt.webPath ? (
                            <Ionicons name="checkmark-circle" size={22} color="#007AFF" />
                          ) : (
                            <Ionicons name="ellipse-outline" size={22} color={colors.border} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}
