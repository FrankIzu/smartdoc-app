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
  withPlugins,
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
 * Add the extension as a nested target inside the main app target so CocoaPods
 * has a host target for the app extension (required for "Unable to find host target(s)").
 */
function withPodfileEntry(config, { extensionName, mainTargetName }) {
  return withPodfile(config, (config) => {
    const data = config.modResults;
    const isString = typeof data === 'string';
    let contents = isString ? data : (data.contents || '');
    const NL = /\r\n|\r|\n/;
    const newline = contents.match(NL)?.[0] || '\n';

    const nestedBlock = `${newline}  target '${extensionName}' do${newline}    inherit! :search_paths${newline}    use_modular_headers!${newline}    pod 'HMSBroadcastExtensionSDK'${newline}  end${newline}`;

    const alreadyNested = contents.includes("target '" + extensionName + "' do") && contents.includes('inherit! :search_paths');
    if (alreadyNested) {
      return config;
    }

    const standalonePattern = new RegExp(
      "(?:\\r?\\n)?target\\s+'" + extensionName.replace(/'/g, "\\\\'") + "'\\s+do\\s*(?:\\r?\\n)\\s*use_modular_headers![\\s\\S]*?(?:\\r?\\n)end\\s*(?:\\r?\\n)?",
      'g'
    );
    contents = contents.replace(standalonePattern, '');

    const escapedMain = mainTargetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mainTargetRegex = new RegExp(
      "(target\\s+['\"]" + escapedMain + "['\"]\\s+do\\s*(?:\\r?\\n))",
      'm'
    );
    const mainTargetMatch = contents.match(mainTargetRegex);
    if (mainTargetMatch) {
      contents = contents.replace(mainTargetMatch[1], mainTargetMatch[1] + nestedBlock);
    } else {
      const firstTargetRegex = /(target\s+['"][^'"]+['"]\s+do\s*(?:\r?\n))/m;
      const firstTargetMatch = contents.match(firstTargetRegex);
      if (firstTargetMatch) {
        contents = contents.replace(firstTargetMatch[1], firstTargetMatch[1] + nestedBlock);
      }
    }

    config.modResults = isString ? contents : { ...data, contents };
    return config;
  });
}

/**
 * Fallback: directly patch ios/Podfile on disk during prebuild.
 * withPodfile mod may not apply in all contexts; this ensures the nested target is present.
 */
function withPodfileDangerousPatch(config, { extensionName, mainTargetName }) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;

      let contents = fs.readFileSync(podfilePath, 'utf8');
      const NL = /\r\n|\r|\n/;
      const newline = contents.match(NL)?.[0] || '\n';

      const nestedBlock = `${newline}  target '${extensionName}' do${newline}    inherit! :search_paths${newline}    use_modular_headers!${newline}    pod 'HMSBroadcastExtensionSDK'${newline}  end${newline}`;

      if (contents.includes("target '" + extensionName + "' do") && contents.includes('inherit! :search_paths')) {
        return config;
      }

      const standalonePattern = new RegExp(
        "(?:\\r?\\n)?target\\s+'" + extensionName.replace(/'/g, "\\\\'") + "'\\s+do\\s*(?:\\r?\\n)\\s*use_modular_headers![\\s\\S]*?(?:\\r?\\n)end\\s*(?:\\r?\\n)?",
        'g'
      );
      contents = contents.replace(standalonePattern, '');

      const escapedMain = mainTargetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mainTargetRegex = new RegExp(
        "(target\\s+['\"]" + escapedMain + "['\"]\\s+do\\s*(?:\\r?\\n))",
        'm'
      );
      const mainTargetMatch = contents.match(mainTargetRegex);
      if (mainTargetMatch) {
        contents = contents.replace(mainTargetMatch[1], mainTargetMatch[1] + nestedBlock);
      } else {
        const firstTargetMatch = contents.match(/(target\s+['"][^'"]+['"]\s+do\s*(?:\r?\n))/m);
        if (firstTargetMatch) {
          contents = contents.replace(firstTargetMatch[1], firstTargetMatch[1] + nestedBlock);
        }
      }

      fs.writeFileSync(podfilePath, contents);
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
  config = withBroadcastExtensionFiles(config, { appGroup, extensionName });
  config = withBroadcastExtensionTarget(config, { appGroup, extensionName });
  config = withPodfileEntry(config, { extensionName, mainTargetName });
  config = withPodfileDangerousPatch(config, { extensionName, mainTargetName });
  config = withAppGroupEntitlements(config, { appGroup });

  // Do NOT add appExtensions to extra.eas.build.experimental.ios - EAS tries to resolve
  // extension targets by UUID and fails with "Cannot read properties of undefined" when
  // the project was patched via string replacement. For prebuild+bare workflow, EAS
  // auto-detects app extensions from the Xcode project.

  return config;
}

module.exports = withHmsScreenshareExtension;
