#!/usr/bin/env node
/**
 * Post-prebuild patch: add GrabDocsBroadcastUpload target to Xcode project.
 * The config plugin creates the extension files but the target doesn't persist.
 * Run this after `npx expo prebuild --platform ios` in workflows.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';
const BUNDLE_ID = 'com.grabdocs.mobile';

function generateUuid() {
  return crypto.randomBytes(12).toString('hex').toUpperCase();
}

function findPbxproj(iosRoot) {
  const entries = fs.readdirSync(iosRoot, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.endsWith('.xcodeproj')) {
      const pbx = path.join(iosRoot, e.name, 'project.pbxproj');
      if (fs.existsSync(pbx)) return pbx;
    }
  }
  return null;
}

/**
 * Remove PBXTargetDependency and PBXContainerItemProxy entries that reference
 * the extension target but the target was never persisted (plugin partial write).
 * This prevents "Cannot read properties of undefined (reading 'UUID')" during build.
 */
function removeOrphanedExtensionDependencies(content) {
  const nativeTargetUuids = new Set();
  const match = content.match(/\/\* Begin PBXNativeTarget section \*\/[\s\S]*?\/\* End PBXNativeTarget section \*\//);
  if (match) {
    const uuids = match[0].matchAll(/([A-F0-9]{24}) \/\* [^*]+ \*\/ = \{\s*isa = PBXNativeTarget/g);
    for (const m of uuids) nativeTargetUuids.add(m[1]);
  }

  const orphanDepUuids = new Set();
  const depRegex = /([A-F0-9]{24}) \/\* PBXTargetDependency \*\/ = \{\s*isa = PBXTargetDependency;\s*target = ([A-F0-9]{24})[^}]*\}/g;
  let m;
  while ((m = depRegex.exec(content)) !== null) {
    const depUuid = m[1];
    const targetUuid = m[2];
    if (!nativeTargetUuids.has(targetUuid)) {
      orphanDepUuids.add(depUuid);
    }
  }

  if (orphanDepUuids.size === 0) return content;

  for (const depUuid of orphanDepUuids) {
    content = content.replace(new RegExp(`\\t\\t${depUuid} /\\* PBXTargetDependency \\*/ = \\{[^}]*\\};?\\n?`, 'g'), '');
    content = content.replace(new RegExp(`,\\s*\\n\\s*${depUuid} /\\* PBXTargetDependency \\*/\\s*\\n`, 'g'), '\n');
    content = content.replace(new RegExp(`\\n\\s*${depUuid} /\\* PBXTargetDependency \\*/,\\s*\\n`, 'g'), '\n');
    content = content.replace(new RegExp(`\\n\\s*${depUuid} /\\* PBXTargetDependency \\*/\\s*\\n`, 'g'), '\n');
  }

  const orphanProxyUuids = new Set();
  const proxyRegex = /([A-F0-9]{24}) \/\* PBXContainerItemProxy \*\/ = \{\s*isa = PBXContainerItemProxy;[^}]*remoteGlobalIDString = ([A-F0-9]{24})[^}]*remoteInfo = [^;]*;[^}]*\}/g;
  while ((m = proxyRegex.exec(content)) !== null) {
    const proxyUuid = m[1];
    const targetUuid = m[2];
    if (!nativeTargetUuids.has(targetUuid)) {
      orphanProxyUuids.add(proxyUuid);
    }
  }
  for (const proxyUuid of orphanProxyUuids) {
    content = content.replace(new RegExp(`\\t\\t${proxyUuid} /\\* PBXContainerItemProxy \\*/ = \\{[^}]*\\};?\\n?`, 'g'), '');
  }

  return content;
}

