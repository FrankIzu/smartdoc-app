import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';
import { isGrabDocsReachJoinUrl, navigateGrabDocsJoinFromUrl } from './grabdocsJoinUrl';

async function canOpen(url: string): Promise<boolean> {
  try {
    return await Linking.canOpenURL(url);
  } catch {
    return false;
  }
}

async function openUrlAttempt(url: string, checkCanOpen: boolean): Promise<boolean> {
  try {
    if (checkCanOpen && !(await canOpen(url))) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

function zoomNativeCandidates(httpsUrl: string): string[] {
  // https://zoom.us/j/123456789?pwd=abc  (also usXXXweb.zoom.us)
  const join = httpsUrl.match(/zoom\.us\/j\/(\d+)/i);
  if (!join?.[1]) return [];
  const confno = join[1];
  const pwd = httpsUrl.match(/[?&]pwd=([^&#]+)/i)?.[1];
  const qs = `action=join&confno=${confno}${pwd ? `&pwd=${pwd}` : ''}`;
  const candidates = [`zoommtg://zoom.us/join?${qs}`, `zoomus://zoom.us/join?${qs}`];
  if (Platform.OS === 'android') {
    candidates.unshift(
      `intent://zoom.us/join?${qs}#Intent;scheme=zoommtg;package=us.zoom.videomeetings;end`
    );
  }
  return candidates;
}

function teamsNativeCandidates(httpsUrl: string): string[] {
  // https://teams.microsoft.com/l/meetup-join/... or teams.live.com/meet/...
  if (!/teams\.(microsoft|live)\.com/i.test(httpsUrl)) return [];
  const withoutScheme = httpsUrl.replace(/^https?:\/\//i, '');
  return [`msteams://${withoutScheme}`, `msteams:${httpsUrl}`];
}

function meetNativeCandidates(httpsUrl: string): string[] {
  // https://meet.google.com/abc-defg-hij
  const code = httpsUrl.match(/meet\.google\.com\/([a-z0-9-]+)/i)?.[1];
  if (!code) return [];
  const path = `meet.google.com/${code}`;
  if (Platform.OS === 'android') {
    return [
      `intent://${path}#Intent;scheme=https;package=com.google.android.apps.meetings;end`,
    ];
  }
  // iOS: Meet URL schemes when the app is installed
  return [`googlemeet://${path}`, `comgooglemeet://${path}`];
}

function webexNativeCandidates(httpsUrl: string): string[] {
  // https://company.webex.com/meet/... or *.webex.com/w/...
  if (!/\.webex\.com\//i.test(httpsUrl)) return [];
  return [httpsUrl.replace(/^https?:\/\//i, 'wbx://')];
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Prefer native meeting apps (Zoom / Teams / Meet / Webex) so Join does not
 * bounce through the browser first. Falls back to the original https URL.
 * GrabDocs Reach links are routed in-app (never the system browser).
 */
export async function openMeetingUrl(rawUrl: string): Promise<void> {
  const url = rawUrl.trim();
  if (!url) return;

  // GrabDocs Reach: stay inside the app (join-meeting → HMS). Opening https
  // would hit the web interstitial ("open in browser / open on phone").
  if (isGrabDocsReachJoinUrl(url)) {
    if (navigateGrabDocsJoinFromUrl(url)) return;
    Alert.alert('Meeting', 'Could not open this GrabDocs meeting link.');
    return;
  }

  if (!isHttpUrl(url)) {
    if (!(await openUrlAttempt(url, false))) {
      Alert.alert('Meeting', 'Could not open this meeting link.');
    }
    return;
  }

  const native: string[] = [
    ...zoomNativeCandidates(url),
    ...teamsNativeCandidates(url),
    ...meetNativeCandidates(url),
    ...webexNativeCandidates(url),
  ];

  const seen = new Set<string>();
  for (const candidate of native) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    // Custom schemes: check canOpenURL first (needs LSApplicationQueriesSchemes on iOS).
    // Android intent: URLs are opened without canOpen (canOpen is unreliable for intents).
    const check = !candidate.startsWith('intent:');
    if (await openUrlAttempt(candidate, check)) return;
  }

  if (await openUrlAttempt(url, false)) return;

  Alert.alert('Meeting', 'Could not open this meeting link.');
}
