import { Alert } from 'react-native';

export type ConnectivityGateState = {
  deviceOffline: boolean;
  serverUnreachable: boolean;
  connectionUnstable: boolean;
};

export function getConnectivityBannerText(state: ConnectivityGateState): string | null {
  if (state.deviceOffline) {
    return "You're offline — messages can't be sent right now";
  }
  if (state.serverUnreachable) {
    return "Can't reach GrabDocs — try again in a moment";
  }
  if (state.connectionUnstable) {
    return 'Connection looks unstable — sending may fail';
  }
  return null;
}

/** True when the composer send button should be disabled. */
export function isComposerSendDisabled(state: ConnectivityGateState): boolean {
  return state.deviceOffline;
}

/** Pre-send gate — returns true if the user may proceed (including Try Anyway). */
export function promptBeforeSend(state: ConnectivityGateState): Promise<boolean> {
  if (state.deviceOffline) {
    return new Promise((resolve) => {
      Alert.alert(
        "You're offline",
        "GrabDocs can't send your message right now. Check your internet connection and try again.",
        [{ text: 'OK', onPress: () => resolve(false) }]
      );
    });
  }
  if (state.serverUnreachable) {
    return new Promise((resolve) => {
      Alert.alert(
        "Can't reach GrabDocs",
        "GrabDocs isn't reachable right now. Try again when you have a stronger connection.",
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Try Anyway', onPress: () => resolve(true) },
        ]
      );
    });
  }
  if (state.connectionUnstable) {
    return new Promise((resolve) => {
      Alert.alert(
        'Connection is unstable',
        'Your connection may be too slow to complete this request. You can try again when you have a stronger connection.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Try Anyway', onPress: () => resolve(true) },
        ]
      );
    });
  }
  return Promise.resolve(true);
}
