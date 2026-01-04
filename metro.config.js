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

// Patch Metro's Server._resolveRelativePath to handle absolute paths
// This fixes the issue where expo export:embed passes absolute paths to Metro
const MetroServer = require('metro/src/Server');
if (MetroServer && MetroServer.prototype && MetroServer.prototype._resolveRelativePath) {
  const originalResolveRelativePath = MetroServer.prototype._resolveRelativePath;
  MetroServer.prototype._resolveRelativePath = function(entryPath) {
    // If entry path is absolute and points to index.js in project root, convert to relative
    if (entryPath && typeof entryPath === 'string' && entryPath.startsWith('/')) {
      if (entryPath.endsWith('index.js') && fs.existsSync(entryPath)) {
        const relativePath = path.relative(projectRoot, entryPath);
        // If it's in the project root, use relative path
        if (relativePath === 'index.js' || relativePath === './index.js') {
          entryPath = './index.js';
        }
      }
    }
    return originalResolveRelativePath.call(this, entryPath);
  };
}

// Note: The issue is that expo export:embed passes absolute paths to Metro's _resolveRelativePath
// which expects relative paths. This is a known issue with Expo Router + EAS Build.
// The workaround is to ensure package.json main field is correct (which it is: "./index.js")
// and that Metro's resolver can handle the entry point correctly via the resolveRequest hook above.

// Configure resolver to handle socket.io dependencies and entry point resolution
// This forces Metro to use CommonJS versions instead of ESM
const defaultResolver = config.resolver.resolveRequest;
config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: false, // Disable package exports to use main entry
  // Resolve HMS native modules to empty stubs for web platform
  // Also handle absolute path resolution for entry point
  resolveRequest: (context, moduleName, platform) => {
    // Handle absolute paths - convert to relative if it's the entry point
    if (moduleName && moduleName.startsWith('/') && moduleName.endsWith('index.js')) {
      const relativePath = path.relative(projectRoot, moduleName);
      if (fs.existsSync(moduleName)) {
        // If absolute path exists, try resolving as relative path
        const relativeModuleName = relativePath.startsWith('..') ? './index.js' : relativePath;
        if (defaultResolver) {
          try {
            return defaultResolver(context, relativeModuleName, platform);
          } catch (e) {
            // Fall through to try absolute path resolution
          }
        }
      }
    }
    
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