import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedbackTouchable } from '../../components/FeedbackTouchable';
import { useThemeColors } from '../../hooks/useThemeColors';
import { calendarIcsUrl } from '../../services/calendarApi';

import AppBackButton, { APP_BACK_BUTTON_SLOT } from '../../components/AppBackButton';
import AppHeaderTitle from '../../components/AppHeaderTitle';

export default function CalendarIcsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [opening, setOpening] = useState(true);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', padding: 12 , backgroundColor: colors.headerBackground },
        h1: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 },
        body: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
        text: { color: colors.text, textAlign: 'center', marginVertical: 16 },
        btn: { backgroundColor: '#007AFF', borderRadius: 10, padding: 14, minWidth: 160, alignItems: 'center' },
        btnText: { color: '#fff', fontWeight: '600' },
      }),
    [colors]
  );

  const openIcs = async () => {
    if (!token) {
      Alert.alert('Invalid link', 'Missing calendar token.');
      setOpening(false);
      return;
    }
    setOpening(true);
    try {
      await Linking.openURL(calendarIcsUrl(token));
    } catch {
      Alert.alert('Calendar invite', 'Could not open this invite file.');
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    openIcs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton />
        <AppHeaderTitle>Calendar invite</AppHeaderTitle>
        <View style={{ width: APP_BACK_BUTTON_SLOT }} />
      </View>
      <View style={styles.body}>
        {opening ? <ActivityIndicator /> : null}
        <Text style={styles.text}>Open this calendar invite with your device calendar.</Text>
        <FeedbackTouchable
          style={styles.btn}
          onPress={openIcs}
          disabled={opening}
          loading={opening}
          spinnerColor="#fff"
        >
          <Text style={styles.btnText}>Open invite</Text>
        </FeedbackTouchable>
      </View>
    </SafeAreaView>
  );
}
