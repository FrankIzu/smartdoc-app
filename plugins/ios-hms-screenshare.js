/**
 * Expo config plugin: add 100ms Broadcast Upload Extension for iOS screenshare.
 * Creates the extension target, SampleHandler with HMSScreenRenderer, Podfile entry,
 * and App Group entitlements so screenshare works from iPhone/iPad without Xcode.
 *
 * Options: { appGroup?: string, extensionName?: string }
 * Defaults: appGroup: 'group.com.grabdocs.mobile', extensionName: 'GrabDocsBroadcastUpload'
 *
 * Set EXPO_PUBLIC_HMS_IOS_APP_GROUP and EXPO_PUBLIC_HMS_IOS_PREFERRED_EXTENSION in EAS
 * to match (or pass options). See docs/MOBILE_SCREENSHARE_WHITEBOARD.md
 */
const {
  withDangerousMod,
  withXcodeProject,
  withPodfile,
  withEntitlementsPlist,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');
// @expo/plist exports { default: { parse, build } }; use .default for CommonJS
const plist = require('@expo/plist').default || require('@expo/plist');

const DEFAULT_APP_GROUP = 'group.com.grabdocs.mobile';
const DEFAULT_EXTENSION_NAME = 'GrabDocsBroadcastUpload';

const SAMPLE_HANDLER_SWIFT = `import ReplayKit
import HMSBroadcastExtensionSDK

class SampleHandler: RPBroadcastSampleHandler {

  let screenRenderer = HMSScreenRenderer(appGroup: "{{APP_GROUP}}")

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
  }

  override func broadcastPaused() {
  }

  override func broadcastResumed() {
  }

  override func broadcastFinished() {
    screenRenderer.invalidate()
  }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    switch sampleBufferType {
    case RPSampleBufferType.video:
      if let error = screenRenderer.process(sampleBuffer) {
        if error.code == .noActiveMeeting {
          finishBroadcastWithError(NSError(domain: "ScreenShare",
                                           code: error.code.rawValue,
                                           userInfo: [NSLocalizedFailureReasonErrorKey: "You are not in a meeting."]))
        }
      }
      break
    case RPSampleBufferType.audioApp:
      _ = self.screenRenderer.process(audioSampleBuffer: sampleBuffer)
      break
    case RPSampleBufferType.audioMic:
      break
    @unknown default:
      fatalError("Unknown type of sample buffer")
    }
  }
}
`;

function withBroadcastExtensionFiles(config, { appGroup, extensionName }) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const extRoot = path.join(config.modRequest.platformProjectRoot, extensionName);
      await fs.promises.mkdir(extRoot, { recursive: true });

      const sampleHandler = SAMPLE_HANDLER_SWIFT.replace(/\{\{APP_GROUP\}\}/g, appGroup);
      await fs.promises.writeFile(path.join(extRoot, 'SampleHandler.swift'), sampleHandler);

      const extensionPlist = {
        NSExtension: {
          NSExtensionPointIdentifier: 'com.apple.broadcast-services-upload',
          NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).SampleHandler',
          RPBroadcastProcessMode: 'RPBroadcastProcessModeSampleBuffer',
        },
      };
      await fs.promises.writeFile(
        path.join(extRoot, 'Info.plist'),
        plist.build(extensionPlist)
      );

      const extEntitlements = {
        'com.apple.security.application-groups': [appGroup],
      };
      await fs.promises.writeFile(
        path.join(extRoot, `${extensionName}.entitlements`),
        plist.build(extEntitlements)
      );

      return config;
    },
  ]);
}

/**
 * Add the Broadcast Upload Extension target using the xcode project API.
 * Uses addTarget when available; otherwise builds the target via addToPbxNativeTargetSection
 * and related APIs so the target persists and CocoaPods can find it.
 */
