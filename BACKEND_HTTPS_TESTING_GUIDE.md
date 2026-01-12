# Backend HTTPS Fix Testing Guide

## Overview

Test the backend fix to ensure it correctly detects HTTPS requests via `X-Forwarded-Proto` header before deploying to production.

## Test Scenarios

### Scenario 1: iOS Request with X-Forwarded-Proto Header (Should PASS)

This simulates what happens when the proxy forwards an HTTPS request as HTTP but includes the header.

### Scenario 2: iOS Request without X-Forwarded-Proto Header (Should FAIL)

This simulates a malicious HTTP request trying to bypass security.

### Scenario 3: Android Request (Should PASS - No Check)

Android requests should work regardless (no HTTPS enforcement).

## Method 1: Using cURL (Quick Test)

### Test 1: iOS with X-Forwarded-Proto (Should Return 200)

```bash
# Simulate iOS request forwarded as HTTP with X-Forwarded-Proto header
curl -X GET "http://api.grabdocs.com/api/v1/mobile/health" \
  -H "X-Platform: ios" \
  -H "X-Forwarded-Proto: https" \
  -H "X-Forwarded-Scheme: https" \
  -H "User-Agent: GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0" \
  -v
```

**Expected Result:** `200 OK` (should pass the HTTPS check)

### Test 2: iOS without X-Forwarded-Proto (Should Return 403)

```bash
# Simulate iOS request without proxy header (should be blocked)
curl -X GET "http://api.grabdocs.com/api/v1/mobile/health" \
  -H "X-Platform: ios" \
  -H "User-Agent: GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0" \
  -v
```

**Expected Result:** `403 Forbidden` with message "SSL CHECK: Enforcing HTTPS for iOS in production"

### Test 3: Android Request (Should Return 200)

```bash
# Android request - should work regardless
curl -X GET "http://api.grabdocs.com/api/v1/mobile/health" \
  -H "X-Platform: android" \
  -H "User-Agent: okhttp/4.12.0" \
  -v
```

**Expected Result:** `200 OK` (Android is not checked)

### Test 4: Direct HTTPS Request (Should Return 200)

```bash
# Direct HTTPS request (bypasses proxy)
curl -X GET "https://api.grabdocs.com/api/v1/mobile/health" \
  -H "X-Platform: ios" \
  -H "User-Agent: GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0" \
  -v
```

**Expected Result:** `200 OK` (direct HTTPS connection)

## Method 2: Python Test Script

Create a test script to automate testing:

```python
#!/usr/bin/env python3
"""
Test script for backend HTTPS detection fix
"""

import requests
import sys

BASE_URL = "http://api.grabdocs.com"  # Use HTTP to simulate proxy forwarding
# BASE_URL = "https://api.grabdocs.com"  # Or use HTTPS for direct connection

def test_ios_with_forwarded_proto():
    """Test iOS request with X-Forwarded-Proto header - should PASS"""
    print("\n🧪 Test 1: iOS with X-Forwarded-Proto header")
    print("=" * 60)
    
    headers = {
        "X-Platform": "ios",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Scheme": "https",
        "User-Agent": "GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/mobile/health", headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 200:
            print("✅ PASS: Request accepted (HTTPS detected via header)")
            return True
        elif response.status_code == 403:
            print("❌ FAIL: Request blocked (backend not checking X-Forwarded-Proto)")
            return False
        else:
            print(f"⚠️  Unexpected status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_ios_without_forwarded_proto():
    """Test iOS request without X-Forwarded-Proto header - should FAIL"""
    print("\n🧪 Test 2: iOS without X-Forwarded-Proto header")
    print("=" * 60)
    
    headers = {
        "X-Platform": "ios",
        "User-Agent": "GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/mobile/health", headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 403:
            print("✅ PASS: Request correctly blocked (no HTTPS detected)")
            return True
        elif response.status_code == 200:
            print("❌ FAIL: Request accepted (security check not working!)")
            return False
        else:
            print(f"⚠️  Unexpected status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_android_request():
    """Test Android request - should PASS (no HTTPS check)"""
    print("\n🧪 Test 3: Android request")
    print("=" * 60)
    
    headers = {
        "X-Platform": "android",
        "User-Agent": "okhttp/4.12.0"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/mobile/health", headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 200:
            print("✅ PASS: Android request accepted (no HTTPS check)")
            return True
        else:
            print(f"⚠️  Unexpected status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_direct_https():
    """Test direct HTTPS connection - should PASS"""
    print("\n🧪 Test 4: Direct HTTPS connection")
    print("=" * 60)
    
    headers = {
        "X-Platform": "ios",
        "User-Agent": "GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0"
    }
    
    try:
        # Use HTTPS directly
        response = requests.get("https://api.grabdocs.com/api/v1/mobile/health", headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 200:
            print("✅ PASS: Direct HTTPS connection works")
            return True
        else:
            print(f"⚠️  Unexpected status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def main():
    print("🚀 Backend HTTPS Detection Fix - Test Suite")
    print("=" * 60)
    print(f"Testing against: {BASE_URL}")
    print("=" * 60)
    
    results = []
    
    # Run tests
    results.append(("iOS with X-Forwarded-Proto", test_ios_with_forwarded_proto()))
    results.append(("iOS without X-Forwarded-Proto", test_ios_without_forwarded_proto()))
    results.append(("Android request", test_android_request()))
    results.append(("Direct HTTPS", test_direct_https()))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Summary")
    print("=" * 60)
    
    all_passed = True
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False
    
    print("=" * 60)
    if all_passed:
        print("🎉 All tests passed! Backend fix is working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. Review the results above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
```

