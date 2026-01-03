const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Configure resolver to handle socket.io dependencies
// This forces Metro to use CommonJS versions instead of ESM
const defaultResolver = config.resolver.resolveRequest;
config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: false, // Disable package exports to use main entry
  // Resolve HMS native modules to empty stubs for web platform
  resolveRequest: (context, moduleName, platform) => {
    // For web platform, stub HMS native modules
    if (platform === 'web') {
      if (
        moduleName === '@100mslive/react-native-hms' ||
        moduleName === '@100mslive/react-native-room-kit'
      ) {
        // Return empty module stub for web
        return {
          type: 'empty',
        };
      }
    }
    // Use default resolution for other modules
    if (defaultResolver) {
      return defaultResolver(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
  // Configure blockList to exclude directories from watching
  // This reduces the number of files Metro needs to watch
  blockList: [
    // Exclude large directories that don't need to be watched
    /.*\/node_modules\/.*\/node_modules\/.*/,
    /.*\/\.git\/.*/,
    /.*\/dist\/.*/,
    /.*\/build\/.*/,
    /.*\/\.expo\/.*/,
    /.*\/android\/build\/.*/,
    /.*\/ios\/build\/.*/,
    /.*\/data\/.*/,
    /.*\/_project_cleanup\/.*/,
    /.*\/_temp_disabled\/.*/,
    /.*\/venv\/.*/,
    /.*\/manager-francis\/.*/,
  ],
};

// Note: For Windows file watching issues, you may also need to:
// 1. Clear Metro cache: npx expo start --clear
// 2. Increase Windows file watcher limit (requires admin):
//    reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\kernel" /v Dword /t REG_DWORD /d 0x00000400 /f

module.exports = config; 