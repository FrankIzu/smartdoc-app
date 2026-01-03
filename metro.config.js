const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

// Debug: Log the current directory and check for index.js
console.log('=== METRO CONFIG DEBUG ===');
console.log('__dirname:', __dirname);
console.log('process.cwd():', process.cwd());
console.log('index.js exists:', fs.existsSync(path.join(__dirname, 'index.js')));
console.log('package.json main:', require('./package.json').main);
console.log('========================');

// Use the current directory as project root
// EAS Build places the project in /home/expo/workingdir/build/
// and index.js should be there
const projectRoot = __dirname;
const watchFolders = [projectRoot];

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);
config.watchFolders = watchFolders;
config.projectRoot = projectRoot;

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