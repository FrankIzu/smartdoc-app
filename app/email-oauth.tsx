import { Redirect, useLocalSearchParams } from 'expo-router';
import { emailSyncMarkOAuthCompleted } from './email-sync/_components/emailSyncCache';

/** Cold-start / Android target for grabdocs://email-oauth?result=... */
export default function EmailOAuthDeepLinkScreen() {
  const params = useLocalSearchParams<{ result?: string }>();
  const result = Array.isArray(params.result) ? params.result[0] : params.result;
  if (result === 'success') {
    emailSyncMarkOAuthCompleted();
  }
  const oauth = result === 'success' ? 'success' : result === 'error' ? 'error' : '1';
  return <Redirect href={`/email-sync?oauth=${oauth}`} />;
}
