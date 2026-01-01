# GrabDocs Mobile - Environment Setup Guide

## 🔄 **Automatic Environment Detection**

The app now automatically detects and switches between development and production environments based on the `__DEV__` flag:

### **Development Mode** (`__DEV__ = true`)
- **API URL**: `http://192.168.1.7:5000` (local backend)
- **Expo Dev URL**: `http://192.168.1.7:8081`
- **Environment**: `development`

### **Production Mode** (`__DEV__ = false`)
- **API URL**: `https://api.grabdocs.com` (production backend)
- **Expo Dev URL**: `http://localhost:8081` (fallback)
- **Environment**: `production`

## 🛠️ **Manual Override (Optional)**

You can override the automatic detection by setting environment variables:

### **Local Development Override**
Create `.env` file:
```bash
# Override API URL for local development
EXPO_PUBLIC_API_URL=http://localhost:5000

# Override environment
EXPO_PUBLIC_ENVIRONMENT=development

# Override dev server URL
EXPO_PUBLIC_DEV_URL=http://localhost:8081
```

### **Production Override**
Create `.env.production` file:
```bash
# Override API URL for production
EXPO_PUBLIC_API_URL=https://api.grabdocs.com

# Override environment
EXPO_PUBLIC_ENVIRONMENT=production
```

## 🚀 **Build Profiles**

### **Development Build**
```bash
# Uses development settings automatically
expo start
# or
eas build --profile development
```

### **Preview/Staging Build**
```bash
# Uses staging settings
eas build --profile preview
```

### **Production Build**
```bash
# Uses production settings automatically
eas build --profile production
```

## 📱 **Environment Detection Logic**

```typescript
// API URL Detection
export const API_BASE_URL = (() => {
  // 1. Check explicit environment variable
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // 2. Auto-detect based on development mode
  if (__DEV__) {
    return 'http://192.168.1.7:5000'; // Local development
  }
  
  // 3. Production fallback
  return 'https://api.grabdocs.com'; // Production
})();

// Environment Detection
export const ENVIRONMENT = process.env.EXPO_PUBLIC_ENVIRONMENT || (__DEV__ ? 'development' : 'production');
```

## 🔧 **EAS Build Configuration**

The EAS build profiles are configured to set the appropriate environment:

```json
{
  "development": {
    "env": { "EXPO_PUBLIC_ENVIRONMENT": "development" }
  },
  "preview": {
    "env": { "EXPO_PUBLIC_ENVIRONMENT": "staging" }
  },
  "production": {
    "env": { "EXPO_PUBLIC_ENVIRONMENT": "production" }
  }
}
```

## ✅ **Benefits of This Setup**

1. **Zero Configuration**: Works out of the box for both dev and production
2. **Flexible Override**: Can still override with environment variables when needed
3. **Build Profile Aware**: Different settings for different build profiles
4. **Safe Fallbacks**: Always falls back to safe defaults
5. **Development Friendly**: Easy local development with automatic detection

## 🧪 **Testing Environment Detection**

### **Check Current Environment**
Add this to any component to verify the environment:
```typescript
import { API_BASE_URL, ENVIRONMENT } from '@/constants/Config';

console.log('Current Environment:', ENVIRONMENT);
console.log('API Base URL:', API_BASE_URL);
console.log('Is Development:', __DEV__);
```

### **Environment-Specific Code**
```typescript
if (__DEV__) {
  // Development-only code
  console.log('Running in development mode');
} else {
  // Production-only code
  // Analytics, crash reporting, etc.
}
```

## 🚨 **Important Notes**

1. **Local Development**: Make sure your local backend is running on `http://192.168.1.7:5000`
2. **Production**: Ensure `api.grabdocs.com` is accessible and properly configured
3. **Environment Variables**: Only use `EXPO_PUBLIC_` prefixed variables for client-side access
4. **Build Profiles**: Use appropriate build profiles for different deployment targets

## 🔄 **Migration from Previous Setup**

If you were previously using hardcoded URLs:

1. **Remove hardcoded URLs** from your code
2. **Use the new environment detection** system
3. **Test both development and production** modes
4. **Update any custom environment overrides** if needed

The new system is backward compatible and will work with your existing setup while providing better flexibility.