function withBroadcastExtensionTarget(config, { extensionName }) {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults;
    const bundleId = config.ios?.bundleIdentifier || 'com.grabdocs.mobile';
    const extBundleId = `${bundleId}.${extensionName}`;
    const quoted = (s) => `"${s}"`;

    // Check if the extension target was already added (e.g. by expo.ios.appExtensions).
    // If it exists, skip target creation but still apply build phases + build settings below.
    const nativeTargets = project.pbxNativeTargetSection && project.pbxNativeTargetSection();
    const existingExtTarget = nativeTargets && Object.values(nativeTargets).find(
      (t) => t && t.name && (t.name === extensionName || t.name === quoted(extensionName))
    );

    let targetUuid;
    let target;

    if (existingExtTarget) {
      // Target already exists — skip creation, jump straight to build settings patch below.
      targetUuid = Object.keys(nativeTargets).find((k) => {
        const t = nativeTargets[k];
        return t && t.name && (t.name === extensionName || t.name === quoted(extensionName));
      });
    }

    if (!existingExtTarget && typeof project.addTarget === 'function') {
      target = project.addTarget(extensionName, 'app_extension', extensionName, extBundleId);
      if (target && target.uuid) {
        targetUuid = target.uuid;

        // xcode-js addTarget creates the extension target but does NOT add it to
        // the main target's "Embed App Extensions" build phase. CocoaPods requires
        // that embedding relationship in project.pbxproj to identify the host target
        // (it calls user_target.embedded_targets on the xcodeproj). Without the phase,
        // CocoaPods throws "Unable to find host target(s) for GrabDocsBroadcastUpload".
        const mainTarget = project.getFirstTarget && project.getFirstTarget();
        if (mainTarget && mainTarget.uuid) {
          try {
            project.addBuildPhase(
              [`${extensionName}.appex`],
              'PBXCopyFilesBuildPhase',
              'Embed App Extensions',
              mainTarget.uuid,
              'app_extension'
            );
            console.log('[ios-hms-screenshare] ✅ Added Embed App Extensions phase to main target');
          } catch (embedErr) {
            console.warn('[ios-hms-screenshare] ⚠️  Could not add Embed App Extensions phase:', embedErr.message);
          }
        }
      }
    }

    if (!existingExtTarget && !targetUuid && typeof project.addToPbxNativeTargetSection === 'function') {
      const mainTarget = project.getFirstTarget && project.getFirstTarget();
      if (!mainTarget || !mainTarget.uuid) return config;

      targetUuid = project.generateUuid();
      const configListUuid = project.generateUuid();
      const debugConfigUuid = project.generateUuid();
      const releaseConfigUuid = project.generateUuid();

      const sharedBuildSettings = {
        INFOPLIST_FILE: quoted(`${extensionName}/Info.plist`),
        LD_RUNPATH_SEARCH_PATHS: quoted('$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'),
        PRODUCT_NAME: quoted(extensionName),
        SKIP_INSTALL: 'YES',
        PRODUCT_BUNDLE_IDENTIFIER: quoted(extBundleId),
        CODE_SIGN_ENTITLEMENTS: quoted(`${extensionName}/${extensionName}.entitlements`),
        // Keep Automatic so Xcode can resolve signing when credentials are available.
        // EAS overrides to Manual when it injects provisioning profiles from EAS cloud.
        // Run `eas credentials --platform ios` once to register the extension bundle ID
        // (com.grabdocs.mobile.GrabDocsBroadcastUpload) with EAS so it can inject a profile.
        CODE_SIGN_STYLE: '"Automatic"',
        DEVELOPMENT_TEAM: '"Q33K3Q7Q53"',
        IPHONEOS_DEPLOYMENT_TARGET: '"16.0"',
        SWIFT_VERSION: '"5.0"',
        TARGETED_DEVICE_FAMILY: '"1,2"',
      };
      const buildConfigs = [
        { name: 'Debug',   isa: 'XCBuildConfiguration', buildSettings: { ...sharedBuildSettings } },
        { name: 'Release', isa: 'XCBuildConfiguration', buildSettings: { ...sharedBuildSettings } },
      ];
      const xcConfigList = project.addXCConfigurationList(buildConfigs, 'Release', `Build configuration list for PBXNativeTarget "${extensionName}"`);
      if (!xcConfigList || !xcConfigList.uuid) return config;

      const productFile = project.addProductFile(`${extensionName}.appex`, {
        group: 'Copy Files',
        target: mainTarget.uuid,
        explicitFileType: 'wrapper.app-extension',
      });
      if (!productFile) return config;
      project.addToPbxBuildFileSection(productFile);

      target = {
        uuid: targetUuid,
        pbxNativeTarget: {
          isa: 'PBXNativeTarget',
          name: quoted(extensionName),
          productName: quoted(extensionName),
          productReference: productFile.fileRef,
          productType: '"com.apple.product-type.app-extension"',
          buildConfigurationList: xcConfigList.uuid,
          buildPhases: [],
          buildRules: [],
          dependencies: [],
        },
      };
      project.addToPbxNativeTargetSection(target);
      // CocoaPods finds the host by inspecting the main target's "Embed App Extensions" phase; name must match.
      project.addBuildPhase([], 'PBXCopyFilesBuildPhase', 'Embed App Extensions', mainTarget.uuid, 'app_extension');
      project.addToPbxCopyfilesBuildPhase(productFile);
      project.addToPbxProjectSection(target);
      project.addTargetDependency(mainTarget.uuid, [targetUuid]);
    }

    if (!targetUuid) return config;

    // CocoaPods 1.2.1+ requires the host target to list the extension in Target Dependencies
    // (not just Embed phase); otherwise "Unable to find host target(s) for GrabDocsBroadcastUpload".
    const mainTarget = project.getFirstTarget && project.getFirstTarget();
    if (mainTarget && mainTarget.uuid && typeof project.addTargetDependency === 'function') {
      try {
        project.addTargetDependency(mainTarget.uuid, [targetUuid]);
        console.log('[ios-hms-screenshare] ✅ Extension added as dependency of main target');
      } catch (depErr) {
        console.warn('[ios-hms-screenshare] ⚠️  Could not add extension target dependency:', depErr.message);
      }
    }

    if (!existingExtTarget) {
      // Target was created by this plugin — add all build phases fresh.
      project.addBuildPhase(
        [`${extensionName}/SampleHandler.swift`],
        'PBXSourcesBuildPhase',
        'Sources',
        targetUuid
      );
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid);

      const replayKitFile = project.addFramework('ReplayKit.framework', { target: targetUuid, link: false });
      if (replayKitFile) {
        project.addBuildPhase(
          [replayKitFile.path || 'ReplayKit.framework'],
          'PBXFrameworksBuildPhase',
          'Frameworks',
          targetUuid
        );
      }
    } else {
      // Target was pre-created by expo.ios.appExtensions — ensure SampleHandler.swift is
      // listed in the Sources build phase (Expo creates an empty one with no files).
      try {
        const buildPhaseSection = project.pbxSourcesBuildPhaseObj && project.pbxSourcesBuildPhaseObj(targetUuid);
        const swiftPath = `${extensionName}/SampleHandler.swift`;
        if (buildPhaseSection && buildPhaseSection.files) {
          const alreadyListed = buildPhaseSection.files.some((f) => {
            const ref = project.pbxBuildFileSection && project.pbxBuildFileSection()[f.value];
            return ref && ref.fileRef_comment && ref.fileRef_comment.includes('SampleHandler.swift');
          });
          if (!alreadyListed) {
            project.addBuildPhase([swiftPath], 'PBXSourcesBuildPhase', 'Sources', targetUuid);
          }
        } else {
          project.addBuildPhase([swiftPath], 'PBXSourcesBuildPhase', 'Sources', targetUuid);
        }
      } catch (_) {
        // pbxSourcesBuildPhaseObj may not exist on all xcode versions; fall back to addBuildPhase
        project.addBuildPhase([`${extensionName}/SampleHandler.swift`], 'PBXSourcesBuildPhase', 'Sources', targetUuid);
      }
    }

    // Always patch build configurations — overwrite whatever appExtensions or addTarget set
    // so our HMS-specific settings (INFOPLIST_FILE, CODE_SIGN_ENTITLEMENTS, etc.) win.
    // updateBuildProperty's target-name filter is unreliable; we find the target's
    // XCConfigurationList and set properties on each XCBuildConfiguration directly.
    const nativeTargetSection = project.pbxNativeTargetSection && project.pbxNativeTargetSection();
    const configSection = project.pbxXCBuildConfigurationSection && project.pbxXCBuildConfigurationSection();
    const configListSection = project.pbxXCConfigurationList && project.pbxXCConfigurationList();

    if (nativeTargetSection && configSection && configListSection) {
      // Find the extension target entry (may have quotes around name in pbxproj)
      const extTargetEntry = Object.values(nativeTargetSection).find(
        (t) => t && t.name && (t.name === extensionName || t.name === quoted(extensionName))
      );

      if (extTargetEntry && extTargetEntry.buildConfigurationList) {
        const configListUuid = extTargetEntry.buildConfigurationList;
        const configListEntry = configListSection[configListUuid];
        if (configListEntry && configListEntry.buildConfigurations) {
          const configUuids = configListEntry.buildConfigurations.map((c) =>
            typeof c === 'object' ? c.value : c
          );
          for (const uuid of configUuids) {
            const buildConfig = configSection[uuid];
            if (buildConfig && buildConfig.buildSettings) {
              buildConfig.buildSettings.SWIFT_VERSION = '"5.0"';
              buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '"16.0"';
              buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
              buildConfig.buildSettings.SKIP_INSTALL = 'YES';
              buildConfig.buildSettings.DEVELOPMENT_TEAM = '"Q33K3Q7Q53"';
              buildConfig.buildSettings.INFOPLIST_FILE = quoted(`${extensionName}/Info.plist`);
              buildConfig.buildSettings.CODE_SIGN_ENTITLEMENTS = quoted(`${extensionName}/${extensionName}.entitlements`);
              buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = quoted(extBundleId);
              const isRelease = buildConfig.name && buildConfig.name === 'Release';
              buildConfig.buildSettings.CODE_SIGN_STYLE = isRelease ? '"Manual"' : '"Automatic"';
              if (isRelease) {
                buildConfig.buildSettings.CODE_SIGN_IDENTITY = '"Apple Distribution"';
                // UUID of our manually created profile (GrabDocsBroadcastUpload AppStore)
                // which has App Groups. Installed by eas-build-post-install hook from
                // EXT_PROVISIONING_PROFILE env var. EAS does not auto-manage extension credentials.
                buildConfig.buildSettings.PROVISIONING_PROFILE = '"f5a9c6da-0810-4a56-8963-3cb9894f83a1"';
              }
            }
          }
        }
      }
    }

    return config;
  });
}

