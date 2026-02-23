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
const plist = require('@expo/plist');

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

function withBroadcastExtensionTarget(config, { appGroup, extensionName }) {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName || 'grabdocs';
    const bundleId = config.ios?.bundleIdentifier || 'com.grabdocs.mobile';
    const extBundleId = `${bundleId}.${extensionName}`;
    const buildNumber = config.ios?.buildNumber || '1';
    const version = config.version || '1.0.0';

    if (project.pbxNativeTargetSection && Object.keys(project.pbxNativeTargetSection()).length > 1) {
      return config;
    }

    const targetUuid = project.generateUuid();
    const groupName = 'Embed App Extensions';
    const quoted = (s) => `"${s}"`;

    const commonBuildSettings = {
      CLANG_ANALYZER_NONNULL: 'YES',
      CLANG_CXX_LANGUAGE_STANDARD: quoted('gnu++17'),
      CLANG_ENABLE_OBJC_WEAK: 'YES',
      CODE_SIGN_STYLE: 'Automatic',
      CURRENT_PROJECT_VERSION: buildNumber,
      GCC_C_LANGUAGE_STANDARD: 'gnu11',
      GENERATE_INFOPLIST_FILE: 'YES',
      INFOPLIST_FILE: `${extensionName}/Info.plist`,
      INFOPLIST_KEY_CFBundleDisplayName: extensionName,
      INFOPLIST_KEY_NSHumanReadableCopyright: quoted(''),
      IPHONEOS_DEPLOYMENT_TARGET: '14.0',
      LD_RUNPATH_SEARCH_PATHS: quoted('$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'),
      MARKETING_VERSION: version,
      MTL_FAST_MATH: 'YES',
      PRODUCT_BUNDLE_IDENTIFIER: quoted(extBundleId),
      PRODUCT_NAME: quoted('$(TARGET_NAME)'),
      SKIP_INSTALL: 'YES',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: quoted('1,2'),
      CODE_SIGN_ENTITLEMENTS: `${extensionName}/${extensionName}.entitlements`,
    };

    const buildConfigs = [
      {
        name: 'Debug',
        isa: 'XCBuildConfiguration',
        buildSettings: {
          ...commonBuildSettings,
          DEBUG_INFORMATION_FORMAT: 'dwarf',
          SWIFT_ACTIVE_COMPILATION_CONDITIONS: 'DEBUG',
          SWIFT_OPTIMIZATION_LEVEL: quoted('-Onone'),
        },
      },
      {
        name: 'Release',
        isa: 'XCBuildConfiguration',
        buildSettings: {
          ...commonBuildSettings,
          COPY_PHASE_STRIP: 'NO',
          DEBUG_INFORMATION_FORMAT: quoted('dwarf-with-dsym'),
          SWIFT_OPTIMIZATION_LEVEL: quoted('-Owholemodule'),
        },
      },
    ];

    const xcConfigList = project.addXCConfigurationList(
      buildConfigs,
      'Release',
      `Build configuration list for PBXNativeTarget ${quoted(extensionName)}`
    );

    const productFile = {
      basename: `${extensionName}.appex`,
      fileRef: project.generateUuid(),
      uuid: project.generateUuid(),
      group: groupName,
      explicitFileType: 'wrapper.app-extension',
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
      includeInIndex: 0,
      path: `${extensionName}.appex`,
      sourceTree: 'BUILT_PRODUCTS_DIR',
    };
    project.addToPbxFileReferenceSection(productFile);
    project.addToPbxBuildFileSection(productFile);

    const target = {
      uuid: targetUuid,
      pbxNativeTarget: {
        isa: 'PBXNativeTarget',
        buildConfigurationList: xcConfigList.uuid,
        buildPhases: [],
        buildRules: [],
        dependencies: [],
        name: extensionName,
        productName: extensionName,
        productReference: productFile.fileRef,
        productType: quoted('com.apple.product-type.app-extension'),
      },
    };
    project.addToPbxNativeTargetSection(target);
    project.addToPbxProjectSection(target);

    if (!project.hash.project.objects['PBXTargetDependency']) {
      project.hash.project.objects['PBXTargetDependency'] = {};
    }
    if (!project.hash.project.objects['PBXContainerItemProxy']) {
      project.hash.project.objects['PBXContainerItemProxy'] = {};
    }
    project.addTargetDependency(project.getFirstTarget().uuid, [target.uuid]);

    const replayKitFile = project.addFramework('ReplayKit.framework', {
      target: target.uuid,
      link: false,
    });

    const buildPath = quoted('');
    project.addBuildPhase(
      [`${extensionName}/SampleHandler.swift`],
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
      'app_extension',
      buildPath
    );
    project.addBuildPhase(
      [productFile.path],
      'PBXCopyFilesBuildPhase',
      groupName,
      project.getFirstTarget().uuid,
      'app_extension',
      buildPath
    );
    project.addBuildPhase(
      [replayKitFile.path],
      'PBXFrameworksBuildPhase',
      'Frameworks',
      target.uuid,
      'app_extension',
      buildPath
    );
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid, 'app_extension', buildPath);

    const { uuid: pbxGroupUuid } = project.addPbxGroup(
      [`${extensionName}/SampleHandler.swift`, `${extensionName}/Info.plist`, `${extensionName}/${extensionName}.entitlements`],
      extensionName,
      extensionName
    );
    const groups = project.hash.project.objects['PBXGroup'] || {};
    Object.keys(groups).forEach((key) => {
      if (groups[key].name === undefined && groups[key].path === undefined) {
        project.addToPbxGroup(pbxGroupUuid, key);
      } else if (groups[key].name === 'Products') {
        project.addToPbxGroup(productFile, key);
      }
    });

    return config;
  });
}

function withPodfileEntry(config, { extensionName }) {
  return withPodfile(config, (config) => {
    const data = config.modResults;
    // In Expo 54+, modResults is a plain string. Older versions used { contents: string }.
    const isString = typeof data === 'string';
    const contents = isString ? data : (data.contents || '');
    const podBlock = `
target '${extensionName}' do
  use_modular_headers!
  pod 'HMSBroadcastExtensionSDK'
end

`;
    if (!contents.includes(`target '${extensionName}'`)) {
      const insertPoint = contents.indexOf('target ');
      const newContents =
        insertPoint >= 0
          ? contents.slice(0, insertPoint) + podBlock + contents.slice(insertPoint)
          : podBlock + contents;
      // Preserve the original type so the mod compiler isn't confused
      config.modResults = isString ? newContents : { ...data, contents: newContents };
    }
    return config;
  });
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

  config = withBroadcastExtensionFiles(config, { appGroup, extensionName });
  config = withBroadcastExtensionTarget(config, { appGroup, extensionName });
  config = withPodfileEntry(config, { extensionName });
  config = withAppGroupEntitlements(config, { appGroup });

  if (!config.extra) config.extra = {};
  if (!config.extra.eas) config.extra.eas = {};
  if (!config.extra.eas.build) config.extra.eas.build = {};
  if (!config.extra.eas.build.experimental) config.extra.eas.build.experimental = {};
  if (!config.extra.eas.build.experimental.ios) config.extra.eas.build.experimental.ios = {};
  config.extra.eas.build.experimental.ios.appExtensions = [
    ...(config.extra.eas.build.experimental.ios.appExtensions || []),
    {
      targetName: extensionName,
      bundleIdentifier: `${config.ios?.bundleIdentifier || 'com.grabdocs.mobile'}.${extensionName}`,
      entitlements: {
        'com.apple.security.application-groups': [appGroup],
      },
    },
  ];

  return config;
}

module.exports = withHmsScreenshareExtension;
