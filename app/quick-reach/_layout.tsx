import { Stack } from 'expo-router';

export default function QuickReachLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="meeting-call" />
      <Stack.Screen 
        name="meeting-details" 
        options={{ 
          presentation: 'card',
          headerShown: false 
        }} 
      />
      <Stack.Screen name="create-meeting" />
      <Stack.Screen name="schedule-meeting" />
      <Stack.Screen name="hms-meeting-interface" />
    </Stack>
  );
}
