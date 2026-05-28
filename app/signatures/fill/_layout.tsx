import { Stack } from 'expo-router';

export default function FillLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pick" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="complete" />
      <Stack.Screen name="submissions/[templateId]" />
      <Stack.Screen name="[token]" />
    </Stack>
  );
}
