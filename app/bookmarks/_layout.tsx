import { Stack } from 'expo-router';

export default function BookmarksLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen 
        name="manage" 
        options={{ 
          title: 'Bookmarks',
          headerShown: false // We handle our own header in the screen
        }} 
      />
      <Stack.Screen 
        name="detail" 
        options={{ 
          presentation: 'card',
          headerShown: false 
        }} 
      />
    </Stack>
  );
}