/** Main app target in Xcode/Podfile; must match exactly (plugin accepts both 'GrabDocs' and "GrabDocs" in Podfile). */
const MAIN_APP_TARGET_NAME = 'GrabDocs';

/**
 * Ensure legacy architecture is set so codegen and RNReanimated v2 resolve consistently.
 */
function podfileEnsureNewArchDisabled(contents) {
  if (contents.includes("RCT_NEW_ARCH_ENABLED")) return contents;
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const line = "ENV['RCT_NEW_ARCH_ENABLED'] ||= '0'" + lineEnding;
  return line + contents;
}

/**
 * Remove conditional use_frameworks! from the main target.
 * 100ms + broadcast extension + use_frameworks! = fragile host resolution; we never want it enabled.
 */
function podfileStripConditionalUseFrameworks(contents) {
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  const out = lines.filter((line) => {
    const t = line.trim();
    return !(
      t.startsWith("use_frameworks!") &&
      (t.includes("podfile_properties['ios.useFrameworks']") || t.includes("ENV['USE_FRAMEWORKS']"))
    );
  });
  return out.join(lineEnding);
}

/**
 * True only when the extension target is INDENTED (i.e. nested inside a parent target).
 * Checks for a newline followed by at least one space/tab before `target 'Ext' do`.
 * A top-level (root) target would have no leading whitespace and would fail this check.
 */
