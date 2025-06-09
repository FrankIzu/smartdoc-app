// Debug script to test login response format
export const debugLogin = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        username: 'francis',
        password: 'password123'
      })
    });
    
    const data = await response.json();
    console.log('🔍 Raw fetch response:', data);
    console.log('🔍 Has user?', 'user' in data);
    console.log('🔍 Has success?', 'success' in data);
    console.log('🔍 Success value:', data.success);
    console.log('🔍 User value:', data.user);
    
    return data;
  } catch (error) {
    console.error('Debug login error:', error);
    throw error;
  }
}; 