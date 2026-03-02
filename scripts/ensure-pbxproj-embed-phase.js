#!/usr/bin/env node
/**
 * Standalone script: ensures the Broadcast Upload Extension .appex is in a phase
 * named "Embed App Extensions" with dstSubfolderSpec = 13. CocoaPods requires this
 * to resolve the host target. Run after `expo prebuild`, before `pod install`.
 *
 * Works as a safety net when the plugin's pbxproj patch doesn't match the CI project.
 *
 * Usage: node scripts/ensure-pbxproj-embed-phase.js
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'GrabDocsBroadcastUpload';

function fixExtensionEmbedPhaseForCocoaPods(pbx, extensionName) {
  const escapedAppex = extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.appex';

  const anyPhaseWithAppexRe = new RegExp(
    '\t\t([0-9A-F]{24})\\s*\\/\\*\\s*[^*]*\\*\\/\\s*=\\s*\\{\\s*\\n\\s*isa = PBXCopyFilesBuildPhase;[\\s\\S]*?files = \\([\\s\\S]*?' +
      escapedAppex +
      '[\\s\\S]*?\\);[\\s\\S]*?runOnlyForDeploymentPostprocessing = [^\\n]+\\n\\s*name = "([^"]*)";[\\s\\S]*?dstSubfolderSpec = ([0-9]+);',
    'g'
  );
  const phases = [];
  let m;
  while ((m = anyPhaseWithAppexRe.exec(pbx)) !== null) {
    phases.push({ uuid: m[1], name: m[2], dstSubfolderSpec: m[3] });
  }
  if (phases.length === 0) return { pbx, changed: false };

  const correctPhase = phases.find((p) => p.name === 'Embed App Extensions' && p.dstSubfolderSpec === '13');
  const wrongPhases = phases.filter((p) => p.name !== 'Embed App Extensions' || p.dstSubfolderSpec !== '13');

  if (correctPhase && wrongPhases.length > 0) {
    for (const p of wrongPhases) {
      const phaseUuid = p.uuid;
      const phaseRefPattern = new RegExp(
        '\\s*' + phaseUuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\/\\*\\s*[^*]*\\*\\/,\\n?',
        'g'
      );
      const grabDocsBuildPhasesRe = new RegExp(
        '(\\/\\*\\s*GrabDocs\\s*\\*\\/\\s*=\\s*\\{[\\s\\S]*?buildPhases = \\()([\\s\\S]*?)(\\n\\s*\\);\\s*\\n\\s*buildRules)',
        'g'
      );
      pbx = pbx.replace(grabDocsBuildPhasesRe, (_, prefix, buildPhasesContent, suffix) => {
        const newBuildPhases = buildPhasesContent.replace(phaseRefPattern, '');
        return prefix + newBuildPhases + suffix;
      });
      const phaseBlockRe = new RegExp(
        '\t\t' + phaseUuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\/\\*\\s*[^*]*\\*\\/\\s*=\\s*\\{[\\s\\S]*?\\};\\n?',
        'g'
      );
      pbx = pbx.replace(phaseBlockRe, '');
    }
  }

  if (!correctPhase) {
    for (const p of wrongPhases) {
      const phaseUuid = p.uuid;
      const escapedUuid = phaseUuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (p.dstSubfolderSpec) {
        pbx = pbx.replace(
          new RegExp(
            '(' + escapedUuid + '\\s*\\/\\*\\s*)[^*]*(\\*\\/\\s*=\\s*\\{[\\s\\S]*?name = ")[^"]*(";[\\s\\S]*?dstSubfolderSpec = )(\\d+)(;)',
            'g'
          ),
          (_, a, b, c, _num, d) => a + 'Embed App Extensions' + b + 'Embed App Extensions' + c + '13' + d
        );
      } else {
        pbx = pbx.replace(
          new RegExp(
            '(' + escapedUuid + '\\s*\\/\\*\\s*)[^*]*(\\*\\/\\s*=\\s*\\{[\\s\\S]*?name = ")[^"]*(";[\\s\\S]*?)(\\n\\s*\\};)',
            'g'
          ),
          '$1Embed App Extensions$2Embed App Extensions$3dstSubfolderSpec = 13;$4'
        );
      }
      pbx = pbx.replace(
        new RegExp(
          '(' + escapedUuid + '\\s*\\/\\*\\s*)[^*]*(\\s*\\*\\/)(?!\\s*=\\s*\\{)',
          'g'
        ),
        '$1Embed App Extensions$2'
      );
    }
  }

  return { pbx, changed: true };
}

const iosDir = path.join(process.cwd(), 'ios');
if (!fs.existsSync(iosDir)) {
  console.log('[ensure-pbxproj-embed-phase] ios/ not found — skipping');
  process.exit(0);
}

const xcodeproj = fs.readdirSync(iosDir).find((f) => f.endsWith('.xcodeproj'));
if (!xcodeproj) {
  console.log('[ensure-pbxproj-embed-phase] No .xcodeproj in ios/ — skipping');
  process.exit(0);
}

const pbxPath = path.join(iosDir, xcodeproj, 'project.pbxproj');
if (!fs.existsSync(pbxPath)) {
  console.log('[ensure-pbxproj-embed-phase] project.pbxproj not found — skipping');
  process.exit(0);
}

let pbx = fs.readFileSync(pbxPath, 'utf8');
const result = fixExtensionEmbedPhaseForCocoaPods(pbx, EXTENSION_NAME);

if (result.changed) {
  fs.writeFileSync(pbxPath, result.pbx);
  console.log('[ensure-pbxproj-embed-phase] ✅ Patched project.pbxproj: Embed App Extensions phase fixed for CocoaPods');
} else {
  console.log('[ensure-pbxproj-embed-phase] No change needed (phase already correct or no extension phase found)');
}