function isExtensionProperlyNested(podfile, extensionName) {
  return new RegExp(
    '\n[ \t]+target\\s+[\'"]' +
    extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\'"]\\s+do\\b'
  ).test(podfile);
}

/**
 * Insert extension target INSIDE the main app target, immediately BEFORE use_react_native!(.
 * We do not use "insert before closing end" because Ruby has if/else/case blocks whose
 * end would be found first by naive depth counting, putting the extension inside the
 * wrong block. Anchoring on use_react_native! guarantees we are inside the main target
 * and outside any if/else, so CocoaPods sees a proper host relationship.
 */
function podfileInsertExtensionBlock(contents, extensionName, tag) {
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);

  // Remove any existing extension block (wrong place or duplicate)
  const tagStart = '# @generated begin ' + tag;
  let filteredLines = lines;
  if (contents.includes(tagStart)) {
    const out = [];
    let skip = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(tagStart)) {
        skip = 1;
        continue;
      }
      if (skip) {
        if (lines[i].includes('# @generated end ' + tag)) skip = 0;
        continue;
      }
      out.push(lines[i]);
    }
    filteredLines = out;
  }

  // Find first "target 'GrabDocs' do" or "target \"GrabDocs\" do"
  const targetDoRe = new RegExp("^\\s*target\\s+['\"]" + MAIN_APP_TARGET_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s+do\\s*$");
  let mainTargetLineIndex = -1;
  for (let i = 0; i < filteredLines.length; i++) {
    if (targetDoRe.test(filteredLines[i])) {
      mainTargetLineIndex = i;
      break;
    }
  }
  if (mainTargetLineIndex === -1) return contents;

  // Insert BEFORE use_react_native!( — extension must be declared before RN mutates target graph.
  // CocoaPods builds the dependency graph top-down; if extension comes after use_react_native!,
  // RN's autolinking breaks CocoaPods' ability to infer the host target.
  const useReactNativeRe = /use_react_native!\s*\(/;
  let insertLineIndex = -1;
  for (let i = mainTargetLineIndex + 1; i < filteredLines.length; i++) {
    if (useReactNativeRe.test(filteredLines[i])) {
      insertLineIndex = i;
      break;
    }
  }
  if (insertLineIndex === -1) return contents;

  // With static RN prebuilt + New Architecture, CocoaPods requires the extension to explicitly
  // declare the same platform as the root so host resolution succeeds.
  const platformMatch = contents.match(/platform\s+:\s*ios\s*,\s*['"]([\d.]+)['"]/);
  const iosDeploymentTarget = platformMatch ? platformMatch[1] : '16.0';

  // Do NOT add use_frameworks! to the extension target. With RN 0.81 + Expo + static frameworks
  // + Hermes, having use_frameworks! in both main and extension breaks CocoaPods host detection
  // ("Unable to find host target(s)"). Use inherit! :complete so CocoaPods sees full host relationship.
  const extensionBlock = [
    '  target \'' + extensionName + '\' do',
    "    platform :ios, '" + iosDeploymentTarget + "'",
    '    inherit! :complete',
    '    use_modular_headers!',
    "    pod 'HMSBroadcastExtensionSDK'", // From 100ms; requires iOS deployment target compatible with @100mslive/react-native-hms
    '  end',
  ];
  const before = filteredLines.slice(0, insertLineIndex).join(lineEnding);
  const after = filteredLines.slice(insertLineIndex).join(lineEnding);
  return before + lineEnding + extensionBlock.join(lineEnding) + lineEnding + after;
}

/**
 * Inject APPLICATION_EXTENSION_API_ONLY for the extension target into the existing post_install block.
 * CocoaPods and Xcode expect app extensions to have this set.
 */
function podfileInjectPostInstallExtensionApiOnly(contents, extensionName) {
  if (contents.includes('APPLICATION_EXTENSION_API_ONLY') && contents.includes(extensionName)) {
    return contents;
  }
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  const postInstallRe = /post_install\s+do\s+\|installer\|/;
  let postInstallLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (postInstallRe.test(lines[i])) {
      postInstallLineIndex = i;
      break;
    }
  }
  if (postInstallLineIndex === -1) return contents;
  // Find the "end" that closes this post_install (depth from postInstallLineIndex)
  let depth = 1;
  let closingIndex = -1;
  for (let i = postInstallLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*end\s*$/.test(line)) {
      depth--;
      if (depth === 0) {
        closingIndex = i;
        break;
      }
    } else if (/\s+do\s*$/.test(line)) {
      depth++;
    }
  }
  if (closingIndex === -1) return contents;
  const indent = (lines[closingIndex].match(/^(\s*)/) || ['', ''])[1] || '  ';
  const block = [
    indent + '# ios-hms-screenshare: app extension must use APPLICATION_EXTENSION_API_ONLY',
    indent + 'installer.pods_project.targets.each do |target|',
    indent + '  if target.name == \'' + extensionName + '\'',
    indent + '    target.build_configurations.each do |config|',
    indent + '      config.build_settings[\'APPLICATION_EXTENSION_API_ONLY\'] = \'YES\'',
    indent + '    end',
    indent + '  end',
    indent + 'end',
  ].join(lineEnding);
  const before = lines.slice(0, closingIndex).join(lineEnding);
  const after = lines.slice(closingIndex).join(lineEnding);
  return before + lineEnding + block + lineEnding + after;
}

/**
 * Add the extension target nested inside the main app target.
 * Inserts immediately before the main target's closing `end` so CocoaPods sees the host relationship.
 */
function withPodfileEntry(config, { extensionName }) {
  return withPodfile(config, (config) => {
    const data = config.modResults;
    const src  = typeof data === 'string' ? data : (data?.contents ?? '');

    if (src.length === 0) {
      console.warn('[ios-hms-screenshare] withPodfile: empty content — skipping');
      return config;
    }

    // Ensure legacy architecture so codegen and RNReanimated v2 resolve consistently.
    let working = podfileEnsureNewArchDisabled(src);

    const tag = 'ios-hms-screenshare-' + extensionName;

    // Strip conditional use_frameworks! (100ms + extension: never enable frameworks linkage).
    working = podfileStripConditionalUseFrameworks(working);

    // Correct check: extension must be INDENTED (nested), not just anywhere after the main target.
    if (isExtensionProperlyNested(working, extensionName)) {
      console.log('[ios-hms-screenshare] ✅ withPodfile: extension already properly nested inside main target');
      if (working !== src) {
        if (typeof data === 'string') config.modResults = working;
        else config.modResults = { ...data, contents: working };
      }
      return config;
    }

    let resultContents = podfileInsertExtensionBlock(working, extensionName, tag);
    if (resultContents === working) {
      console.error('[ios-hms-screenshare] ❌ Podfile: could not find main target "' + MAIN_APP_TARGET_NAME + '" or insertion point.');
      throw new Error('[ios-hms-screenshare] Could not nest ' + extensionName + ' in Podfile. Check that the main app target is named "' + MAIN_APP_TARGET_NAME + '".');
    }
    resultContents = podfileInjectPostInstallExtensionApiOnly(resultContents, extensionName);
    resultContents = podfileStripConditionalUseFrameworks(resultContents);
    console.log('[ios-hms-screenshare] ✅ withPodfile: extension block nested inside main target + post_install APPLICATION_EXTENSION_API_ONLY');
    if (typeof data === 'string') {
      config.modResults = resultContents;
    } else {
      config.modResults = { ...data, contents: resultContents };
    }
    return config;
  });
}

/**
 * Patch project.pbxproj to add the extension as a Target Dependency of the main app.
 * CocoaPods 1.2.1+ requires this (not just Embed App Extensions); otherwise
 * "Unable to find host target(s) for GrabDocsBroadcastUpload". The xcode-js
 * addTargetDependency is not always available or applied, so we patch the file directly.
 */
function withPbxprojExtensionTargetDependency(config, { extensionName }) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const xcodeprojDir = fs.readdirSync(iosRoot).find((f) => f.endsWith('.xcodeproj'));
      if (!xcodeprojDir) return config;

      const pbxPath = path.join(iosRoot, xcodeprojDir, 'project.pbxproj');
      if (!fs.existsSync(pbxPath)) return config;

      let pbx = fs.readFileSync(pbxPath, 'utf8');

      // Resolve project UUID (PBXProject)
      const projectMatch = pbx.match(/([0-9A-F]{24})\s*\/\*\s*Project object\s*\*\/\s*=\s*\{\s*isa = PBXProject;/);
      const projectUuid = projectMatch ? projectMatch[1] : null;
      if (!projectUuid) {
        console.warn('[ios-hms-screenshare] ⚠️  Could not find Project object UUID in project.pbxproj');
        return config;
      }

      // Resolve main app target UUID (first PBXNativeTarget with product-type.application)
      const nativeTargetSection = pbx.match(/\/\* Begin PBXNativeTarget section \*\/[\s\S]*?\/\* End PBXNativeTarget section \*\//);
      if (!nativeTargetSection) return config;
      const appTargetMatch = nativeTargetSection[0].match(
        /([0-9A-F]{24})\s*\/\*\s*GrabDocs\s*\*\/\s*=\s*\{[\s\S]*?productType = "com\.apple\.product-type\.application"/
      );
      const mainTargetUuid = appTargetMatch ? appTargetMatch[1] : null;
      if (!mainTargetUuid) {
        console.warn('[ios-hms-screenshare] ⚠️  Could not find main app target (GrabDocs) UUID');
        return config;
      }

      // Resolve extension target UUID (PBXNativeTarget with GrabDocsBroadcastUpload)
      const extTargetMatch = nativeTargetSection[0].match(
        new RegExp('([0-9A-F]{24})\\s*\\/\\*\\s*"' + extensionName + '"\\s*\\*\\/\\s*=\\s*\\{[\\s\\S]*?productType = "com\\.apple\\.product-type\\.app-extension"')
      );
      const extensionTargetUuid = extTargetMatch ? extTargetMatch[1] : null;
      if (!extensionTargetUuid) {
        console.warn('[ios-hms-screenshare] ⚠️  Could not find extension target UUID in project.pbxproj');
        return config;
      }

      // Already patched: main target has a non-empty dependencies list
      const mainTargetDepsAlready = new RegExp(
        mainTargetUuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?dependencies = \\(\\s*\\n\\s*[0-9A-F]{24}'
      );
      if (mainTargetDepsAlready.test(pbx)) {
        console.log('[ios-hms-screenshare] ✅ project.pbxproj: main target already has extension dependency');
        return config;
      }

      // Deterministic UUIDs for the new entries (24 hex chars)
      const containerProxyUuid = 'A1B2C3D4E5F60718293A4B5C';
      const targetDependencyUuid = 'D4E5F60718293A4B5C6D7E8F';

      // Add PBXContainerItemProxy and PBXTargetDependency entries (create sections if missing)
      const containerProxyEntry = `\t\t${containerProxyUuid} /* PBXContainerItemProxy */ = {
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = ${projectUuid} /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = ${extensionTargetUuid};
\t\t\tremoteInfo = "${extensionName}";
\t\t};
`;
      const targetDependencyEntry = `\t\t${targetDependencyUuid} /* PBXTargetDependency */ = {
\t\t\tisa = PBXTargetDependency;
\t\t\ttargetProxy = ${containerProxyUuid} /* PBXContainerItemProxy */;
\t\t};
`;

      if (!pbx.includes('PBXContainerItemProxy')) {
        pbx = pbx.replace(
          /(\/\* End PBXProject section \*\/)/,
          `$1\n\n/* Begin PBXContainerItemProxy section */\n${containerProxyEntry}/* End PBXContainerItemProxy section */\n\n/* Begin PBXTargetDependency section */\n${targetDependencyEntry}/* End PBXTargetDependency section */`
        );
      } else {
        pbx = pbx.replace(/(\/\* End PBXContainerItemProxy section \*\/)/, containerProxyEntry + '$1');
        if (!pbx.includes('PBXTargetDependency')) {
          pbx = pbx.replace(
            /(\/\* End PBXContainerItemProxy section \*\/)/,
            `$1\n\n/* Begin PBXTargetDependency section */\n${targetDependencyEntry}/* End PBXTargetDependency section */`
          );
        } else {
          pbx = pbx.replace(/(\/\* End PBXTargetDependency section \*\/)/, targetDependencyEntry + '$1');
        }
      }

      // Add our dependency to the main target's dependencies array (only the GrabDocs target).
      const mainTargetDepsPattern = new RegExp(
        '(' + mainTargetUuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\/\\*\\s*GrabDocs\\s*\\*\\/\\s*=\\s*\\{[\\s\\S]*?)dependencies = \\(\\s*\\)\\s*;'
      );
      const mainTargetBlockMatch = pbx.match(mainTargetDepsPattern);
      if (!mainTargetBlockMatch) {
        console.warn('[ios-hms-screenshare] ⚠️  Could not find main target empty dependencies block');
        return config;
      }
      pbx = pbx.replace(
        mainTargetDepsPattern,
        '$1dependencies = (\n\t\t\t\t' + targetDependencyUuid + ' /* ' + extensionName + ' */,\n\t\t\t);'
      );

      fs.writeFileSync(pbxPath, pbx);
      console.log('[ios-hms-screenshare] ✅ project.pbxproj: added extension as dependency of main target');
      return config;
    },
  ]);
}

/**
 * Add a Run Script build phase to the extension target that installs the
 * EXT_PROVISIONING_PROFILE (EAS file-type env var) into the provisioning profiles
 * directory. This runs DURING xcodebuild, when EAS has already set env vars and
 * credentials — so the profile is available when the extension target is signed.
 */
function withExtensionProfileInstallPhase(config, { extensionName }) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const xcodeprojDir = fs.readdirSync(iosRoot).find((f) => f.endsWith('.xcodeproj'));
      if (!xcodeprojDir) return config;

      const pbxPath = path.join(iosRoot, xcodeprojDir, 'project.pbxproj');
      if (!fs.existsSync(pbxPath)) return config;

      let pbx = fs.readFileSync(pbxPath, 'utf8');

      if (pbx.includes('Install Extension Profile')) {
        return config;
      }

      const phaseId = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
      const phaseBlock = `
		${phaseId} /* Install Extension Profile */ = {
			isa = PBXShellScriptBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			inputPaths = (
			);
			name = "Install Extension Profile";
			outputPaths = (
			);
			runOnlyForDeploymentPostprocessing = 0;
			shellPath = /bin/sh;
			shellScript = "if [ -n \\"\\\\$EXT_PROVISIONING_PROFILE\\" ] && [ -f \\"\\\\$EXT_PROVISIONING_PROFILE\\" ]; then\\\\nmkdir -p \\"\\\\$HOME/Library/MobileDevice/Provisioning Profiles\\"\\\\ncp \\"\\\\$EXT_PROVISIONING_PROFILE\\" \\"\\\\$HOME/Library/MobileDevice/Provisioning Profiles/${extensionName}.mobileprovision\\"\\\\nfi\\\\n";
		};
`;

      pbx = pbx.replace(
        /(\/\* Begin PBXShellScriptBuildPhase section \*\/)/,
        `$1${phaseBlock}`
      );

      // Add our phase as the first build phase of the extension target.
      // Extension target has Sources then Resources (main app has other phases in between).
      const extPattern = new RegExp(
        `(buildPhases = \\(\\s*\\n\\s*)([A-F0-9]+) /\\* Sources \\*/,(\\s*\\n\\s*[A-F0-9]+ /\\* Resources \\*/)`
      );
      const extMatch = pbx.match(extPattern);
      if (extMatch) {
        pbx = pbx.replace(extMatch[0], `$1${phaseId} /* Install Extension Profile */,\n\t\t\t\t$2 /* Sources */,$3`);
      }

      fs.writeFileSync(pbxPath, pbx);
      console.log('[ios-hms-screenshare] ✅ Added Install Extension Profile run script phase');
      return config;
    },
  ]);
}

