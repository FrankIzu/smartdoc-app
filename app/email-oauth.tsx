import { Redirect } from 'expo-router';

/** Cold-start target for grabdocs://email-oauth?... */
export default function EmailOAuthDeepLinkScreen() {
  return <Redirect href="/email-sync" />;
}
