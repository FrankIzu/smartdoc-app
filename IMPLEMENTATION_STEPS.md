# Backend HTTPS Fix - Implementation Steps

## Quick Implementation Guide

### Step 1: Open Your Backend Flask App File

Find your main Flask application file (usually `app.py`, `main.py`, or `__init__.py` in your Flask app).

### Step 2: Add ProxyFix Import

At the top of the file, add:

```python
from werkzeug.middleware.proxy_fix import ProxyFix
```

### Step 3: Apply ProxyFix

Find where you create your Flask app:

```python
app = Flask(__name__)
```

**Add this line RIGHT AFTER it:**

```python
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)  # <-- ADD THIS LINE
```

### Step 4: Add HTTPS Enforcement

Add this code before your route definitions:

```python
# Define platforms that must use HTTPS
MOBILE_PLATFORMS = {"ios", "android"}

@app.before_request
def enforce_https_for_mobile():
    """Enforce HTTPS for mobile platforms"""
    platform = request.headers.get('X-Platform', '').lower()

    if platform in MOBILE_PLATFORMS:
        if not request.is_secure:
            return jsonify({
                "error": "SSL Required",
                "message": f"{platform.capitalize()} requires a secure HTTPS connection"
            }), 403
```

### Step 5: Verify Your Code Structure

Your file should look something like this:

```python
from flask import Flask, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)

# Apply ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)

# HTTPS enforcement
MOBILE_PLATFORMS = {"ios", "android"}

@app.before_request
def enforce_https_for_mobile():
    platform = request.headers.get('X-Platform', '').lower()
    if platform in MOBILE_PLATFORMS:
        if not request.is_secure:
            return jsonify({
                "error": "SSL Required",
                "message": f"{platform.capitalize()} requires a secure HTTPS connection"
            }), 403

# Your existing routes...
@app.route("/api/v1/mobile/health", methods=["GET"])
def mobile_health():
    # ... your existing code
```

### Step 6: Test the Implementation

1. **Restart your backend server**
2. **Run the test script:**
   ```bash
   python test_backend_https.py
   ```
3. **All 5 tests should pass**

### Step 7: Optional - Add Debug Endpoint (Temporary)

To verify ProxyFix is working, temporarily add:

```python
@app.route("/debug/request-info", methods=["GET"])
def debug_request_info():
    return jsonify({
        "scheme": request.scheme,
        "is_secure": request.is_secure,
        "x_forwarded_proto": request.headers.get("X-Forwarded-Proto"),
        "x_platform": request.headers.get("X-Platform"),
    })
```

Visit `http://your-backend/debug/request-info` with `X-Forwarded-Proto: https` header to verify.

### Step 8: Remove Old HTTPS Checks

If you have existing HTTPS checks in individual routes, you can remove them since the `before_request` handler now centralizes this logic.

## Troubleshooting

### If tests still fail:

1. **Check ProxyFix is applied**: Make sure `app.wsgi_app = ProxyFix(...)` is called
2. **Check order**: ProxyFix must be applied before routes are defined
3. **Check before_request**: Make sure the handler is defined before your routes
4. **Check imports**: Ensure `from flask import request, jsonify` is at the top
5. **Restart server**: Make sure you restarted the backend after changes

### Common Issues:

- **"ProxyFix not found"**: Install werkzeug: `pip install werkzeug`
- **Tests still failing**: Check backend logs to see what `request.is_secure` returns
- **Direct HTTPS blocked**: Verify ProxyFix is applied correctly

## Files Reference

- `backend_https_fix_code.py` - Complete code examples
- `test_backend_https.py` - Test script to verify fix
- `BACKEND_HTTPS_IMPLEMENTATION.md` - Detailed implementation guide


