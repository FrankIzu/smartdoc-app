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
const { execSync } = require('child_process');
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
      project.addBuildPhase([], 'PBXCopyFilesBuildPhase', 'Copy Files', mainTarget.uuid, 'app_extension');
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

/**
 * Unique anchor: the "  post_install do" line inside the main target.
 * We insert the extension block BEFORE post_install so CocoaPods sees it
 * unambiguously as a nested sibling target, not a call after a DSL hook.
 * Falls back to "  end\nend" at end of file if post_install is absent.
 */
const PODFILE_PRE_POST_INSTALL_2 = /\n  post_install\b/;
const PODFILE_PRE_POST_INSTALL_4 = /\n    post_install\b/;
const PODFILE_MAIN_TARGET_END  = /  end\s*\r?\nend\s*$/;

function podfileInsertExtensionBlock(contents, extensionName, tag) {
  const newBlock = [
    '# @generated begin ' + tag + ' - expo prebuild (DO NOT MODIFY) sync-f159178a1fba6c4b1532a9d27cbb08ddbe3d5827',
    "  target '" + extensionName + "' do",
    '    inherit! :search_paths',
    '    use_modular_headers!',
    "    pod 'HMSBroadcastExtensionSDK'",
    '  end',
    '# @generated end ' + tag,
  ].join('\n');

  if (PODFILE_PRE_POST_INSTALL_2.test(contents)) {
    return contents.replace(PODFILE_PRE_POST_INSTALL_2, '\n' + newBlock + '\n\n  post_install');
  }
  if (PODFILE_PRE_POST_INSTALL_4.test(contents)) {
    return contents.replace(PODFILE_PRE_POST_INSTALL_4, '\n' + newBlock + '\n\n    post_install');
  }
  if (PODFILE_MAIN_TARGET_END.test(contents)) {
    return contents.replace(PODFILE_MAIN_TARGET_END, '  end\n' + newBlock + '\nend');
  }
  return contents;
}

/**
 * Add the extension target nested inside the main app target.
 * Uses the unique "  end\nend" at end of Podfile (post_install + target close) so we never insert inside def ccache_enabled?.
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
    let srcToPatch = src;
    if (src.includes('# @generated begin ' + tag)) {
      const mainTargetStart = src.indexOf("target 'GrabDocs' do");
      const extBlockStart = src.indexOf("  target '" + extensionName + "' do");
      if (mainTargetStart >= 0 && extBlockStart > mainTargetStart) {
        console.log('[ios-hms-screenshare] ✅ withPodfile: already merged');
        return config;
      }
      // Tag present but in wrong place — remove block then re-insert below.
      srcToPatch = src.replace(
        new RegExp('# @generated begin ' + tag + '[\\s\\S]*?# @generated end ' + tag + '\\s*\\n?', 'g'),
        ''
      );
    }

    const hasAnchor = PODFILE_PRE_POST_INSTALL_2.test(srcToPatch) || PODFILE_PRE_POST_INSTALL_4.test(srcToPatch) || PODFILE_MAIN_TARGET_END.test(srcToPatch);
    if (!hasAnchor) {
      console.error('[ios-hms-screenshare] ❌ Podfile missing "post_install" or "  end\\nend" anchors.');
      throw new Error('[ios-hms-screenshare] Could not find insertion point in Podfile for ' + extensionName + '.');
    }

    const resultContents = podfileInsertExtensionBlock(srcToPatch, extensionName, tag);
    console.log('[ios-hms-screenshare] ✅ withPodfile: extension block inserted (before post_install).');
    if (typeof data === 'string') {
      config.modResults = resultContents;
    } else {
      config.modResults = { ...data, contents: resultContents };
    }
    return config;
  });
}

/**
 * Safety net: if withPodfile didn't run or Podfile was written later, patch on disk.
 * Uses same "  end\nend" pattern so extension is always inside main target.
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

      // If already merged in the right place (inside main target), skip.
      const mainTargetStart = contents.indexOf("target 'GrabDocs' do");
      const extBlockStart = contents.indexOf("  target '" + extensionName + "' do");
      const alreadyCorrect =
        contents.includes('# @generated begin ' + tag) &&
        mainTargetStart >= 0 &&
        extBlockStart > mainTargetStart;
      if (alreadyCorrect) {
        console.log('[ios-hms-screenshare] ✅ withPodfileDangerousPatch: already merged');
        return config;
      }
      // If tag exists but in wrong place (e.g. inside def ccache_enabled?), remove it then re-insert.
      let contentsToPatch = contents;
      if (contents.includes('# @generated begin ' + tag)) {
        contentsToPatch = contents.replace(
          new RegExp('# @generated begin ' + tag + '[\\s\\S]*?# @generated end ' + tag + '\\s*\\n?', 'g'),
          ''
        );
      }

      const hasAnchor = PODFILE_PRE_POST_INSTALL_2.test(contentsToPatch) || PODFILE_PRE_POST_INSTALL_4.test(contentsToPatch) || PODFILE_MAIN_TARGET_END.test(contentsToPatch);
      if (!hasAnchor) {
        console.error('[ios-hms-screenshare] ❌ withDangerousMod: Podfile missing anchors.\n' + contentsToPatch);
        throw new Error('[ios-hms-screenshare] withDangerousMod: anchor not found in Podfile for ' + extensionName);
      }

      const resultContents = podfileInsertExtensionBlock(contentsToPatch, extensionName, tag);
      fs.writeFileSync(podfilePath, resultContents);
      console.log('[ios-hms-screenshare] ✅ withDangerousMod: Podfile patched on disk');
      // Guarantee nesting by running patch-ios-podfile.js (idempotent).
      const projectRoot = config.modRequest.projectRoot;
      const patchScript = path.join(projectRoot, 'scripts', 'patch-ios-podfile.js');
      if (fs.existsSync(patchScript)) {
        try {
          execSync(`node "${patchScript}"`, { cwd: projectRoot, stdio: 'inherit' });
        } catch (e) {
          console.warn('[ios-hms-screenshare] patch-ios-podfile.js failed (non-fatal):', e.message);
        }
      }
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
  config = withPodfileDangerousPatch(config, podfileOpts);
  config = withAppGroupEntitlements(config, { appGroup });

  // expo.ios.appExtensions in app.json declares the extension to EAS so that
  // `eas credentials` shows it and manages a provisioning profile for it.
  // The plugin handles source files, Info.plist, entitlements, and Podfile — it
  // skips target creation when appExtensions has already created the target, but
  // always overwrites the build settings so HMS-specific values win.

  return config;
}

module.exports = withHmsScreenshareExtension;
