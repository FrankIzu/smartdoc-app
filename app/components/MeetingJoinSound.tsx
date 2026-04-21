/**
 * MeetingJoinSound - Plays a sound when someone joins the meeting (mobile only)
 * Uses @100mslive/react-native-hms useHMSPeerUpdates to detect PEER_JOINED events
 *
 * Only render this when HMSPrebuilt is available (not in Expo Go).
 */
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useRef } from 'react';
import { Platform } from 'react-native';

// Short join notification sound (Mixkit - free to use)
const JOIN_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869-pop-up-notification-alert-2869.mp3';

let soundRef: { unloadAsync: () => Promise<void> } | null = null;

async function playJoinSound(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    // Haptic feedback for tactile cue
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not be available on all devices
    }

    // Unload previous sound if still loading/playing
    if (soundRef) {
      try {
        await soundRef.unloadAsync();
      } catch {
        // Ignore unload errors
      }
      soundRef = null;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: JOIN_SOUND_URL },
      { shouldPlay: true, volume: 0.7 }
    );
    soundRef = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinishAndNotReset) {
        sound.unloadAsync().catch(() => {});
        if (soundRef === sound) soundRef = null;
      }
    });
  } catch (error) {
    console.debug('[MeetingJoinSound] Could not play join sound:', error);
  }
}

interface MeetingJoinSoundProps {
  enabled: boolean;
  onPeerJoined?: (peerName: string) => void;
}

/**
 * Renders nothing - this component only sets up the peer join listener.
 * Must be used when in a meeting (HMSPrebuilt is rendered).
 * Only mount when HMS is available (not Expo Go).
 */
export function MeetingJoinSound({ enabled, onPeerJoined }: MeetingJoinSoundProps): null {
  const hasPlayedForSessionRef = useRef<Set<string>>(new Set());

  const handlePeerUpdate = useCallback(
    (data: { peer: { peerID?: string; name?: string }; type: string }) => {
      if (!enabled) return;
      // PEER_JOINED = someone else joined (not our own join)
      if (data.type === 'PEER_JOINED') {
        const peerId = data.peer?.peerID ?? 'unknown';
        // Avoid playing multiple times for same peer in quick succession
        if (!hasPlayedForSessionRef.current.has(peerId)) {
          hasPlayedForSessionRef.current.add(peerId);
          playJoinSound();
          onPeerJoined?.(data.peer?.name || 'Someone');
          // Clear after 2s to allow re-join scenarios
          setTimeout(() => {
            hasPlayedForSessionRef.current.delete(peerId);
          }, 2000);
        }
      }
    },
    [enabled, onPeerJoined]
  );

  // useHMSPeerUpdates must be called unconditionally (hooks rule)
  // This component is only rendered when HMSPrebuilt is available, so the HMS SDK is loaded
  const { useHMSPeerUpdates } = require('@100mslive/react-native-hms');
  useHMSPeerUpdates(handlePeerUpdate, [enabled]);

  return null;
}
