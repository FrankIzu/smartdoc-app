import { Redirect } from 'expo-router';

/**
 * Deep-link target when Google Calendar OAuth finishes on mobile (grabdocs://calendar-oauth?...).
 * The OAuth session is normally completed by expo-web-browser openAuthSessionAsync; this route
 * handles cold-start / universal-link edge cases and returns the user to in-app calendar.
 */
export default function CalendarOAuthDeepLinkScreen() {
  return <Redirect href="/calendar" />;
}