**Usage:**
```bash
# Install requests if needed
pip install requests

# Run the test script
python test_backend_https.py
```

## Method 3: Using Postman/Insomnia

### Collection Setup

1. **Test 1: iOS with X-Forwarded-Proto**
   - Method: `GET`
   - URL: `http://api.grabdocs.com/api/v1/mobile/health`
   - Headers:
     - `X-Platform: ios`
     - `X-Forwarded-Proto: https`
     - `X-Forwarded-Scheme: https`
   - Expected: `200 OK`

2. **Test 2: iOS without X-Forwarded-Proto**
   - Method: `GET`
   - URL: `http://api.grabdocs.com/api/v1/mobile/health`
   - Headers:
     - `X-Platform: ios`
   - Expected: `403 Forbidden`

3. **Test 3: Android**
   - Method: `GET`
   - URL: `http://api.grabdocs.com/api/v1/mobile/health`
   - Headers:
     - `X-Platform: android`
   - Expected: `200 OK`

## Method 4: Unit Tests (Backend Code)

If you have access to the backend code, add unit tests:

```python
import unittest
from flask import Flask
from your_app import app

class TestHTTPSDetection(unittest.TestCase):
    
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
    
    def test_ios_with_forwarded_proto_passes(self):
        """iOS request with X-Forwarded-Proto should pass"""
        response = self.app.get(
            '/api/v1/mobile/health',
            headers={
                'X-Platform': 'ios',
                'X-Forwarded-Proto': 'https'
            },
            base_url='http://localhost'  # Simulate HTTP from proxy
        )
        self.assertEqual(response.status_code, 200)
    
    def test_ios_without_forwarded_proto_fails(self):
        """iOS request without X-Forwarded-Proto should fail"""
        response = self.app.get(
            '/api/v1/mobile/health',
            headers={
                'X-Platform': 'ios'
            },
            base_url='http://localhost'  # Simulate HTTP from proxy
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn('SSL CHECK', response.get_data(as_text=True))
    
    def test_android_passes(self):
        """Android request should pass (no HTTPS check)"""
        response = self.app.get(
            '/api/v1/mobile/health',
            headers={
                'X-Platform': 'android'
            },
            base_url='http://localhost'
        )
        self.assertEqual(response.status_code, 200)
    
    def test_direct_https_passes(self):
        """Direct HTTPS connection should pass"""
        response = self.app.get(
            '/api/v1/mobile/health',
            headers={
                'X-Platform': 'ios'
            },
            base_url='https://localhost'  # Direct HTTPS
        )
        self.assertEqual(response.status_code, 200)

if __name__ == '__main__':
    unittest.main()
```

## What to Look For in Backend Logs

After running tests, check backend logs for:

### ✅ Success Indicators:
- No "🚫 SSL CHECK" error messages for iOS requests with `X-Forwarded-Proto: https`
- `200 OK` responses for iOS requests with the header
- `403` responses for iOS requests without the header

### ❌ Failure Indicators:
- "🚫 SSL CHECK" error for iOS requests with `X-Forwarded-Proto: https` (backend not checking header)
- `200 OK` for iOS requests without the header (security check not working)

## Testing Checklist

Before deploying to production:

- [ ] Test 1: iOS with `X-Forwarded-Proto: https` → Should return `200`
- [ ] Test 2: iOS without `X-Forwarded-Proto` → Should return `403`
- [ ] Test 3: Android request → Should return `200` (no check)
- [ ] Test 4: Direct HTTPS → Should return `200`
- [ ] Verify backend logs show correct behavior
- [ ] Test with actual iOS app after deployment

## Quick Test Command

```bash
# Quick one-liner test
curl -X GET "http://api.grabdocs.com/api/v1/mobile/health" \
  -H "X-Platform: ios" \
  -H "X-Forwarded-Proto: https" \
  -w "\nStatus: %{http_code}\n" \
  -s -o /dev/null
```

Expected output: `Status: 200`

## Troubleshooting

If tests fail:

1. **Check backend code** - Ensure it's checking `X-Forwarded-Proto` header
2. **Check proxy configuration** - Ensure proxy is setting the header
3. **Check Flask ProxyFix** - May need to configure `ProxyFix` middleware
4. **Check request headers** - Verify headers are reaching the backend

## Next Steps

1. Run tests locally/staging
2. Verify all tests pass
3. Deploy to production
4. Test with actual iOS app
5. Monitor logs for any issues


