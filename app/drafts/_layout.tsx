import { Stack } from 'expo-router';

export default function DraftsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Drafts', headerShown: false }} />
      <Stack.Screen name="edit/[id]" options={{ presentation: 'card', headerShown: false }} />
    </Stack>
  );
}
