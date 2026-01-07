# Backend HTTPS Detection Issues - Need Solution

## Problem

My Flask backend is blocking iOS mobile app requests even though they're sent as HTTPS. The app sends requests through a proxy/load balancer that forwards them as HTTP to the backend, but includes the `X-Forwarded-Proto: https` header. The backend is not checking this header.

## Current Situation

**Test Results:**
- ❌ iOS request with `X-Forwarded-Proto: https` header → Returns 403 (should be 200)
- ✅ iOS request without header → Returns 403 (correctly blocked)
- ❌ Android request without HTTPS → Returns 200 (should be 403 - needs enforcement)
- ❌ Direct HTTPS connection → Returns 403 (unexpected)

## Current Backend Code (Likely)

```python
# Current problematic code
platform = request.headers.get('X-Platform', '').lower()

if platform == 'ios' and request.scheme == 'http':
    return {"error": "SSL Required", "message": "iOS requires a secure HTTPS connection"}, 403
```

**Problem**: This only checks `request.scheme`, which is 'http' when the proxy forwards the request. It doesn't check the `X-Forwarded-Proto: https` header that indicates the original request was HTTPS.

## What I Need

1. **Fix iOS HTTPS Detection**: Backend should check `X-Forwarded-Proto: https` header when `request.scheme == 'http'` to detect original HTTPS requests
2. **Enforce HTTPS for Android**: Android requests should also require HTTPS (currently not enforced)
3. **Fix Direct HTTPS**: Direct HTTPS connections should work (currently blocked)

## Request Headers Being Sent

**iOS request (currently failing):**
```
X-Platform: ios
X-Forwarded-Proto: https
X-Forwarded-Scheme: https
```

**Android request (should be blocked but isn't):**
```
X-Platform: android
(no X-Forwarded-Proto header)
```

## Environment

- Flask backend
- Behind proxy/load balancer (forwards HTTPS as HTTP)
- Using gevent WSGI server
- Mobile API endpoints at `/api/v1/mobile/*`

## Questions

1. How do I check `X-Forwarded-Proto` header in Flask to detect original HTTPS requests?
2. How do I enforce HTTPS for both iOS and Android platforms?
3. Why might direct HTTPS connections be blocked (Test 4)?
4. Do I need to configure ProxyFix middleware or similar?
5. What's the best way to implement this check - in a before_request handler or in each route?

Please provide a complete working solution with code examples.

