import { Stack } from 'expo-router';

export default function CreateEnvelopeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="recipients" />
      <Stack.Screen name="assign-fields" />
      <Stack.Screen name="review" />
      <Stack.Screen name="prepare/[templateId]" />
    </Stack>
  );
}
