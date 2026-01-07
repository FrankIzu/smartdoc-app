# Backend HTTPS Implementation Guide

## Solution from ChatGPT

Use Flask's `ProxyFix` middleware to properly handle `X-Forwarded-Proto` headers from the proxy/load balancer.

## Step 1: Install Required Package

```bash
pip install werkzeug
```

(ProxyFix is part of Werkzeug, which Flask already uses)

## Step 2: Update Your Flask App

Add this to your Flask application initialization:

```python
from flask import Flask, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)

# Apply ProxyFix to respect X-Forwarded headers from your load balancer
# x_proto=1 tells ProxyFix to trust X-Forwarded-Proto header
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)
```

## Step 3: Add HTTPS Enforcement

Add a `before_request` handler to enforce HTTPS for mobile platforms:

```python
# Define platforms that must use HTTPS
MOBILE_PLATFORMS = {"ios", "android"}

@app.before_request
def enforce_https_for_mobile():
    platform = request.headers.get('X-Platform', '').lower()

    # Only enforce HTTPS for mobile platforms
    if platform in MOBILE_PLATFORMS:
        # request.is_secure will be True if ProxyFix detects HTTPS via X-Forwarded-Proto
        if not request.is_secure:
            return jsonify({
                "error": "SSL Required",
                "message": f"{platform.capitalize()} requires a secure HTTPS connection"
            }), 403
```

## Step 4: Complete Example

Here's how your app initialization should look:

```python
from flask import Flask, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)

# Apply ProxyFix BEFORE any routes are defined
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)

# Define platforms that must use HTTPS
MOBILE_PLATFORMS = {"ios", "android"}

@app.before_request
def enforce_https_for_mobile():
    """Enforce HTTPS for mobile platforms"""
    platform = request.headers.get('X-Platform', '').lower()

    # Only enforce HTTPS for mobile platforms
    if platform in MOBILE_PLATFORMS:
        # request.is_secure will be True if:
        # 1. Direct HTTPS connection, OR
        # 2. Proxy forwarded HTTPS (detected via X-Forwarded-Proto header)
        if not request.is_secure:
            return jsonify({
                "error": "SSL Required",
                "message": f"{platform.capitalize()} requires a secure HTTPS connection"
            }), 403

# Your existing routes...
@app.route("/api/v1/mobile/health", methods=["GET"])
def mobile_health():
    return jsonify({"message": "Mobile API is healthy"})

# ... rest of your routes
```

## Step 5: Optional Debug Endpoint

Add this temporarily to verify ProxyFix is working:

```python
@app.route("/debug/request-info", methods=["GET"])
def debug_request_info():
    """Debug endpoint to check request headers and scheme"""
    return jsonify({
        "scheme": request.scheme,
        "is_secure": request.is_secure,
        "x_forwarded_proto": request.headers.get("X-Forwarded-Proto"),
        "x_platform": request.headers.get("X-Platform"),
        "headers": dict(request.headers)
    })
```

## How It Works

### ProxyFix Middleware

```python
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)
```

- Reads `X-Forwarded-Proto` header from the proxy
- Sets `request.is_secure = True` if header is `https`
- Sets `request.scheme = 'https'` if header is `https`
- Works automatically for all requests

### HTTPS Enforcement

```python
if not request.is_secure:
    return 403
```

- `request.is_secure` will be `True` if:
  - Direct HTTPS connection, OR
  - Proxy forwarded HTTPS (detected via `X-Forwarded-Proto: https`)
- Works for both iOS and Android
- Centralized in `before_request` handler

## Expected Test Results After Implementation

After implementing this solution:

- ✅ **Test 1**: iOS with `X-Forwarded-Proto: https` → **200 OK**
- ✅ **Test 2**: iOS without header → **403 Forbidden**
- ✅ **Test 3**: Android with `X-Forwarded-Proto: https` → **200 OK**
- ✅ **Test 3b**: Android without header → **403 Forbidden**
- ✅ **Test 4**: Direct HTTPS → **200 OK**

## Testing After Implementation

Run the test script:

```bash
python test_backend_https.py
```

All tests should pass.

## Important Notes

1. **ProxyFix must be applied BEFORE routes**: Put `ProxyFix` setup right after `app = Flask(__name__)`

2. **Trust your proxy**: `x_proto=1` means you trust the first `X-Forwarded-Proto` header. Only use this if your proxy/load balancer is trusted.

3. **Gevent compatibility**: Works fine with gevent WSGI server - no changes needed.

4. **SSL termination**: Keep SSL termination at the load balancer (common pattern).

5. **Logging (optional)**: Add logging to debug:

```python
app.logger.info(f"Platform={platform}, is_secure={request.is_secure}, scheme={request.scheme}")
```

## Troubleshooting

If tests still fail:

1. **Check ProxyFix is applied**: Verify `app.wsgi_app = ProxyFix(...)` is called
2. **Check header names**: Ensure proxy sends `X-Forwarded-Proto` (not `X-Forwarded-Protocol`)
3. **Check before_request order**: Make sure HTTPS check runs before other middleware
4. **Test debug endpoint**: Visit `/debug/request-info` to see what Flask sees

## Migration Steps

1. Add `ProxyFix` to your Flask app initialization
2. Add `enforce_https_for_mobile()` before_request handler
3. Remove any existing HTTPS checks in individual routes (now centralized)
4. Test with `test_backend_https.py`
5. Deploy and monitor logs

