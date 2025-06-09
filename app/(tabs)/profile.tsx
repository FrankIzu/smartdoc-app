import { MaterialIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/auth';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  
  const handleLogout = async () => {
    console.log('🔴 Logout button pressed - proceeding immediately');
    try {
      console.log('🔴 Calling signOut function');
      await signOut();
      console.log('🔴 SignOut completed successfully');
      // The auth context will handle navigation automatically
    } catch (error) {
      console.error('❌ Logout error:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

  const menuItems = [
    { icon: 'folder-shared', label: 'Shared Documents', route: '/profile/shared' },
    { icon: 'storage', label: 'Storage Usage', route: '/profile/storage' },
    { icon: 'notifications', label: 'Notifications', route: '/profile/notifications' },
    { icon: 'security', label: 'Privacy & Security', route: '/profile/security' },
    { icon: 'help', label: 'Help & Support', route: '/profile/help' },
    { icon: 'settings', label: 'Settings', route: '/profile/settings' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.profileSection}>
          <Image
            style={styles.avatar}
            source={{ uri: 'https://placekitten.com/200/200' }}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{user?.name || 'User'}</Text>
            <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>
          </View>
          <Link href="/profile/edit" asChild>
            <Pressable style={styles.editButton}>
              <MaterialIcons name="edit" size={20} color="#007AFF" />
            </Pressable>
          </Link>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>25</Text>
            <Text style={styles.statLabel}>Documents</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>5</Text>
            <Text style={styles.statLabel}>Folders</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>3</Text>
            <Text style={styles.statLabel}>Shared</Text>
          </View>
        </View>
      </View>

      <View style={styles.menuSection}>
        {menuItems.map((item, index) => (
          <Link key={index} href={item.route} asChild>
            <Pressable style={styles.menuItem}>
              <MaterialIcons name={item.icon} size={24} color="#333" />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <MaterialIcons name="chevron-right" size={24} color="#999" />
            </Pressable>
          </Link>
        ))}
      </View>

      <TouchableOpacity 
        style={styles.logoutButton}
        onPress={() => {
          console.log('🔴 MAIN LOGOUT BUTTON PRESSED!');
          handleLogout();
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="logout" size={24} color="#fff" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#eee',
  },
  menuSection: {
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    padding: 20,
    marginBottom: 32,
    borderRadius: 12,
    marginHorizontal: 16,
    minHeight: 60,
  },
  logoutButtonPressed: {
    backgroundColor: '#f5f5f5',
    opacity: 0.8,
  },
  logoutText: {
    fontSize: 16,
    color: '#fff',
    marginLeft: 8,
    fontWeight: 'bold',
  },
}); 