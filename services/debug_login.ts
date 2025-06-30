// Debug script to test login response format
export async function debugLogin() {
  const response = await fetch('http://localhost:5000/api/v1/mobile/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Platform': 'mobile',
    },
    body: JSON.stringify({
      username: 'francis',
      password: 'password123',
    }),
  });

  const data = await response.json();
  console.log('Debug login response:', data);
  return data;
} 