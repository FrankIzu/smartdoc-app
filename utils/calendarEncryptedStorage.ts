/**
 * At-rest storage for calendar offline blobs.
 * Uses react-native-encrypted-storage when available; falls back to AsyncStorage.
 * Threat model: reduces exposure from device backup / filesystem scrape; does not stop active compromise.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

let EncryptedStorage: typeof import('react-native-encrypted-storage').default | null = null;
try {
  EncryptedStorage = require('react-native-encrypted-storage').default;
} catch {
  EncryptedStorage = null;
}

export async function getCalendarEncryptedBlob(key: string): Promise<string | null> {
  if (EncryptedStorage) {
    try {
      const v = await EncryptedStorage.getItem(key);
      if (v != null) return v;
    } catch {
      /* fall through */
    }
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setCalendarEncryptedBlob(key: string, value: string): Promise<void> {
  if (EncryptedStorage) {
    try {
      await EncryptedStorage.setItem(key, value);
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export async function removeCalendarEncryptedBlob(key: string): Promise<void> {
  if (EncryptedStorage) {
    try {
      await EncryptedStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
