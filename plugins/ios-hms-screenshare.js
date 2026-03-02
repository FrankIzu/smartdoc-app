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
        // addTarget(app_extension) typically adds "Embed App Extensions" and the .appex product.
        // Do NOT add the phase again: duplicate phase/build file causes xcodeproj
        // "Consistency issue: no parent for object ... Copy Files, Embed App Extensions".
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
        group: 'Products',
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
              // Extension links HMSBroadcastExtensionSDK (built by CocoaPods for main target).
              // Use single-quoted form so Nanaimo (CocoaPods pbxproj parser) doesn't treat $(...) as a dict.
              buildConfig.buildSettings.FRAMEWORK_SEARCH_PATHS = "'$(inherited) $(PODS_CONFIGURATION_BUILD_DIR)/" + HMS_POD_NAME + "'";
              buildConfig.buildSettings.OTHER_LDFLAGS = "'$(inherited) -framework " + HMS_POD_NAME + "'";
              buildConfig.buildSettings.APPLICATION_EXTENSION_API_ONLY = 'YES';
              // Use Automatic signing so Xcode picks the profile we install (run script) by bundle ID.
              // Manual + PROVISIONING_PROFILE failed in EAS local (HOME/temp isolation); Automatic finds the profile in the standard dir.
              buildConfig.buildSettings.CODE_SIGN_STYLE = '"Automatic"';
              buildConfig.buildSettings.DEVELOPMENT_TEAM = '"Q33K3Q7Q53"';
              if (buildConfig.buildSettings.PROVISIONING_PROFILE) delete buildConfig.buildSettings.PROVISIONING_PROFILE;
              if (buildConfig.buildSettings.PROVISIONING_PROFILE_SPECIFIER) delete buildConfig.buildSettings.PROVISIONING_PROFILE_SPECIFIER;
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

const HMS_POD_NAME = 'HMSBroadcastExtensionSDK';

/**
 * Remove any nested "target 'GrabDocsBroadcastUpload' do ... end" block from the Podfile.
 * Used when switching to "main target only": extension is managed by Xcode, not CocoaPods.
 */
