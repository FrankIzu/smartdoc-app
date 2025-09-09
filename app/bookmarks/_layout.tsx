import { Stack } from 'expo-router';

export default function BookmarksLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="manage" 
        options={{ 
          title: 'Manage Bookmarks',
          headerShown: false // We handle our own header in the screen
        }} 
      />
    </Stack>
  );
}
