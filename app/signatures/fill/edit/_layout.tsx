import { Stack } from 'expo-router';

export default function FillEditLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[templateId]" />
    </Stack>
  );
}
