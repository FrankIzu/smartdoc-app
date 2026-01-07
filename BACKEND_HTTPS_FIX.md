# Backend HTTPS Detection Fix

## Problem

The iOS app is sending HTTPS requests, but a proxy/load balancer is forwarding them as HTTP to the backend. The backend sees HTTP and blocks the requests with "🚫 SSL CHECK: Enforcing HTTPS for iOS in production".

**Why Android works but iOS doesn't:**
- The backend only enforces HTTPS for iOS (when `X-Platform: ios` header is present)
- Android requests (`X-Platform: android`) are allowed through even if HTTP
- iOS requests are blocked if the backend sees HTTP, even though the original request was HTTPS

## Evidence from Logs

- **Working requests**: IPv6 client IP `2601:152:497f:6570:603c:df29:969d:da13` - these go directly to backend
- **Blocked requests**: Internal IPs `10.17.124.196`, `10.16.23.2` - these go through proxy that strips HTTPS
- Backend sees: `Request URL: http://api.grabdocs.com/api/v1/mobile/auth/check-user` (HTTP, not HTTPS)

## Client-Side Fix (Already Done)

The mobile app now:
1. ✅ Always uses HTTPS for production API (`https://api.grabdocs.com`)
2. ✅ Validates and forces HTTPS if HTTP is detected
3. ✅ Sends `X-Forwarded-Proto: https` header with all requests
4. ✅ Sends `X-Forwarded-Scheme: https` header with all requests

## Backend Fix Required

The backend SSL check needs to be updated to check the `X-Forwarded-Proto` header when the request appears to be HTTP.

### Current Backend Code (Likely)

```python
# Current check (probably something like this)
platform = request.headers.get('X-Platform', '').lower()

# This only checks request.scheme, which is 'http' when proxy forwards HTTP
if platform == 'ios' and request.scheme == 'http':
    return "🚫 SSL CHECK: Enforcing HTTPS for iOS in production", 403

# Android is NOT checked, so it works even with HTTP
# That's why Android works but iOS doesn't!
```

### Fixed Backend Code

```python
# Check if request was originally HTTPS (even if proxy forwarded as HTTP)
def is_https_request(request):
    """Check if the original request was HTTPS"""
    # Direct HTTPS connection
    if request.is_secure:
        return True
    
    # Check X-Forwarded-Proto header (set by proxy/load balancer)
    forwarded_proto = request.headers.get('X-Forwarded-Proto', '').lower()
    if forwarded_proto == 'https':
        return True
    
    # Check X-Forwarded-Scheme header (alternative)
    forwarded_scheme = request.headers.get('X-Forwarded-Scheme', '').lower()
    if forwarded_scheme == 'https':
        return True
    
    # Check X-Forwarded-For and other proxy headers
    # Some proxies use different headers
    if request.headers.get('X-Forwarded-Protocol') == 'https':
        return True
    
    return False

# Updated SSL check - checks X-Forwarded-Proto for both iOS and Android
platform = request.headers.get('X-Platform', '').lower()

# Enforce HTTPS for both iOS and Android in production
if platform in ['ios', 'android'] and not is_https_request(request):
    return f"🚫 SSL CHECK: Enforcing HTTPS for {platform.upper()} in production", 403

# Both iOS and Android MUST use HTTPS (or have X-Forwarded-Proto: https header)

### Flask-Specific Example

```python
from flask import request

def is_https_request():
    """Check if the original request was HTTPS"""
    # Direct HTTPS
    if request.is_secure:
        return True
    
    # Proxy headers
    forwarded_proto = request.headers.get('X-Forwarded-Proto', '').lower()
    if forwarded_proto == 'https':
        return True
    
    forwarded_scheme = request.headers.get('X-Forwarded-Scheme', '').lower()
    if forwarded_scheme == 'https':
        return True
    
    return False

# In your route handler
@mobile_routes.route('/api/v1/mobile/health', methods=['GET'])
def mobile_health():
    platform = request.headers.get('X-Platform', '').lower()
    
    # Enforce HTTPS for both iOS and Android
    if platform in ['ios', 'android'] and not is_https_request():
        return jsonify({
            'error': f'SSL CHECK: Enforcing HTTPS for {platform.upper()} in production'
        }), 403
    
    # ... rest of handler
```

### Gevent/WSGI Server Configuration

If using gevent or another WSGI server behind a proxy, you may also need to configure it to trust proxy headers:

```python
# For gevent/Flask
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_for=1)

# Or manually set trusted proxies
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_for=1,      # Trust X-Forwarded-For
    x_proto=1,    # Trust X-Forwarded-Proto
    x_host=1,     # Trust X-Forwarded-Host
    x_port=1,     # Trust X-Forwarded-Port
)
```

## Testing

After deploying the backend fix:

1. Check backend logs - should see requests being accepted
2. Look for `X-Forwarded-Proto: https` in request headers
3. Verify iOS app can connect successfully

## Alternative: Fix Proxy Configuration

If you control the proxy/load balancer, you can configure it to:
1. Forward HTTPS directly to backend (recommended)
2. Always set `X-Forwarded-Proto: https` header when forwarding

## Summary

- ✅ **Client**: Already fixed - sends HTTPS + X-Forwarded-Proto header
- ⚠️ **Backend**: Needs to check X-Forwarded-Proto header to detect original HTTPS
- 🔧 **Infrastructure**: Consider configuring proxy to forward HTTPS or set headers correctly

