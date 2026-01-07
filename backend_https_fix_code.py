"""
Backend HTTPS Fix - Ready to Copy Code
========================================
Copy the relevant parts into your Flask backend application.
"""

# ============================================================================
# STEP 1: Add this import at the top of your Flask app file
# ============================================================================
from werkzeug.middleware.proxy_fix import ProxyFix


# ============================================================================
# STEP 2: Add ProxyFix right after creating your Flask app
# ============================================================================
# Find this line in your backend:
#   app = Flask(__name__)
#
# Add this RIGHT AFTER it:
#   app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)

# Example:
"""
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)

# Apply ProxyFix to respect X-Forwarded headers from your load balancer
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)
"""


# ============================================================================
# STEP 3: Add HTTPS enforcement before_request handler
# ============================================================================
# Add this before_request handler to enforce HTTPS for mobile platforms
# Place it after ProxyFix but before your route definitions

"""
from flask import request, jsonify

# Define platforms that must use HTTPS
MOBILE_PLATFORMS = {"ios", "android"}

@app.before_request
def enforce_https_for_mobile():
    \"\"\"Enforce HTTPS for mobile platforms (iOS and Android)\"\"\"
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
"""


# ============================================================================
# COMPLETE EXAMPLE: How your app initialization should look
# ============================================================================
"""
from flask import Flask, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)

# STEP 1: Apply ProxyFix BEFORE any routes are defined
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)

# STEP 2: Define platforms that must use HTTPS
MOBILE_PLATFORMS = {"ios", "android"}

# STEP 3: Add HTTPS enforcement
@app.before_request
def enforce_https_for_mobile():
    \"\"\"Enforce HTTPS for mobile platforms\"\"\"
    platform = request.headers.get('X-Platform', '').lower()

    if platform in MOBILE_PLATFORMS:
        if not request.is_secure:
            return jsonify({
                "error": "SSL Required",
                "message": f"{platform.capitalize()} requires a secure HTTPS connection"
            }), 403

# Your existing routes continue here...
# @app.route("/api/v1/mobile/health", methods=["GET"])
# def mobile_health():
#     ...
"""


# ============================================================================
# OPTIONAL: Debug endpoint to verify ProxyFix is working
# ============================================================================
# Add this temporarily to check if ProxyFix is detecting headers correctly

"""
@app.route("/debug/request-info", methods=["GET"])
def debug_request_info():
    \"\"\"Debug endpoint to check request headers and scheme\"\"\"
    return jsonify({
        "scheme": request.scheme,
        "is_secure": request.is_secure,
        "x_forwarded_proto": request.headers.get("X-Forwarded-Proto"),
        "x_platform": request.headers.get("X-Platform"),
        "x_forwarded_scheme": request.headers.get("X-Forwarded-Scheme"),
    })
"""


# ============================================================================
# OPTIONAL: Add logging to debug HTTPS enforcement
# ============================================================================
"""
@app.before_request
def enforce_https_for_mobile():
    platform = request.headers.get('X-Platform', '').lower()

    if platform in MOBILE_PLATFORMS:
        # Optional: Log for debugging
        app.logger.info(
            f"HTTPS Check - Platform: {platform}, "
            f"is_secure: {request.is_secure}, "
            f"scheme: {request.scheme}, "
            f"X-Forwarded-Proto: {request.headers.get('X-Forwarded-Proto')}"
        )
        
        if not request.is_secure:
            return jsonify({
                "error": "SSL Required",
                "message": f"{platform.capitalize()} requires a secure HTTPS connection"
            }), 403
"""


# ============================================================================
# IMPORTANT NOTES
# ============================================================================
"""
1. ProxyFix MUST be applied before routes are defined
2. The before_request handler runs for ALL requests, but only enforces HTTPS for mobile platforms
3. x_proto=1 means you trust the first X-Forwarded-Proto header (safe if behind trusted proxy)
4. After implementing, test with: python test_backend_https.py
5. Remove debug endpoint before production deployment
"""

