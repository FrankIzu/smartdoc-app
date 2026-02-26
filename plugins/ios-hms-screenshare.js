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

  // Insert immediately BEFORE use_react_native!( — safe anchor inside main target, outside if/else
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

  // RNReanimated v2 depends on FBReactNativeSpec from React Native codegen. With Expo prebuild
  // and New Arch off, CocoaPods may not find it unless we point to the generated podspecs.
  // Podfile runs from ios/, so path is relative to ios/ (e.g. build/generated/ios/ReactCodegen).
  const codegenPath = 'build/generated/ios/ReactCodegen';
  const needsCodegenPods = !contents.includes("pod 'FBReactNativeSpec'");
  const codegenBlock = needsCodegenPods
    ? [
        '  # Point to locally generated codegen podspecs (for RNReanimated v2 / FBReactNativeSpec)',
        "  pod 'FBReactNativeSpec', :path => '" + codegenPath + "'",
        "  pod 'React-Codegen', :path => '" + codegenPath + "'",
      ]
    : [];

  // Do NOT add use_frameworks! to the extension target. With RN 0.81 + Expo + static frameworks
  // + Hermes, having use_frameworks! in both main and extension breaks CocoaPods host detection
  // ("Unable to find host target(s)"). Extension inherits linkage from parent via inherit! :search_paths.
  const extensionBlock = [
    '  target \'' + extensionName + '\' do',
    "    platform :ios, '" + iosDeploymentTarget + "'",
    '    inherit! :search_paths',
    '    use_modular_headers!',
    "    pod 'HMSBroadcastExtensionSDK'", // From 100ms; requires iOS deployment target compatible with @100mslive/react-native-hms
    '  end',
  ];
  const insertBlock = [...codegenBlock, ...extensionBlock].filter(Boolean).join(lineEnding);
  const before = filteredLines.slice(0, insertLineIndex).join(lineEnding);
  const after = filteredLines.slice(insertLineIndex).join(lineEnding);
  return before + lineEnding + insertBlock + lineEnding + after;
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

    const tag = 'ios-hms-screenshare-' + extensionName;
    const mainTargetRe = new RegExp("target\\s+['\"]" + MAIN_APP_TARGET_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s+do");
    const mainTargetStart = mainTargetRe.test(src) ? src.search(mainTargetRe) : -1;
    const extBlockStart = src.indexOf("target '" + extensionName + "' do");
    if (mainTargetStart >= 0 && extBlockStart > mainTargetStart) {
      console.log('[ios-hms-screenshare] ✅ withPodfile: extension already nested inside main target');
      return config;
    }

    let resultContents = podfileInsertExtensionBlock(src, extensionName, tag);
    if (resultContents === src) {
      console.error('[ios-hms-screenshare] ❌ Podfile: could not find main target "' + MAIN_APP_TARGET_NAME + '" or insertion point.');
      throw new Error('[ios-hms-screenshare] Could not nest ' + extensionName + ' in Podfile. Check that the main app target is named "' + MAIN_APP_TARGET_NAME + '".');
    }
    resultContents = podfileInjectPostInstallExtensionApiOnly(resultContents, extensionName);
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
  config = withExtensionProfileInstallPhase(config, { extensionName });
  config = withPodfileEntry(config, podfileOpts);
  config = withAppGroupEntitlements(config, { appGroup });

  // expo.ios.appExtensions in app.json declares the extension to EAS so that
  // `eas credentials` shows it and manages a provisioning profile for it.
  // The plugin handles source files, Info.plist, entitlements, and Podfile — it
  // skips target creation when appExtensions has already created the target, but
  // always overwrites the build settings so HMS-specific values win.

  return config;
}

module.exports = withHmsScreenshareExtension;
