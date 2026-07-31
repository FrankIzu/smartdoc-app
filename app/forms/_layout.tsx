import { Stack } from 'expo-router';
import FormErrorBoundary from '../../components/FormErrorBoundary';

export default function FormsLayout() {
  return (
    <FormErrorBoundary>
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
    </FormErrorBoundary>
  );
}
