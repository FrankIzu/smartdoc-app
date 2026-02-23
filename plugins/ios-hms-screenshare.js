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

    const nativeTargets = project.pbxNativeTargetSection && project.pbxNativeTargetSection();
    if (nativeTargets && Object.keys(nativeTargets).filter((k) => !/comment$/.test(k)).length > 1) {
      return config;
    }

    let targetUuid;
    let target;

    if (typeof project.addTarget === 'function') {
      target = project.addTarget(extensionName, 'app_extension', extensionName, extBundleId);
      if (target && target.uuid) {
        targetUuid = target.uuid;
      }
    }

    if (!targetUuid && typeof project.addToPbxNativeTargetSection === 'function') {
      const mainTarget = project.getFirstTarget && project.getFirstTarget();
      if (!mainTarget || !mainTarget.uuid) return config;

      targetUuid = project.generateUuid();
      const configListUuid = project.generateUuid();
      const debugConfigUuid = project.generateUuid();
      const releaseConfigUuid = project.generateUuid();

      const buildConfigs = [
        {
          name: 'Debug',
          isa: 'XCBuildConfiguration',
          buildSettings: {
            INFOPLIST_FILE: quoted(`${extensionName}/Info.plist`),
            LD_RUNPATH_SEARCH_PATHS: quoted('$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'),
            PRODUCT_NAME: quoted(extensionName),
            SKIP_INSTALL: 'YES',
            PRODUCT_BUNDLE_IDENTIFIER: quoted(extBundleId),
            CODE_SIGN_ENTITLEMENTS: quoted(`${extensionName}/${extensionName}.entitlements`),
            IPHONEOS_DEPLOYMENT_TARGET: '"14.0"',
          },
        },
        {
          name: 'Release',
          isa: 'XCBuildConfiguration',
          buildSettings: {
            INFOPLIST_FILE: quoted(`${extensionName}/Info.plist`),
            LD_RUNPATH_SEARCH_PATHS: quoted('$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'),
            PRODUCT_NAME: quoted(extensionName),
            SKIP_INSTALL: 'YES',
            PRODUCT_BUNDLE_IDENTIFIER: quoted(extBundleId),
            CODE_SIGN_ENTITLEMENTS: quoted(`${extensionName}/${extensionName}.entitlements`),
            IPHONEOS_DEPLOYMENT_TARGET: '"14.0"',
          },
        },
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
      project.addBuildPhase([], 'PBXCopyFilesBuildPhase', 'Copy Files', mainTarget.uuid, 'app_extension');
      project.addToPbxCopyfilesBuildPhase(productFile);
      project.addToPbxProjectSection(target);
      project.addTargetDependency(mainTarget.uuid, [targetUuid]);
    }

    if (!targetUuid) return config;

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

    if (typeof project.updateBuildProperty === 'function') {
      project.updateBuildProperty('INFOPLIST_FILE', quoted(`${extensionName}/Info.plist`), undefined, quoted(extensionName));
      project.updateBuildProperty('CODE_SIGN_ENTITLEMENTS', quoted(`${extensionName}/${extensionName}.entitlements`), undefined, quoted(extensionName));
      project.updateBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', '"14.0"', undefined, quoted(extensionName));
    }

    return config;
  });
}

/**
 * Find the first host app target in the Podfile (first target that is not the extension).
 * Expo may use app name, slug, or other; this avoids depending on a specific name.
 */
function findMainTargetInPodfile(podfile, extensionName) {
  const targetRegex = /target\s+['"]([^'"]+)['"]\s+do\b/g;
  let m;
  while ((m = targetRegex.exec(podfile)) !== null) {
    if (m[1] !== extensionName) return m[1];
  }
  return null;
}

/**
 * Replace the first occurrence of target 'mainTargetName' do with the same block
 * plus a nested target for the extension. Returns new contents or podfile if no match.
 */
function applyPodfilePatch(podfile, extensionName, mainTargetName) {
  const mainTargetRegex = new RegExp(
    "target\\s+['\"]" + mainTargetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s+do\\b"
  );
  const replacement = `target '${mainTargetName}' do

  target '${extensionName}' do
    inherit! :search_paths
    use_modular_headers!
    pod 'HMSBroadcastExtensionSDK'
  end`;
  return podfile.replace(mainTargetRegex, replacement);
}

/**
 * Add the extension as a nested target inside the main app target so CocoaPods
 * has a host target for the app extension (required for "Unable to find host target(s)").
 */
function withPodfileEntry(config, { extensionName, mainTargetName, slug }) {
  return withPodfile(config, (config) => {
    const data = config.modResults;
    const podfile = typeof data === 'string' ? data : (data?.contents ?? '');

    if (podfile.includes("target '" + extensionName + "' do") && podfile.includes('inherit! :search_paths')) {
      return config;
    }

    let newContents = applyPodfilePatch(podfile, extensionName, mainTargetName);
    if (newContents === podfile && slug && slug !== mainTargetName) {
      newContents = applyPodfilePatch(podfile, extensionName, slug);
    }
    if (newContents === podfile) {
      const detected = findMainTargetInPodfile(podfile, extensionName);
      if (detected) {
        newContents = applyPodfilePatch(podfile, extensionName, detected);
      }
    }

    if (newContents === podfile) {
      if (process.env.EXPO_DEBUG_PODFILE) {
        console.log('[ios-hms-screenshare] Podfile modResults (first 500 chars):', podfile.slice(0, 500));
      }
      return config;
    }

    if (typeof data === 'string') {
      config.modResults = newContents;
    } else {
      config.modResults = { ...data, contents: newContents };
    }
    return config;
  });
}

/**
 * Fallback: patch Podfile on disk. withPodfile may not apply in EAS prebuild context.
 * Runs during prebuild and directly writes to ios/Podfile.
 */
function withPodfileDangerousPatch(config, { extensionName, mainTargetName, slug }) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;

      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes("target '" + extensionName + "' do") && contents.includes('inherit! :search_paths')) {
        return config;
      }

      let newContents = applyPodfilePatch(contents, extensionName, mainTargetName);
      if (newContents === contents && slug && slug !== mainTargetName) {
        newContents = applyPodfilePatch(contents, extensionName, slug);
      }
      if (newContents === contents) {
        const detected = findMainTargetInPodfile(contents, extensionName);
        if (detected) {
          newContents = applyPodfilePatch(contents, extensionName, detected);
        }
      }
      if (newContents !== contents) {
        fs.writeFileSync(podfilePath, newContents);
      }
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

  const mainTargetName = config.expo?.name || 'GrabDocs';
  const slug = config.expo?.slug || 'grabdocs';
  const podfileOpts = { extensionName, mainTargetName, slug };
  config = withBroadcastExtensionFiles(config, { appGroup, extensionName });
  config = withBroadcastExtensionTarget(config, { appGroup, extensionName });
  config = withPodfileEntry(config, podfileOpts);
  config = withPodfileDangerousPatch(config, podfileOpts);
  config = withAppGroupEntitlements(config, { appGroup });

  // Do NOT add appExtensions to extra.eas.build.experimental.ios - EAS tries to resolve
  // extension targets by UUID and fails with "Cannot read properties of undefined" when
  // the project was patched via string replacement. For prebuild+bare workflow, EAS
  // auto-detects app extensions from the Xcode project.

  return config;
}

module.exports = withHmsScreenshareExtension;
