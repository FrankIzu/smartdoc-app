#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script for backend HTTPS detection fix
Run this to verify the backend correctly detects HTTPS via X-Forwarded-Proto header
"""

import requests
import sys
import os

# Fix encoding for Windows
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'

# Change this to your backend URL
# For local testing (uncomment and set your local backend URL):
# BASE_URL = "http://localhost:5000"  # Local backend
# BASE_URL = "http://192.168.1.3:5000"  # Local network IP

# For production testing:
BASE_URL = "http://api.grabdocs.com"  # Use HTTP to simulate proxy forwarding
# BASE_URL = "https://api.grabdocs.com"  # Or use HTTPS for direct connection

def test_ios_with_forwarded_proto():
    """Test iOS request with X-Forwarded-Proto header - should PASS"""
    print("\n[TEST 1] iOS with X-Forwarded-Proto header")
    print("=" * 60)
    
    headers = {
        "X-Platform": "ios",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Scheme": "https",
        "User-Agent": "GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/mobile/health", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 200:
            print("[PASS] Request accepted (HTTPS detected via header)")
            return True
        elif response.status_code == 403:
            print("[FAIL] Request blocked (backend not checking X-Forwarded-Proto)")
            print("   -> Backend needs to check X-Forwarded-Proto header!")
            return False
        else:
            print(f"[WARN] Unexpected status code: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] {e}")
        return False

def test_ios_without_forwarded_proto():
    """Test iOS request without X-Forwarded-Proto header - should FAIL"""
    print("\n[TEST 2] iOS without X-Forwarded-Proto header")
    print("=" * 60)
    
    headers = {
        "X-Platform": "ios",
        "User-Agent": "GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/mobile/health", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 403:
            print("[PASS] Request correctly blocked (no HTTPS detected)")
            return True
        elif response.status_code == 200:
            # Check if backend is in development mode (which allows HTTP)
            if "localhost" in BASE_URL or "127.0.0.1" in BASE_URL:
                print("[INFO] Request accepted - Backend is in development mode (HTTP allowed)")
                print("   -> This is expected in development. Test in production to verify HTTPS enforcement.")
                return True  # Accept in development mode
            else:
                print("[FAIL] Request accepted (security check not working!)")
                print("   -> Backend should block HTTP requests from iOS!")
                return False
        else:
            print(f"[WARN] Unexpected status code: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] {e}")
        return False

def test_android_request():
    """Test Android request - should PASS with X-Forwarded-Proto (HTTPS enforced)"""
    print("\n[TEST 3] Android request with X-Forwarded-Proto")
    print("=" * 60)
    
    headers = {
        "X-Platform": "android",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Scheme": "https",
        "User-Agent": "okhttp/4.12.0"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/mobile/health", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 200:
            print("[PASS] Android request accepted (HTTPS detected via header)")
            return True
        elif response.status_code == 403:
            print("[FAIL] Android request blocked (backend not checking X-Forwarded-Proto for Android)")
            return False
        else:
            print(f"[WARN] Unexpected status code: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] {e}")
        return False

def test_android_without_forwarded_proto():
    """Test Android request without X-Forwarded-Proto - should FAIL (HTTPS enforced)"""
    print("\n[TEST 3b] Android without X-Forwarded-Proto header")
    print("=" * 60)
    
    headers = {
        "X-Platform": "android",
        "User-Agent": "okhttp/4.12.0"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/mobile/health", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 403:
            print("[PASS] Android request correctly blocked (no HTTPS detected)")
            return True
        elif response.status_code == 200:
            # Check if backend is in development mode (which allows HTTP)
            if "localhost" in BASE_URL or "127.0.0.1" in BASE_URL:
                print("[INFO] Request accepted - Backend is in development mode (HTTP allowed)")
                print("   -> This is expected in development. Test in production to verify HTTPS enforcement.")
                return True  # Accept in development mode
            else:
                print("[FAIL] Android request accepted (HTTPS not enforced for Android!)")
                return False
        else:
            print(f"[WARN] Unexpected status code: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] {e}")
        return False

def test_direct_https():
    """Test direct HTTPS connection - should PASS"""
    print("\n[TEST 4] Direct HTTPS connection")
    print("=" * 60)
    
    headers = {
        "X-Platform": "ios",
        "User-Agent": "GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0"
    }
    
    try:
        # Use HTTPS directly (bypass proxy)
        https_url = BASE_URL.replace("http://", "https://")
        response = requests.get(f"{https_url}/api/v1/mobile/health", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 200:
            print("[PASS] Direct HTTPS connection works")
            return True
        else:
            print(f"[WARN] Unexpected status code: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] {e}")
        return False

def main():
    print("Backend HTTPS Detection Fix - Test Suite")
    print("=" * 60)
    print(f"Testing against: {BASE_URL}")
    print("=" * 60)
    print("\nNote: Make sure your backend is running before running tests!")
    print("      Update BASE_URL in the script to test against localhost or production.\n")
    
    results = []
    
    # Run tests
    results.append(("iOS with X-Forwarded-Proto", test_ios_with_forwarded_proto()))
    results.append(("iOS without X-Forwarded-Proto", test_ios_without_forwarded_proto()))
    results.append(("Android with X-Forwarded-Proto", test_android_request()))
    results.append(("Android without X-Forwarded-Proto", test_android_without_forwarded_proto()))
    results.append(("Direct HTTPS", test_direct_https()))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    all_passed = True
    for test_name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False
    
    print("=" * 60)
    if all_passed:
        print("SUCCESS: All tests passed! Backend fix is working correctly.")
        print("\nNext steps:")
        print("   1. Deploy backend fix to production")
        print("   2. Test with actual iOS app")
        print("   3. Monitor logs for any issues")
        return 0
    else:
        print("WARNING: Some tests failed. Review the results above.")
        print("\nAction required:")
        print("   - Backend needs to check X-Forwarded-Proto header")
        print("   - See BACKEND_HTTPS_FIX.md for implementation details")
        return 1

if __name__ == "__main__":
    sys.exit(main())

