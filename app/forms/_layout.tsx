import { Stack } from 'expo-router';

export default function FormsLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="create" 
        options={{ 
          title: 'Create Form',
          headerShown: false // We handle our own header in the screen
        }} 
      />
      <Stack.Screen 
        name="builder" 
        options={{ 
          title: 'Form Builder',
          headerShown: false // We handle our own header in the screen
        }} 
      />
    </Stack>
  );
} 