import { Alert } from 'react-native';
import { closeMailboxThread, emailApiError } from '../../../services/emailSyncApi';

const CLOSE_MESSAGE =
  'This will permanently close the thread and remove it from your reply queue.\n\nContinue?';

export function confirmCloseMailboxThread(
  threadId: number,
  onClosed: () => void | Promise<void>,
  errorTitle = 'Inbox',
) {
  Alert.alert('Close thread', CLOSE_MESSAGE, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Continue',
      style: 'destructive',
      onPress: () => {
        void (async () => {
          try {
            await closeMailboxThread(threadId);
            await onClosed();
          } catch (e) {
            Alert.alert(errorTitle, emailApiError(e, 'Close failed'));
          }
        })();
      },
    },
  ]);
}
