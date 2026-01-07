# Development Workflow for HMS Testing

## Why Rebuilds Are Necessary

Native modules like `@100mslive/react-native-hms` require full rebuilds because:
- They contain native code (Java/Kotlin for Android, Swift/Objective-C for iOS)
- Native code must be compiled into the app binary
- Fast Refresh only works for JavaScript changes

## Minimizing Rebuilds

### 1. Use Fast Refresh for JavaScript-Only Changes

**What triggers Fast Refresh (no rebuild needed):**
- Changes to component logic
- Changes to styling
- Changes to state management
- Changes to API calls
- Changes to error handling

**What requires a rebuild:**
- Changes to native module imports
- Changes to `app.json` or native config
- Adding/removing native dependencies
- Changes to native code

### 2. Development Strategy

#### Option A: Test HMS Separately
1. Develop and test non-HMS features with Fast Refresh
2. Only rebuild when specifically testing HMS functionality
3. Use the development mode fallback UI for most testing

#### Option B: Use Conditional HMS Loading
The current implementation already handles this - HMS only loads in development builds, not Expo Go.

### 3. Faster Rebuild Commands

**For iOS:**
```bash
# Faster rebuild (incremental)
npx expo run:ios --device

# Or if using simulator
npx expo run:ios
```

**For Android:**
```bash
# Faster rebuild (incremental)
npx expo run:android

# Or use the dev script
npm run android:dev
```

### 4. Use Development Builds Efficiently

1. **Keep one development build running** - Don't close the app between tests
2. **Use Metro bundler reload** - Press `R` in Metro terminal for JS-only changes
3. **Test HMS last** - Do all non-HMS testing first, then test HMS in one session

### 5. Debug Without Rebuilding

For testing HMS integration without rebuilding:
- Check console logs for token generation
- Verify API responses in network tab
- Test error handling paths
- Use the development mode UI to verify data flow

### 6. Optimize Your Testing Flow

```bash
# 1. Start Metro once (keep it running)
npx expo start

# 2. Build once per session
npx expo run:ios  # or run:android

# 3. For JS-only changes, just reload in app
# - Shake device > Reload
# - Or press 'R' in Metro terminal

# 4. Only rebuild when:
# - Testing HMS specifically
# - Changed native config
# - Added new native dependencies
```

## Quick Testing Checklist

Before rebuilding for HMS testing:
- [ ] All non-HMS features work (test with Fast Refresh)
- [ ] Backend HMS endpoints are working
- [ ] HMS credentials are configured
- [ ] Ready to test HMS specifically

## Tips

1. **Use console.log liberally** - You can see logs without rebuilding
2. **Test error paths first** - These don't require HMS to be working
3. **Mock HMS responses** - Test UI without actual HMS connection
4. **Use development mode UI** - Verify data flow before testing HMS

## When You MUST Rebuild

- First time setting up HMS
- Changed HMS package version
- Changed native configuration
- Testing HMS for the first time in a session

## When You DON'T Need to Rebuild

- Changing component UI/styling
- Fixing JavaScript logic
- Updating API calls
- Changing error messages
- Adjusting state management
- Testing non-HMS features

