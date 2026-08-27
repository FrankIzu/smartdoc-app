import { Stack } from 'expo-router';

export default function EmailSyncLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="mailbox" />
      <Stack.Screen name="replies" />
      <Stack.Screen name="thread/[id]" />
      <Stack.Screen name="alias/[id]" />
      <Stack.Screen name="imports" />
    </Stack>
  );
}