/**
 * Safety-net: after all config-plugin Podfile mods are written to disk, read it back
 * and verify the extension is properly nested. If not (e.g. another plugin overwrote it or
 * the withPodfile modResults had empty content), patch the disk file directly.
 * withDangerousMod for ios runs AFTER withPodfile in Expo's mod pipeline, so this always
 * sees the final on-disk Podfile.
 */
function withPodfilePatchOnDisk(config, { extensionName }) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const podfilePath = path.join(iosRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        console.warn('[ios-hms-screenshare] Podfile not found at', podfilePath, '— skipping disk patch');
        return config;
      }
      let contents = fs.readFileSync(podfilePath, 'utf8');
      contents = podfileStripConditionalUseFrameworks(contents);

      if (isExtensionProperlyNested(contents, extensionName)) {
        console.log('[ios-hms-screenshare] ✅ Podfile on disk: extension already properly nested');
        fs.writeFileSync(podfilePath, contents);
        return config;
      }

      console.warn('[ios-hms-screenshare] ⚠️  Podfile on disk: extension NOT properly nested — applying disk patch');
      const tag = 'ios-hms-screenshare-' + extensionName;
      let patched = podfileInsertExtensionBlock(contents, extensionName, tag);
      if (patched === contents) {
        throw new Error(
          '[ios-hms-screenshare] Could not nest ' + extensionName + ' in Podfile (disk). ' +
          'Ensure the main app target is named "' + MAIN_APP_TARGET_NAME + '" and the Podfile has use_react_native!(.'
        );
      }
      patched = podfileInjectPostInstallExtensionApiOnly(patched, extensionName);
      patched = podfileEnsureNewArchDisabled(patched);
      patched = podfileStripConditionalUseFrameworks(patched);
      fs.writeFileSync(podfilePath, patched);
      console.log('[ios-hms-screenshare] ✅ Podfile patched on disk (safety net): extension nested + post_install + ENV');
      return config;
    },
  ]);
}