function podfileRemoveExtensionBlock(contents, extensionName) {
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  const extRe = new RegExp("^\\s*target\\s+['\"]" + extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s+do\\s*$");
  let start = -1;
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(extRe);
    if (m) {
      start = i;
      indent = (lines[i].match(/^(\s*)/) || ['', ''])[1].length;
      break;
    }
  }
  if (start === -1) return contents;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    const em = lines[i].match(/^(\s*)end(\s*(#.*)?)$/);
    if (em && em[1].length <= indent) {
      end = i;
      break;
    }
  }
  if (end === -1) return contents;
  const before = lines.slice(0, start).join(lineEnding);
  const after = lines.slice(end + 1).join(lineEnding);
  return before + (before.endsWith(lineEnding) ? '' : lineEnding) + after;
}

/**
 * Force HMSWebRTC to 1.0.6174 at the very start of the main target so HMSSDK (from
 * react-native-hms) and HMSBroadcastExtensionSDK both use it; 1.0.6173 download often returns 502.
 */
function podfileInjectHMSWebRTCPin(contents) {
  const marker = "# @generated ios-hms-screenshare HMSWebRTC pin";
  if (contents.includes(marker)) return contents;
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  const targetDoRe = new RegExp("^\\s*target\\s+['\"]" + MAIN_APP_TARGET_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s+do\\s*$");
  let mainLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (targetDoRe.test(lines[i])) {
      mainLine = i;
      break;
    }
  }
  if (mainLine === -1) return contents;
  const indent = (lines[mainLine].match(/^(\s*)/) || ['', ''])[1];
  const pinBlock = lineEnding + indent + '  ' + marker + lineEnding + indent + "  pod 'HMSWebRTC', '1.0.6174'" + lineEnding;
  const before = lines.slice(0, mainLine + 1).join(lineEnding);
  const after = lines.slice(mainLine + 1).join(lineEnding);
  return before + pinBlock + after;
}

/**
 * Add pod 'HMSBroadcastExtensionSDK' to the main app target only (before use_react_native!).
 * CocoaPods manages only GrabDocs; the extension links the framework built for the main app.
 */
function podfileAddHmsPodToMainTarget(contents) {
  if (contents.includes("pod '" + HMS_POD_NAME + "'")) return contents;
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  const targetDoRe = new RegExp("^\\s*target\\s+['\"]" + MAIN_APP_TARGET_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s+do\\s*$");
  let mainLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (targetDoRe.test(lines[i])) {
      mainLine = i;
      break;
    }
  }
  if (mainLine === -1) return contents;
  const useRnRe = /use_react_native!\s*\(/;
  let insertAt = -1;
  for (let i = mainLine + 1; i < lines.length; i++) {
    if (useRnRe.test(lines[i])) {
      insertAt = i;
      break;
    }
  }
  if (insertAt === -1) return contents;
  const indent = (lines[insertAt].match(/^(\s*)/) || ['', '  '])[1];
  const podLine = indent + "  pod '" + HMS_POD_NAME + "'  # for broadcast extension (linked by Xcode)";
  const before = lines.slice(0, insertAt).join(lineEnding);
  const after = lines.slice(insertAt).join(lineEnding);
  return before + lineEnding + podLine + lineEnding + after;
}

/**
 * Inject post_integrate hook so the extension target depends on HMSBroadcastExtensionSDK pod.
 * That way Xcode builds the pod before the extension and the Swift compiler finds the module.
 */
function podfileInjectExtensionPodDependency(contents, extensionName) {
  const marker = '# @generated ios-hms-screenshare post_integrate';
  if (contents.includes(marker)) return contents;
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const block = lineEnding + `
${marker}
post_integrate do |installer|
  user_project = installer.aggregate_targets.first&.user_project
  next unless user_project
  ext_target = user_project.targets.find { |t| t.name == '${extensionName}' }
  pod_target = installer.pods_project.targets.find { |t| t.name == '${HMS_POD_NAME}' }
  next unless ext_target && pod_target
  next if ext_target.dependencies.any? { |d| (d.target_proxy && d.target_proxy.remote_info == '${HMS_POD_NAME}') }
  pods_xcodeproj_absolute = File.expand_path('Pods/Pods.xcodeproj', File.dirname(user_project.path))
  file_ref = user_project.files.find { |f| f.path && File.expand_path(f.path, File.dirname(user_project.path)) == pods_xcodeproj_absolute }
  file_ref ||= user_project.new_file(pods_xcodeproj_absolute)
  proxy = user_project.new(Xcodeproj::Project::Object::PBXContainerItemProxy)
  proxy.container_portal = file_ref.uuid
  proxy.proxy_type = '1'
  proxy.remote_global_id_string = pod_target.uuid
  proxy.remote_info = pod_target.name
  dep = user_project.new(Xcodeproj::Project::Object::PBXTargetDependency)
  dep.target_proxy = proxy
  ext_target.dependencies << dep
  ext_target.build_configurations.each do |config|
    config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
    config.build_settings['DEVELOPMENT_TEAM'] = 'Q33K3Q7Q53'
    config.build_settings.delete('PROVISIONING_PROFILE')
    config.build_settings.delete('PROVISIONING_PROFILE_SPECIFIER')
  end
  user_project.save
end
`;
  return contents.trimEnd() + block + lineEnding;
}

/**
 * Podfile: do NOT declare the extension as a CocoaPods target. CocoaPods manages only the main app.
 * Add HMSBroadcastExtensionSDK to the main target so it is built; the extension links it in Xcode.
 */
function withPodfileEntry(config, { extensionName }) {
  return withPodfile(config, (config) => {
    const data = config.modResults;
    const src  = typeof data === 'string' ? data : (data?.contents ?? '');

    if (src.length === 0) {
      console.warn('[ios-hms-screenshare] withPodfile: empty content — skipping');
      return config;
    }

    let working = podfileEnsureNewArchDisabled(src);
    working = podfileStripConditionalUseFrameworks(working);
    working = podfileRemoveExtensionBlock(working, extensionName);
    working = podfileInjectHMSWebRTCPin(working);
    working = podfileAddHmsPodToMainTarget(working);
    working = podfileStripConditionalUseFrameworks(working);
    working = podfileInjectExtensionPodDependency(working, extensionName);

    if (typeof data === 'string') {
      config.modResults = working;
    } else {
      config.modResults = { ...data, contents: working };
    }
    console.log('[ios-hms-screenshare] ✅ withPodfile: main target only + pod ' + HMS_POD_NAME + ' + post_integrate extension→pod dependency');
    return config;
  });
}

/**
 * Ensure the extension .appex PBXFileReference is in the Products group so the xcodeproj
 * gem can assign a parent (fixes "no parent for object ... Copy Files, Embed App Extensions").
 */
function ensureAppexInProductsGroup(pbx, extensionName) {
  const appexName = extensionName + '.appex';
  const fileRefSection = pbx.match(/\/\* Begin PBXFileReference section \*\/[\s\S]*?\/\* End PBXFileReference section \*\//);
  if (!fileRefSection) return pbx;
  const appexRefMatch = fileRefSection[0].match(
    new RegExp('([0-9A-F]{24})\\s*\\/\\*[^*]*\\*\\/\\s*=\\s*\\{[\\s\\S]*?path\\s*=\\s*["\']' + extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.appex["\']')
  );
  const appexRefUuid = appexRefMatch ? appexRefMatch[1] : null;
  if (!appexRefUuid) return pbx;

  let groupSection = pbx.match(/\/\* Begin PBXGroup section \*\/[\s\S]*?\/\* End PBXGroup section \*\//);
  if (!groupSection) return pbx;
  const productsBlockRe = /(\t\t[0-9A-F]{24}\s*\/\*\s*Products\s*\/\*\s*=\s*\{\s*isa = PBXGroup;\s*children = \()([\s\S]*?)(\n\t\t\t\);)/;
  const productsMatch = groupSection[0].match(productsBlockRe);
  if (productsMatch && !productsMatch[2].includes(appexRefUuid)) {
    const insertLine = '\n\t\t\t\t' + appexRefUuid + ' /* ' + appexName + ' */,';
    const newBlock = productsMatch[1] + productsMatch[2] + insertLine + productsMatch[3];
    pbx = pbx.replace(productsMatch[0], newBlock);
  }

  groupSection = pbx.match(/\/\* Begin PBXGroup section \*\/[\s\S]*?\/\* End PBXGroup section \*\//);
  if (groupSection) {
    const copyFilesRe = /(\t\t[0-9A-F]{24}\s*\/\*\s*Copy Files\s*\/\*\s*=\s*\{\s*isa = PBXGroup;\s*children = \()([\s\S]*?)(\n\t\t\t\);)/;
    const copyMatch = groupSection[0].match(copyFilesRe);
    if (copyMatch && copyMatch[2].includes(appexRefUuid)) {
      const withoutAppex = copyMatch[2].replace(new RegExp('\\s*' + appexRefUuid + '\\s*\\/\\*[^*]*\\*\\/,\\n?', 'g'), '');
      const newCopyBlock = copyMatch[1] + withoutAppex + copyMatch[3];
      pbx = pbx.replace(copyMatch[0], newCopyBlock);
    }
  }
  return pbx;
}

const EXTENSION_BUNDLE_ID = 'com.grabdocs.mobile.GrabDocsBroadcastUpload';

/**
 * Force the extension target's build configurations to Automatic signing and remove
 * manual profile keys so Xcode finds the profile we install (run script). Applied
 * directly in pbxproj so it persists regardless of EAS/post_integrate order.
 */
function forceExtensionAutomaticSigningInPbx(pbx, extensionName) {
  const escapedBundleId = EXTENSION_BUNDLE_ID.replace(/\./g, '\\.');
  // Match each XCBuildConfiguration block that contains the extension's bundle ID.
  // We match from that line to the end of its buildSettings (next \n\t\t};).
  const blockRe = new RegExp(
    '(PRODUCT_BUNDLE_IDENTIFIER = "' + escapedBundleId + '";)([\\s\\S]*?)(\\n\\s*\\};)',
    'g'
  );
  return pbx.replace(blockRe, (_, bundleLine, restOfBuildSettings, closing) => {
    let rest = restOfBuildSettings
      .replace(/\s*CODE_SIGN_STYLE = "[^"]*";\s*\n?/g, '')
      .replace(/\s*PROVISIONING_PROFILE = "[^"]*";\s*\n?/g, '')
      .replace(/\s*PROVISIONING_PROFILE_SPECIFIER = "[^"]*";\s*\n?/g, '')
      .replace(/\s*CODE_SIGN_IDENTITY = "Apple Distribution";\s*\n?/g, '');
    rest = rest.trimEnd() + '\n\t\t\t\tCODE_SIGN_STYLE = "Automatic";\n\t\t';
    if (!rest.includes('DEVELOPMENT_TEAM')) {
      rest = rest.trimEnd() + '\n\t\t\t\tDEVELOPMENT_TEAM = "Q33K3Q7Q53";\n\t\t\t';
    }
    return bundleLine + rest + closing;
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

      // Nanaimo (CocoaPods pbxproj parser) treats $(...) inside double-quoted values as a dict and fails.
      // Force single-quoted form for extension's FRAMEWORK_SEARCH_PATHS and OTHER_LDFLAGS.
      const singleQuotedFrameworks = "'$(inherited) $(PODS_CONFIGURATION_BUILD_DIR)/" + HMS_POD_NAME + "'";
      const singleQuotedLdflags = "'$(inherited) -framework " + HMS_POD_NAME + "'";
      pbx = pbx.replace(
        /FRAMEWORK_SEARCH_PATHS = [^\n]*PODS_CONFIGURATION_BUILD_DIR[^\n]*;/g,
        "FRAMEWORK_SEARCH_PATHS = " + singleQuotedFrameworks + ";"
      );
      pbx = pbx.replace(
        new RegExp("OTHER_LDFLAGS = [^\\n]*-framework " + HMS_POD_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[^\\n]*;", "g"),
        "OTHER_LDFLAGS = " + singleQuotedLdflags + ";"
      );

      // xcodeproj gem "no parent for object .appex: Copy Files, Embed App Extensions": the .appex
      // file ref must be in a group that's in the project hierarchy. Ensure it's in Products.
      pbx = ensureAppexInProductsGroup(pbx, extensionName);

      // Force extension to Automatic signing so Xcode finds the profile we install at build time.
      pbx = forceExtensionAutomaticSigningInPbx(pbx, extensionName);

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

      const scriptBody = 'if [ -n \\"\\\\$EXT_PROVISIONING_PROFILE\\" ] && [ -f \\"\\\\$EXT_PROVISIONING_PROFILE\\" ]; then\\\\nmkdir -p \\"\\\\$HOME/Library/MobileDevice/Provisioning Profiles\\"\\\\ncp \\"\\\\$EXT_PROVISIONING_PROFILE\\" \\"\\\\$HOME/Library/MobileDevice/Provisioning Profiles/' + extensionName + '.mobileprovision\\"\\\\nelif [ -f /tmp/ext.mobileprovision ]; then\\\\nmkdir -p \\"\\\\$HOME/Library/MobileDevice/Provisioning Profiles\\"\\\\ncp /tmp/ext.mobileprovision \\"\\\\$HOME/Library/MobileDevice/Provisioning Profiles/' + extensionName + '.mobileprovision\\"\\\\nfi\\\\n';
      const phaseId = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
      const mainPhaseId = 'B2C3D4E5F60718293A4B5C6D7E8F90A1';
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
			shellScript = "${scriptBody}";
		};
		${mainPhaseId} /* Install Extension Profile (Main) */ = {
			isa = PBXShellScriptBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			inputPaths = (
			);
			name = "Install Extension Profile (Main)";
			outputPaths = (
			);
			runOnlyForDeploymentPostprocessing = 0;
			shellPath = /bin/sh;
			shellScript = "${scriptBody}";
		};
`;

      pbx = pbx.replace(
        /(\/\* Begin PBXShellScriptBuildPhase section \*\/)/,
        `$1${phaseBlock}`
      );

      // Add main app phase first so profile is installed before any target builds (EAS may build main before extension).
      const mainAppPattern = /(\/\*\s*GrabDocs\s*\*\/\s*=\s*\{[\s\S]*?buildPhases = \(\s*\n\s*)([A-F0-9]+\s*\/\*[^*]*\*\/,)/m;
      const mainAppMatch = pbx.match(mainAppPattern);
      if (mainAppMatch) {
        pbx = pbx.replace(mainAppMatch[0], mainAppMatch[1] + mainPhaseId + ' /* Install Extension Profile (Main) */,\n\t\t\t\t' + mainAppMatch[2]);
      }

      // Add our phase as the first build phase of the extension target.
      // Match the extension target by name (comment may be "Name" or Name) and prepend our phase.
      const extTargetName = extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const extPattern = new RegExp(
        '(\\/\\* ["]?' + extTargetName + '["]? \\*\\/\\s*=\\s*\\{[\\s\\S]*?buildPhases = \\(\\s*\\n\\s*)' +
        '([A-F0-9]+\\s*\\/\\*[^*]*\\*\\/,)',
        'm'
      );
      const extMatch = pbx.match(extPattern);
      if (extMatch) {
        pbx = pbx.replace(extMatch[0], extMatch[1] + phaseId + ' /* Install Extension Profile */,\n\t\t\t\t' + extMatch[2]);
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
/**
 * Safety net: re-apply main-target-only Podfile rules on disk (no extension target).
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
      contents = podfileEnsureNewArchDisabled(contents);
      contents = podfileRemoveExtensionBlock(contents, extensionName);
      contents = podfileInjectHMSWebRTCPin(contents);
      contents = podfileAddHmsPodToMainTarget(contents);
      contents = podfileInjectExtensionPodDependency(contents, extensionName);
      contents = podfileStripConditionalUseFrameworks(contents);
      fs.writeFileSync(podfilePath, contents);
      console.log('[ios-hms-screenshare] ✅ Podfile on disk: main target only + ' + HMS_POD_NAME + ' + post_integrate');
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
