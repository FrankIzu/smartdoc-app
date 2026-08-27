import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy deep link `/email-sync/replies` → inbox. */
export default function EmailSyncRepliesRedirect() {
  const { threadId, workspaceId } = useLocalSearchParams<{ threadId?: string; workspaceId?: string }>();
  const q = new URLSearchParams();
  if (threadId) q.set('threadId', String(threadId));
  if (workspaceId) q.set('workspaceId', String(workspaceId));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return <Redirect href={`/email-sync${suffix}` as any} />;
}