function withAppGroupEntitlements(config, { appGroup }) {
  return withEntitlementsPlist(config, (config) => {
    const ents = config.modResults;
    if (!ents['com.apple.security.application-groups']) {
      ents['com.apple.security.application-groups'] = [appGroup];
    } else if (!ents['com.apple.security.application-groups'].includes(appGroup)) {
      ents['com.apple.security.application-groups'].push(appGroup);
    }
    return config;
  });
}

function withHmsScreenshareExtension(config, options = {}) {
  const appGroup = options.appGroup || process.env.EXPO_PUBLIC_HMS_IOS_APP_GROUP?.trim() || DEFAULT_APP_GROUP;
  const extensionName = options.extensionName || process.env.EXPO_PUBLIC_HMS_IOS_PREFERRED_EXTENSION?.trim() || DEFAULT_EXTENSION_NAME;
  console.log('[ios-hms-screenshare] Plugin invoked: extensionName=' + extensionName + ' appGroup=' + appGroup);

  const podfileOpts = { extensionName };
  config = withBroadcastExtensionFiles(config, { appGroup, extensionName });
  config = withBroadcastExtensionTarget(config, { appGroup, extensionName });
  config = withPbxprojExtensionTargetDependency(config, podfileOpts);
  config = withExtensionProfileInstallPhase(config, { extensionName });
  config = withPodfileEntry(config, podfileOpts);
  // Disk-level safety net: runs after withPodfile in Expo's pipeline; re-checks and re-patches if needed.
  config = withPodfilePatchOnDisk(config, podfileOpts);
  config = withAppGroupEntitlements(config, { appGroup });

  // expo.ios.appExtensions in app.json declares the extension to EAS so that
  // `eas credentials` shows it and manages a provisioning profile for it.
  // The plugin handles source files, Info.plist, entitlements, and Podfile — it
  // skips target creation when appExtensions has already created the target, but
  // always overwrites the build settings so HMS-specific values win.

  return config;
}

module.exports = withHmsScreenshareExtension;
