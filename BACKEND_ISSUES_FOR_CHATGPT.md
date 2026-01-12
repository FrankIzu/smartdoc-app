# Backend HTTPS Enforcement Issues - For ChatGPT

## Problem Summary

The backend is not correctly detecting HTTPS requests when they come through a proxy/load balancer that forwards HTTP. Additionally, Android HTTPS enforcement is missing.

## Test Results

### ✅ Working Tests
- **Test 2**: iOS without X-Forwarded-Proto → Correctly blocked (403) ✅
- **Test 3**: Android with X-Forwarded-Proto → Accepted (200) ✅

### ❌ Failing Tests

1. **Test 1: iOS with X-Forwarded-Proto header**
   - **Status**: 403 Forbidden
   - **Error**: `{"error":"SSL Required","message":"iOS requires a secure HTTPS connection"}`
   - **Issue**: Backend is NOT checking the `X-Forwarded-Proto: https` header
   - **Expected**: Should return 200 (request should be accepted)

2. **Test 3b: Android without X-Forwarded-Proto header**
   - **Status**: 200 OK
   - **Issue**: Android requests without HTTPS are being accepted
   - **Expected**: Should return 403 (HTTPS should be enforced for Android too)

3. **Test 4: Direct HTTPS connection**
   - **Status**: 403 Forbidden
   - **Issue**: Even direct HTTPS connections are being blocked
   - **Expected**: Should return 200 (direct HTTPS should work)

## Current Backend Behavior

Based on test results, the backend code likely looks like this:

```python
# Current (problematic) code
platform = request.headers.get('X-Platform', '').lower()

# Only checks request.scheme, ignores X-Forwarded-Proto header
if platform == 'ios' and request.scheme == 'http':
    return {"error": "SSL Required", "message": "iOS requires a secure HTTPS connection"}, 403

# Android is not checked at all - that's why Test 3b fails
```

## Required Fixes

### Fix 1: Check X-Forwarded-Proto Header for iOS

The backend needs to check the `X-Forwarded-Proto` header when `request.scheme == 'http'` to detect if the original request was HTTPS.

**Required Implementation:**

```python
def is_https_request(request):
    """Check if the original request was HTTPS"""
    # Direct HTTPS connection
    if request.is_secure or request.scheme == 'https':
        return True
    
    # Check X-Forwarded-Proto header (set by proxy/load balancer)
    forwarded_proto = request.headers.get('X-Forwarded-Proto', '').lower()
    if forwarded_proto == 'https':
        return True
    
    # Check X-Forwarded-Scheme header (alternative)
    forwarded_scheme = request.headers.get('X-Forwarded-Scheme', '').lower()
    if forwarded_scheme == 'https':
        return True
    
    return False

# Updated check for iOS
platform = request.headers.get('X-Platform', '').lower()

if platform == 'ios' and not is_https_request(request):
    return {"error": "SSL Required", "message": "iOS requires a secure HTTPS connection"}, 403
```

### Fix 2: Enforce HTTPS for Android

Android requests should also be checked for HTTPS.

**Required Implementation:**

```python
# Enforce HTTPS for both iOS and Android
if platform in ['ios', 'android'] and not is_https_request(request):
    return {
        "error": "SSL Required", 
        "message": f"{platform.upper()} requires a secure HTTPS connection"
    }, 403
```

### Fix 3: Direct HTTPS Connection Issue

Test 4 shows that even direct HTTPS connections are being blocked. This suggests:
- The backend might be checking `request.scheme` incorrectly
- Or there's middleware/proxy configuration interfering
- Or `request.is_secure` is not working as expected

**Investigation needed:**
- Check if `request.is_secure` returns `True` for direct HTTPS
- Check if there's any middleware that modifies the request
- Verify Flask/WSGI server configuration

## Complete Fixed Code Example

```python
from flask import request

def is_https_request():
    """Check if the original request was HTTPS"""
    # Direct HTTPS connection
    if request.is_secure:
        return True
    
    # Check request.scheme (some WSGI servers set this)
    if request.scheme == 'https':
        return True
    
    # Check X-Forwarded-Proto header (set by proxy/load balancer)
    forwarded_proto = request.headers.get('X-Forwarded-Proto', '').lower()
    if forwarded_proto == 'https':
        return True
    
    # Check X-Forwarded-Scheme header (alternative)
    forwarded_scheme = request.headers.get('X-Forwarded-Scheme', '').lower()
    if forwarded_scheme == 'https':
        return True
    
    return False

# In your route handler or middleware
@mobile_routes.before_request
def check_https():
    platform = request.headers.get('X-Platform', '').lower()
    
    # Enforce HTTPS for both iOS and Android
    if platform in ['ios', 'android']:
        if not is_https_request():
            return jsonify({
                "error": "SSL Required",
                "message": f"{platform.upper()} requires a secure HTTPS connection"
            }), 403
```

## Test Request Details

The test script sends these headers:

**Test 1 (Should PASS but currently FAILS):**
```
GET /api/v1/mobile/health HTTP/1.1
Host: api.grabdocs.com
X-Platform: ios
X-Forwarded-Proto: https
X-Forwarded-Scheme: https
User-Agent: GrabDocs/4 CFNetwork/3826.600.41 Darwin/24.6.0
```

**Test 3b (Should FAIL but currently PASSES):**
```
GET /api/v1/mobile/health HTTP/1.1
Host: api.grabdocs.com
X-Platform: android
User-Agent: okhttp/4.12.0
```

## Additional Notes

1. **Proxy Configuration**: The backend is behind a proxy/load balancer that forwards HTTPS requests as HTTP. The proxy should be setting `X-Forwarded-Proto: https` header, but the backend needs to check it.

2. **Flask ProxyFix**: If using Flask, you may need to configure `ProxyFix` middleware:
   ```python
   from werkzeug.middleware.proxy_fix import ProxyFix
   app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_for=1)
   ```

3. **Gevent/WSGI**: If using gevent or another WSGI server, ensure it's configured to trust proxy headers.

## Expected Test Results After Fix

- ✅ Test 1: iOS with X-Forwarded-Proto → 200 OK
- ✅ Test 2: iOS without X-Forwarded-Proto → 403 Forbidden
- ✅ Test 3: Android with X-Forwarded-Proto → 200 OK
- ✅ Test 3b: Android without X-Forwarded-Proto → 403 Forbidden
- ✅ Test 4: Direct HTTPS → 200 OK

## Questions for ChatGPT

1. How to properly detect HTTPS in Flask when behind a proxy that forwards HTTP?
2. How to check `X-Forwarded-Proto` header in Flask request handlers?
3. Why might `request.is_secure` return `False` for direct HTTPS connections?
4. How to configure Flask/gevent to properly handle proxy headers?
5. Best practice for enforcing HTTPS for mobile API endpoints in Flask?


