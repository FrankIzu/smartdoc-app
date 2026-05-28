import { Stack } from 'expo-router';

export default function SignaturesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="create" />
      <Stack.Screen name="fill" />
      <Stack.Screen name="sign/[envelopeId]" />
      <Stack.Screen name="sign/token/[token]" />
    </Stack>
  );
}
