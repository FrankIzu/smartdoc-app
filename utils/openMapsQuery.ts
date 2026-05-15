import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';

async function openUrlAttempt(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens a location query in maps apps. Tries Google Maps first (native `comgooglemaps`, then
 * Google Maps HTTPS), then Apple Maps on iOS or `geo:` on Android so other map apps can handle it.
 */
export async function openMapsForLocationLabel(label: string): Promise<void> {
  const raw = label.trim();
  if (!raw) return;

  if (/^https?:\/\//i.test(raw)) {
    try {
      await Linking.openURL(raw);
    } catch {
      Alert.alert('Maps', 'Could not open this link.');
    }
    return;
  }

  const encodedQuery = encodeURIComponent(raw);
  const order: string[] = [
    `comgooglemaps://?q=${encodedQuery}`,
    `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
  ];

  if (Platform.OS === 'ios') {
    order.push(`maps://maps.apple.com/?q=${encodedQuery}`, `https://maps.apple.com/?q=${encodedQuery}`);
  } else {
    order.push(`geo:0,0?q=${encodedQuery}`);
  }

  for (const url of order) {
    if (await openUrlAttempt(url)) return;
  }

  Alert.alert('Maps', 'Could not open maps for this location.');
}
