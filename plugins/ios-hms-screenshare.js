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
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');
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

      const sharedBuildSettings = {
        INFOPLIST_FILE: quoted(`${extensionName}/Info.plist`),
        LD_RUNPATH_SEARCH_PATHS: quoted('$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'),
        PRODUCT_NAME: quoted(extensionName),
        SKIP_INSTALL: 'YES',
        PRODUCT_BUNDLE_IDENTIFIER: quoted(extBundleId),
        CODE_SIGN_ENTITLEMENTS: quoted(`${extensionName}/${extensionName}.entitlements`),
        CODE_SIGN_STYLE: '"Automatic"',
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

    // Directly patch build configurations belonging to this extension target.
    // updateBuildProperty's target-name filter is unreliable; instead we find the
    // target's XCConfigurationList and set properties on each XCBuildConfiguration.
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
              buildConfig.buildSettings.CODE_SIGN_STYLE = '"Automatic"';
              buildConfig.buildSettings.DEVELOPMENT_TEAM = '"Q33K3Q7Q53"';
              buildConfig.buildSettings.INFOPLIST_FILE = quoted(`${extensionName}/Info.plist`);
              buildConfig.buildSettings.CODE_SIGN_ENTITLEMENTS = quoted(`${extensionName}/${extensionName}.entitlements`);
              buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = quoted(extBundleId);
            }
          }
        }
      }
    }

    return config;
  });
}

/**
 * Add the extension target nested inside the main app target using Expo's official
 * mergeContents utility. This is idempotent (tagged), battle-tested, and does NOT
 * depend on main target name or indentation heuristics.
 *
 * Anchor: the first unindented `end` in the Podfile = closing end of the main target.
 * The extension block is inserted BEFORE that line (offset: 0).
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
    // If already merged (tag present), skip.
    if (src.includes('# @generated begin ' + tag)) {
      console.log('[ios-hms-screenshare] ✅ withPodfile: already merged');
      return config;
    }

    const newSrc = [
      "  target '" + extensionName + "' do",
      '    inherit! :search_paths',
      '    use_modular_headers!',
      "    pod 'HMSBroadcastExtensionSDK'",
      '  end',
    ].join('\n');

    let result;
    try {
      result = mergeContents({
        tag,
        src,
        newSrc,
        // Anchor = first unindented `end` = main target's closing end.
        anchor: /^end$/m,
        // offset: 0 inserts BEFORE the anchor line.
        offset: 0,
        comment: '#',
      });
    } catch (e) {
      console.error('[ios-hms-screenshare] ❌ mergeContents failed:', e.message);
      console.error('[ios-hms-screenshare] Full Podfile:\n' + src);
      throw e;
    }

    if (!result.didMerge) {
      console.error('[ios-hms-screenshare] ❌ mergeContents anchor not found. Full Podfile:\n' + src);
      throw new Error('[ios-hms-screenshare] Could not find anchor `^end$` in Podfile to insert ' + extensionName + '.');
    }

    console.log('[ios-hms-screenshare] ✅ withPodfile: mergeContents applied');
    if (typeof data === 'string') {
      config.modResults = result.contents;
    } else {
      config.modResults = { ...data, contents: result.contents };
    }
    return config;
  });
}

/**
 * Safety net: if mergeContents in withPodfile didn't apply (e.g. Podfile written
 * after withPodfile runs), write the patch directly to disk. Throws with the full
 * Podfile if it still can't be patched so the build fails fast with useful diagnostics.
 */
function withPodfileDangerousPatch(config, { extensionName }) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        console.warn('[ios-hms-screenshare] withDangerousMod: Podfile not found at', podfilePath, '— normal if withPodfile writes it later');
        return config;
      }

      const contents = fs.readFileSync(podfilePath, 'utf8');
      const tag = 'ios-hms-screenshare-' + extensionName;

      if (contents.includes('# @generated begin ' + tag)) {
        console.log('[ios-hms-screenshare] ✅ withDangerousMod: already merged');
        return config;
      }

      const newSrc = [
        "  target '" + extensionName + "' do",
        '    inherit! :search_paths',
        '    use_modular_headers!',
        "    pod 'HMSBroadcastExtensionSDK'",
        '  end',
      ].join('\n');

      let result;
      try {
        result = mergeContents({ tag, src: contents, newSrc, anchor: /^end$/m, offset: 0, comment: '#' });
      } catch (e) {
        console.error('[ios-hms-screenshare] ❌ withDangerousMod mergeContents failed:', e.message);
        console.error('[ios-hms-screenshare] Full Podfile:\n' + contents);
        throw e;
      }

      if (!result.didMerge) {
        console.error('[ios-hms-screenshare] ❌ withDangerousMod anchor not found. Full Podfile:\n' + contents);
        throw new Error('[ios-hms-screenshare] withDangerousMod: anchor not found in Podfile for ' + extensionName);
      }

      fs.writeFileSync(podfilePath, result.contents);
      console.log('[ios-hms-screenshare] ✅ withDangerousMod: Podfile patched on disk');
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