function patchProject(pbxPath) {
  let content = fs.readFileSync(pbxPath, 'utf8');
  if (content.includes(`${EXTENSION_NAME} */ = {`)) {
    console.log('GrabDocsBroadcastUpload target already present');
    return;
  }

  // Remove orphaned dependencies: plugin may add PBXTargetDependency/PBXContainerItemProxy
  // pointing to a target UUID that was never persisted, causing "Cannot read properties of undefined"
  content = removeOrphanedExtensionDependencies(content);

  const targetUuid = generateUuid();
  const configListUuid = generateUuid();
  const debugConfigUuid = generateUuid();
  const releaseConfigUuid = generateUuid();
  const sourcesPhaseUuid = generateUuid();
  const copyPhaseUuid = generateUuid();
  const frameworksPhaseUuid = generateUuid();
  const resourcesPhaseUuid = generateUuid();
  const productRefUuid = generateUuid();
  const buildFileUuid = generateUuid();
  const groupUuid = generateUuid();

  // Add PBXFileReference for the .appex product
  const fileRefMatch = content.match(/(\/\* Begin PBXFileReference section \*\/)/);
  if (fileRefMatch) {
    const fileRefEntry = `\t\t${productRefUuid} /* ${EXTENSION_NAME}.appex */ = {isa = PBXFileReference; explicitFileType = wrapper.app-extension; includeInIndex = 0; path = ${EXTENSION_NAME}.appex; sourceTree = BUILT_PRODUCTS_DIR; };\n`;
    content = content.replace(fileRefMatch[1], fileRefMatch[1] + '\n' + fileRefEntry);
  }

  // Add PBXBuildFile for the extension
  const buildFileMatch = content.match(/(\/\* Begin PBXBuildFile section \*\/)/);
  if (buildFileMatch) {
    const buildFileEntry = `\t\t${buildFileUuid} /* ${EXTENSION_NAME}.appex in Embed App Extensions */ = {isa = PBXBuildFile; fileRef = ${productRefUuid} /* ${EXTENSION_NAME}.appex */; settings = {ATTRIBUTES = (RemoveHeadersOnCopy); }; };\n`;
    content = content.replace(buildFileMatch[1], buildFileMatch[1] + '\n' + buildFileEntry);
  }

  // Add PBXNativeTarget
  const nativeTargetEntry = `\t\t${targetUuid} /* ${EXTENSION_NAME} */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = ${configListUuid} /* Build configuration list for PBXNativeTarget ${EXTENSION_NAME} */;
			buildPhases = (
				${sourcesPhaseUuid} /* Sources */,
				${frameworksPhaseUuid} /* Frameworks */,
				${resourcesPhaseUuid} /* Resources */
			);
			buildRules = (
			);
			dependencies = (
			);
			name = ${EXTENSION_NAME};
			productName = ${EXTENSION_NAME};
			productReference = ${productRefUuid} /* ${EXTENSION_NAME}.appex */;
			productType = "com.apple.product-type.app-extension";
		};
`;
  const nativeTargetMatch = content.match(/(\/\* End PBXNativeTarget section \*\/)/);
  if (nativeTargetMatch) {
    content = content.replace(nativeTargetMatch[0], nativeTargetEntry + nativeTargetMatch[0]);
  }

  // Add target to PBXProject targets array (find the main target line)
  const projectTargetsMatch = content.match(/(\t\t\t\t[A-F0-9]{24} \/\* GrabDocs \*\/,)/);
  if (projectTargetsMatch) {
    content = content.replace(
      projectTargetsMatch[0],
      projectTargetsMatch[0] + '\n\t\t\t\t' + targetUuid + ' /* ' + EXTENSION_NAME + ' */,'
    );
  }

  // Add our build file to main app's "Embed App Extensions" phase if it exists
  if (content.includes('Embed App Extensions')) {
    content = content.replace(
      /(name = "Embed App Extensions";\s*\n\s*files = )\(\s*\)/,
      `$1(\n\t\t\t\t\t${buildFileUuid} /* ${EXTENSION_NAME}.appex in Embed App Extensions */\n\t\t\t\t)`
    );
  }

  // Add XCBuildConfiguration for Debug and Release
  const buildConfigMatch = content.match(/(\/\* End XCBuildConfiguration section \*\/)/);
  if (buildConfigMatch) {
    const buildConfigs = `
		${debugConfigUuid} /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++17";
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GCC_C_LANGUAGE_STANDARD = gnu11;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_FILE = ${EXTENSION_NAME}/Info.plist;
				INFOPLIST_KEY_CFBundleDisplayName = ${EXTENSION_NAME};
				IPHONEOS_DEPLOYMENT_TARGET = 14.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
					"@executable_path/../../Frameworks"
				);
				MARKETING_VERSION = 1.0;
				MTL_FAST_MATH = YES;
				PRODUCT_BUNDLE_IDENTIFIER = "${BUNDLE_ID}.${EXTENSION_NAME}";
				PRODUCT_NAME = "$(TARGET_NAME)";
				SKIP_INSTALL = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
				CODE_SIGN_ENTITLEMENTS = "${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements";
				DEBUG_INFORMATION_FORMAT = dwarf;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			};
			name = Debug;
		};
		${releaseConfigUuid} /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++17";
				CODE_SIGN_STYLE = Automatic;
				COPY_PHASE_STRIP = NO;
				CURRENT_PROJECT_VERSION = 1;
				DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
				GCC_C_LANGUAGE_STANDARD = gnu11;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_FILE = ${EXTENSION_NAME}/Info.plist;
				INFOPLIST_KEY_CFBundleDisplayName = ${EXTENSION_NAME};
				IPHONEOS_DEPLOYMENT_TARGET = 14.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
					"@executable_path/../../Frameworks"
				);
				MARKETING_VERSION = 1.0;
				MTL_FAST_MATH = YES;
				PRODUCT_BUNDLE_IDENTIFIER = "${BUNDLE_ID}.${EXTENSION_NAME}";
				PRODUCT_NAME = "$(TARGET_NAME)";
				SKIP_INSTALL = YES;
				SWIFT_VERSION = 5.0;
				SWIFT_OPTIMIZATION_LEVEL = "-Owholemodule";
				TARGETED_DEVICE_FAMILY = "1,2";
				CODE_SIGN_ENTITLEMENTS = "${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements";
			};
			name = Release;
		};
`;
    content = content.replace(buildConfigMatch[0], buildConfigs + buildConfigMatch[0]);
  }

  // Add XCConfigurationList for the target
  const configListMatch = content.match(/(\/\* End XCConfigurationList section \*\/)/);
  if (configListMatch) {
    const configListEntry = `
		${configListUuid} /* Build configuration list for PBXNativeTarget ${EXTENSION_NAME} */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				${debugConfigUuid} /* Debug */,
				${releaseConfigUuid} /* Release */
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
`;
    content = content.replace(configListMatch[0], configListEntry + configListMatch[0]);
  }

  // Find SampleHandler.swift file ref (may exist from plugin's addPbxGroup)
  const swiftFileRefMatch = content.match(/([A-F0-9]{24}) \/\* SampleHandler\.swift \*\/ = \{/);
  const swiftFileRefUuid = swiftFileRefMatch ? swiftFileRefMatch[1] : generateUuid();
  const swiftBuildFileUuid = generateUuid();

  // Add PBXBuildFile for SampleHandler.swift if not present
  if (!content.includes('SampleHandler.swift in Sources')) {
    const swiftBuildFile = `\t\t${swiftBuildFileUuid} /* SampleHandler.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${swiftFileRefUuid} /* SampleHandler.swift */; };\n`;
    content = content.replace(/(\/\* Begin PBXBuildFile section \*\/)/, '$1\n' + swiftBuildFile);
  }

  // Add PBXSourcesBuildPhase
  const sourcesPhaseEntry = `
		${sourcesPhaseUuid} /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				${swiftBuildFileUuid} /* SampleHandler.swift in Sources */
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
`;
  const sourcesPhaseMatch = content.match(/(\/\* End PBXSourcesBuildPhase section \*\/)/);
  if (sourcesPhaseMatch) {
    content = content.replace(sourcesPhaseMatch[0], sourcesPhaseEntry + sourcesPhaseMatch[0]);
  }

  // Add PBXCopyFilesBuildPhase for Embed App Extensions (on main target)
  const copyPhaseEntry = `
		${copyPhaseUuid} /* Embed App Extensions */ = {
			isa = PBXCopyFilesBuildPhase;
			buildActionMask = 2147483647;
			dstPath = "";
			dstSubfolderSpec = 13;
			files = (
				${buildFileUuid} /* ${EXTENSION_NAME}.appex in Embed App Extensions */
			);
			name = "Embed App Extensions";
			runOnlyForDeploymentPostprocessing = 0;
		};
`;
  const copyPhaseMatch = content.match(/(\/\* End PBXCopyFilesBuildPhase section \*\/)/);
  if (copyPhaseMatch) {
    content = content.replace(copyPhaseMatch[0], copyPhaseEntry + copyPhaseMatch[0]);
  }

  // Add copy phase and target dependency to main GrabDocs target's buildPhases
  const mainTargetMatch = content.match(/([A-F0-9]{24}) \/\* GrabDocs \*\/ = \{\s*isa = PBXNativeTarget;[^}]*buildPhases = \(\s*([^)]+)\)/s);
  if (mainTargetMatch) {
    const mainTargetId = mainTargetMatch[1];
    let existingPhases = mainTargetMatch[2].trim().replace(/,\s*$/, '');
    if (!existingPhases.includes(copyPhaseUuid)) {
      const phasesList = existingPhases ? `${existingPhases},\n\t\t\t\t${copyPhaseUuid} /* Embed App Extensions */` : `${copyPhaseUuid} /* Embed App Extensions */`;
      content = content.replace(
        mainTargetMatch[0],
        mainTargetMatch[0].replace(
          mainTargetMatch[2],
          phasesList + '\n\t\t\t'
        )
      );
    }
    // Add PBXTargetDependency and PBXContainerItemProxy for extension
    const depUuid = generateUuid();
    const proxyUuid = generateUuid();
    const projectRefMatch = content.match(/rootObject = ([A-F0-9]{24}) \/\* Project object \*\/;/);
    const projectRef = projectRefMatch ? projectRefMatch[1] : '';
    const depEntry = `\t\t${depUuid} /* PBXTargetDependency */ = {\n\t\t\tisa = PBXTargetDependency;\n\t\t\ttarget = ${targetUuid} /* ${EXTENSION_NAME} */;\n\t\t\ttargetProxy = ${proxyUuid} /* PBXContainerItemProxy */;\n\t\t};\n`;
    const proxyEntry = `\t\t${proxyUuid} /* PBXContainerItemProxy */ = {\n\t\t\tisa = PBXContainerItemProxy;\n\t\t\tcontainerPortal = ${projectRef};\n\t\t\tproxyType = 1;\n\t\t\tremoteGlobalIDString = ${targetUuid};\n\t\t\tremoteInfo = ${EXTENSION_NAME};\n\t\t};\n`;
    if (content.includes('/* End PBXTargetDependency section */')) {
      content = content.replace(/(\/\* End PBXTargetDependency section \*\/)/, depEntry + '$1');
    }
    if (content.includes('/* End PBXContainerItemProxy section */')) {
      content = content.replace(/(\/\* End PBXContainerItemProxy section \*\/)/, proxyEntry + '$1');
    }
    if (!content.includes(depUuid)) {
      content = content.replace(
        /(dependencies = \(\s*)(\);\s*\n\s*name = GrabDocs;)/,
        `$1\n\t\t\t\t${depUuid} /* PBXTargetDependency */\n\t\t\t\t$2`
      );
    }
  }

  // Add PBXFrameworksBuildPhase (empty for extension)
  const frameworksPhaseEntry = `
		${frameworksPhaseUuid} /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
`;
  const frameworksPhaseMatch = content.match(/(\/\* End PBXFrameworksBuildPhase section \*\/)/);
  if (frameworksPhaseMatch) {
    content = content.replace(frameworksPhaseMatch[0], frameworksPhaseEntry + frameworksPhaseMatch[0]);
  }

  // Add PBXResourcesBuildPhase (empty)
  const resourcesPhaseEntry = `
		${resourcesPhaseUuid} /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
`;
  const resourcesPhaseMatch = content.match(/(\/\* End PBXResourcesBuildPhase section \*\/)/);
  if (resourcesPhaseMatch) {
    content = content.replace(resourcesPhaseMatch[0], resourcesPhaseEntry + resourcesPhaseMatch[0]);
  }

  // Add PBXFileReference for SampleHandler.swift if not present
  if (!swiftFileRefMatch) {
    const fileRefEntry = `\t\t${swiftFileRefUuid} /* SampleHandler.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SampleHandler.swift; sourceTree = "<group>"; };\n`;
    content = content.replace(/(\/\* Begin PBXFileReference section \*\/)/, '$1\n' + fileRefEntry);
  }

  fs.writeFileSync(pbxPath, content);
  console.log('Patched project.pbxproj: added GrabDocsBroadcastUpload target');
}

function main() {
  try {
    const iosRoot = path.join(process.cwd(), 'ios');
    if (!fs.existsSync(iosRoot)) {
      console.error('ios/ folder not found. Run prebuild first.');
      process.exit(1);
    }
    const pbxPath = findPbxproj(iosRoot);
    if (!pbxPath) {
      console.error('project.pbxproj not found in ios/');
      process.exit(1);
    }
    if (!fs.existsSync(path.join(iosRoot, EXTENSION_NAME, 'SampleHandler.swift'))) {
      console.error(`${EXTENSION_NAME} extension files not found. Run prebuild with plugin first.`);
      process.exit(1);
    }
    patchProject(pbxPath);
  } catch (err) {
    console.error('Patch failed:', err.message);
    process.exit(1);
  }
}

main();
