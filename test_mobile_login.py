import requests
import json

def test_login():
    url = 'http://localhost:5000/api/login'
    data = {'username': 'francis', 'password': 'password123'}
    
    try:
        response = requests.post(url, json=data)
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.json()
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    test_login() 