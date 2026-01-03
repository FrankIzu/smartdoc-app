# CORS Configuration Guide

## Overview

When running the mobile app on **web platform** (via Expo web), the browser enforces CORS (Cross-Origin Resource Sharing) policies. The backend must be configured to allow requests from the web app's origin.

## Current Issue

When running the app on web at `http://localhost:8081`, requests to `https://api.grabdocs.com` are blocked by CORS:

```
Access to XMLHttpRequest at 'https://api.grabdocs.com/api/v1/mobile/health' 
from origin 'http://localhost:8081' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Backend Configuration Required

The backend (manager-francis) needs to be configured to allow CORS from the following origins:

### Development Origins
- `http://localhost:8081` (Expo web dev server)
- `http://localhost:3000` (if using web frontend)
- `http://192.168.1.5:8081` (local network access)

### Production Origins (if deploying web version)
- `https://grabdocs.com` (production web frontend)
- `https://app.grabdocs.com` (if using subdomain)

## Backend CORS Configuration

### Flask (Python) Example

```python
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)

# Configure CORS
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:8081",
            "http://localhost:3000",
            "http://192.168.1.5:8081",
            "https://grabdocs.com",
            "https://app.grabdocs.com"
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Platform"],
        "credentials": True
    }
})
```

### Express.js (Node.js) Example

```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: [
    'http://localhost:8081',
    'http://localhost:3000',
    'http://192.168.1.5:8081',
    'https://grabdocs.com',
    'https://app.grabdocs.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform'],
  credentials: true
}));
```

## Environment-Based Configuration

For better security, use environment variables:

```python
import os
from flask_cors import CORS

# Get allowed origins from environment
ALLOWED_ORIGINS = os.getenv(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:8081,http://localhost:3000'
).split(',')

CORS(app, resources={
    r"/api/*": {
        "origins": ALLOWED_ORIGINS,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Platform"],
        "credentials": True
    }
})
```

## Testing CORS

### Check CORS Headers

Use curl to check if CORS headers are present:

```bash
curl -H "Origin: http://localhost:8081" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://api.grabdocs.com/api/v1/mobile/health \
     -v
```

Expected response headers:
```
Access-Control-Allow-Origin: http://localhost:8081
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Platform
Access-Control-Allow-Credentials: true
```

## Mobile App Configuration

The mobile app automatically detects the platform and uses appropriate API URLs:

- **Web (development)**: `http://localhost:5000` (requires local backend with CORS)
- **Web (production)**: `https://api.grabdocs.com` (requires backend CORS configuration)
- **Native (Expo Go)**: `http://192.168.1.5:5000` (local network, no CORS)
- **Native (Standalone)**: `https://api.grabdocs.com` (no CORS needed)

## Quick Fix for Development

If you need to test on web immediately, you can:

1. **Use local backend**: Set `EXPO_PUBLIC_API_URL=http://localhost:5000` and ensure your local backend allows CORS from `http://localhost:8081`

2. **Use proxy**: Configure a proxy in your Expo web config to forward requests (not recommended for production)

3. **Disable CORS in browser**: Only for development testing (Chrome: `--disable-web-security` flag)

## Important Notes

- CORS is a **browser security feature** - it only affects web platform
- Native mobile apps (iOS/Android) don't have CORS restrictions
- Always configure CORS properly in production - don't use wildcard `*` for origins
- The `X-Platform: mobile` header should be allowed in CORS configuration

## Related Files

- `constants/Config.ts` - API URL configuration
- `services/api.ts` - API service with platform detection
- `utils/storage.ts` - Web-compatible storage (already handles web platform)


