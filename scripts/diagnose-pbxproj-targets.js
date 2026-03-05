#!/usr/bin/env node
/**
 * Diagnose EAS "Could not find target with id 'undefined'" error.
 * Mimics Expo's getTargetDependencies logic to show exactly what targetId
 * values are being resolved for each dependency.
 *
 * Usage: node scripts/diagnose-pbxproj-targets.js [path-to-ios-dir]
 * Default: ./ios
 */
const fs = require('fs');
const path = require('path');

const iosDir = process.argv[2] || path.join(process.cwd(), 'ios');
const xcodeproj = fs.readdirSync(iosDir).find((f) => f.endsWith('.xcodeproj'));
if (!xcodeproj) {
  console.error('No .xcodeproj found in', iosDir);
  process.exit(1);
}

const pbxPath = path.join(iosDir, xcodeproj, 'project.pbxproj');
if (!fs.existsSync(pbxPath)) {
  console.error('project.pbxproj not found at', pbxPath);
  process.exit(1);
}

// Use xcode package (same as Expo) to parse
let project;
try {
  const xcode = require('xcode');
  project = xcode.project(pbxPath);
  project.parseSync();
} catch (e) {
  console.error('Failed to parse project:', e.message);
  process.exit(1);
}

console.log('=== PBX project parse diagnostic ===');
console.log('File:', pbxPath);
console.log('');

// Get PBXNativeTarget section
const nativeTargets = project.pbxNativeTargetSection();
const nativeEntries = Object.entries(nativeTargets).filter(([k]) => !k.startsWith('_'));

console.log('PBXNativeTarget entries:', nativeEntries.length);
for (const [key, target] of nativeEntries) {
  const name = (target && target.name) ? String(target.name).replace(/^"|"$/g, '') : '?';
  console.log('  -', key, ':', name);
}
console.log('');

// Find main app target (GrabDocs)
const appTarget = nativeEntries.find(([, t]) => t && String(t.name || '').includes('GrabDocs') && !String(t.productType || '').includes('app-extension'));
if (!appTarget) {
  console.error('Could not find main app target (GrabDocs)');
  process.exit(1);
}

const [appKey, appTargetObj] = appTarget;
console.log('Main app target:', appKey, '-', String(appTargetObj.name || '').replace(/^"|"$/g, ''));
console.log('');

// Get dependencies
const deps = appTargetObj.dependencies || [];
console.log('Main target dependencies count:', deps.length);

for (let i = 0; i < deps.length; i++) {
  const ref = typeof deps[i] === 'object' ? deps[i].value : deps[i];
  console.log('');
  console.log('--- Dependency', i + 1, 'ref:', ref, '---');

  const dep = project.getPBXGroupByKeyAndType(ref, 'PBXTargetDependency');
  if (!dep) {
    console.log('  PBXTargetDependency: NOT FOUND');
    continue;
  }

  const depTarget = dep.target;
  const depTargetProxy = dep.targetProxy;

  console.log('  dep.target:', JSON.stringify(depTarget), '(type:', typeof depTarget, ')');
  console.log('  dep.targetProxy:', depTargetProxy);

  let targetId = depTarget;
  if (targetId == null && depTargetProxy) {
    const proxy = project.getPBXGroupByKeyAndType(depTargetProxy, 'PBXContainerItemProxy');
    if (proxy) {
      console.log('  proxy.remoteGlobalIDString:', JSON.stringify(proxy.remoteGlobalIDString), '(type:', typeof proxy.remoteGlobalIDString, ')');
      if (proxy.remoteGlobalIDString) targetId = proxy.remoteGlobalIDString;
    } else {
      console.log('  PBXContainerItemProxy: NOT FOUND for', depTargetProxy);
    }
  }

  console.log('  => resolved targetId:', JSON.stringify(targetId), '(type:', typeof targetId, ')');

  if (targetId === 'undefined' || targetId === undefined) {
    console.log('  *** THIS DEPENDENCY CAUSES THE EAS ERROR ***');
  } else if (targetId) {
    const found = nativeEntries.find(([k]) => k === targetId);
    console.log('  => Native target exists:', !!found, found ? String(found[1].name || '').replace(/^"|"$/g, '') : '');
  }
}

console.log('');
console.log('=== Raw PBXContainerItemProxy section ===');
const pbx = fs.readFileSync(pbxPath, 'utf8');
const proxySection = pbx.match(/\/\* Begin PBXContainerItemProxy section \*\/[\s\S]*?\/\* End PBXContainerItemProxy section \*\//);
if (proxySection) {
  console.log(proxySection[0]);
} else {
  console.log('(not found)');
}

console.log('');
console.log('=== Raw PBXTargetDependency section ===');
const depSection = pbx.match(/\/\* Begin PBXTargetDependency section \*\/[\s\S]*?\/\* End PBXTargetDependency section \*\//);
if (depSection) {
  console.log(depSection[0]);
} else {
  console.log('(not found)');
}

console.log('');
console.log('=== Grep for "undefined" in project.pbxproj ===');
const lines = pbx.split('\n');
lines.forEach((line, i) => {
  if (line.includes('undefined')) {
    console.log((i + 1) + ':', line.trim());
  }
});
if (!lines.some((l) => l.includes('undefined'))) {
  console.log('(no lines contain "undefined")');
}
