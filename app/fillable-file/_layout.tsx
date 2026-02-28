import { Stack } from 'expo-router';

export default function FillableFileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="fill"
        options={{
          presentation: 'card',
          headerShown: false,
        }}
      />
    </Stack>
  );
}
