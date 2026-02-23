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
 * Returns true only if the extension target appears NESTED (indented), not as a sibling.
 * CocoaPods requires the extension to be inside the main app target; a top-level
 * "target 'GrabDocsBroadcastUpload' do" causes "Unable to find host target(s)".
 */
function isExtensionProperlyNested(podfile, extensionName) {
  return new RegExp('\\n\\s+target\\s+[\'"]' + extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]\\s+do\\b').test(podfile);
}

/**
 * If the extension target exists as a top-level (sibling) block, remove it so we can
 * insert it in the correct nested place. Finds the block by indentation and removes
 * from that line through its matching `end`.
 */
function removeTopLevelExtensionBlock(podfile, extensionName) {
  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);
  let extLine = -1;
  let extIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)target\s+['"]([^'"]+)['"]\s+do\b/);
    if (m && m[2] === extensionName) {
      extLine = i;
      extIndent = m[1].length;
      break;
    }
  }
  if (extLine === -1) return podfile;
  let endLine = -1;
  for (let i = extLine + 1; i < lines.length; i++) {
    const em = lines[i].match(/^(\s*)end(\s*(#.*)?)$/);
    if (em && em[1].length <= extIndent) {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) return podfile;
  const before = lines.slice(0, extLine).join(lineEnding);
  const after  = lines.slice(endLine + 1).join(lineEnding);
  return before + (before.endsWith(lineEnding) ? '' : lineEnding) + after;
}

/**
 * Insert the extension target before the main app target's closing `end`.
 * If the extension exists but as a sibling (top-level), remove it first then insert nested.
 */
function insertExtensionBeforeMainTargetEnd(podfile, extensionName) {
  if (podfile.includes("target '" + extensionName + "' do") && podfile.includes('inherit! :search_paths')) {
    if (isExtensionProperlyNested(podfile, extensionName)) {
      return podfile;
    }
    podfile = removeTopLevelExtensionBlock(podfile, extensionName);
  }

  const lineEnding = podfile.includes('\r\n') ? '\r\n' : '\n';
  const lines = podfile.split(/\r?\n/);

  // Find main app target at ANY indentation level.
  let mainTargetLine = -1;
  let targetIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)target\s+['"]([^'"]+)['"]\s+do\b/);
    if (m && m[2] !== extensionName) {
      mainTargetLine = i;
      targetIndent = m[1].length;
      break;
    }
  }
  if (mainTargetLine === -1) return podfile;

  // Find first `end` whose indentation is <= the target's indentation.
  let closingLine = -1;
  for (let i = mainTargetLine + 1; i < lines.length; i++) {
    const em = lines[i].match(/^(\s*)end(\s*(#.*)?)$/);
    if (em && em[1].length <= targetIndent) {
      closingLine = i;
      break;
    }
  }
  if (closingLine === -1) return podfile;

  const ind  = ' '.repeat(targetIndent + 2);
  const ind2 = ' '.repeat(targetIndent + 4);
  const extensionBlock = [
    '',
    ind  + "target '" + extensionName + "' do",
    ind2 + 'inherit! :search_paths',
    ind2 + 'use_modular_headers!',
    ind2 + "pod 'HMSBroadcastExtensionSDK'",
    ind  + 'end',
  ].join(lineEnding);

  const before = lines.slice(0, closingLine).join(lineEnding);
  const after  = lines.slice(closingLine).join(lineEnding);
  return before + extensionBlock + lineEnding + after;
}

/**
 * Add the extension as a nested target inside the main app target so CocoaPods
 * has a host target for the app extension (required for "Unable to find host target(s)").
 */
function withPodfileEntry(config, { extensionName }) {
  return withPodfile(config, (config) => {
    const data = config.modResults;
    const podfile = typeof data === 'string' ? data : (data?.contents ?? '');

    console.log('[ios-hms-screenshare] withPodfile: content length=' + podfile.length + ' lines=' + podfile.split('\n').length);
    // Show the target lines so we can confirm what target name Expo is using.
    podfile.split('\n').filter(l => /target\s+['"]/.test(l)).forEach(l => console.log('[ios-hms-screenshare] target line:', JSON.stringify(l)));

    if (podfile.length === 0) {
      console.warn('[ios-hms-screenshare] withPodfile received empty Podfile — will rely on withDangerousMod');
      return config;
    }

    const newContents = insertExtensionBeforeMainTargetEnd(podfile, extensionName);

    if (newContents === podfile) {
      if (isExtensionProperlyNested(podfile, extensionName)) {
        console.log('[ios-hms-screenshare] ✅ withPodfile: already properly nested');
        return config;
      }
      // Patch failed — print the Podfile so it appears in EAS build logs, then throw.
      console.error('[ios-hms-screenshare] ❌ withPodfile: could not patch. Full Podfile:\n' + podfile);
      throw new Error('[ios-hms-screenshare] withPodfile: failed to nest ' + extensionName + ' — main target not found. See Podfile above.');
    }

    console.log('[ios-hms-screenshare] ✅ withPodfile: Podfile patched successfully');
    if (typeof data === 'string') {
      config.modResults = newContents;
    } else {
      config.modResults = { ...data, contents: newContents };
    }
    return config;
  });
}

/**
 * Fallback / safety net: patch the Podfile on disk after withPodfile has run.
 * Throws with the full Podfile in the log if it still can't be patched, so the
 * build fails immediately with useful diagnostics instead of a cryptic CocoaPods error.
 */
function withPodfileDangerousPatch(config, { extensionName }) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      console.log('[ios-hms-screenshare] withDangerousMod: checking Podfile at', podfilePath);

      if (!fs.existsSync(podfilePath)) {
        console.warn('[ios-hms-screenshare] withDangerousMod: Podfile not found — will be created by withPodfile later (this is normal)');
        return config;
      }

      const contents = fs.readFileSync(podfilePath, 'utf8');
      console.log('[ios-hms-screenshare] withDangerousMod: Podfile exists, length=' + contents.length);
      contents.split('\n').filter(l => /target\s+['"]/.test(l)).forEach(l => console.log('[ios-hms-screenshare] withDangerousMod target line:', JSON.stringify(l)));

      if (isExtensionProperlyNested(contents, extensionName)) {
        console.log('[ios-hms-screenshare] ✅ withDangerousMod: already properly nested');
        return config;
      }

      const newContents = insertExtensionBeforeMainTargetEnd(contents, extensionName);

      if (newContents === contents) {
        console.error('[ios-hms-screenshare] ❌ withDangerousMod: could not patch. Full Podfile:\n' + contents);
        throw new Error('[ios-hms-screenshare] withDangerousMod: failed to nest ' + extensionName + '. See Podfile above.');
      }

      fs.writeFileSync(podfilePath, newContents);
      console.log('[ios-hms-screenshare] ✅ withDangerousMod: Podfile patched — nested ' + extensionName);
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
