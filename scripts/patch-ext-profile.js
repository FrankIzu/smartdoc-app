#!/usr/bin/env node
// Usage: node scripts/patch-ext-profile.js <project.pbxproj path> <extension-profile-uuid>
// After eas/configure_ios_credentials assigns the main-app profile to ALL targets,
// this script sets the extension target to Manual signing with the correct extension profile UUID.

const fs = require('fs');
const [,, pbxPath, extUUID] = process.argv;

if (!pbxPath || !extUUID) {
  console.error('Usage: node patch-ext-profile.js <project.pbxproj> <ext-profile-uuid>');
  process.exit(1);
}

if (!fs.existsSync(pbxPath)) {
  console.log(`File not found: ${pbxPath}, skipping`);
  process.exit(0);
}

const EXT_BUNDLE = 'com.grabdocs.mobile.GrabDocsBroadcastUpload';
const TEAM_ID = 'Q33K3Q7Q53';
const content = fs.readFileSync(pbxPath, 'utf8');

console.log('=== PROVISIONING_PROFILE / CODE_SIGN lines BEFORE patch ===');
content.split('\n').forEach((line, i) => {
  if (line.includes('PROVISIONING_PROFILE') || line.includes('CODE_SIGN_STYLE')) {
    console.log(`  L${i + 1}: ${line.trim()}`);
  }
});
console.log('===========================================================');

const BLOCK_START = /^\t\t[0-9A-Fa-f]{24} \/\* .+ \*\/ = \{$/;
const BLOCK_END = /^\t\t\};$/;

const lines = content.split('\n');
let changed = false;
let inBlock = false;
let blockLines = [];
let blockHasExtBundle = false;
const outLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (!inBlock && BLOCK_START.test(line)) {
    inBlock = true;
    blockLines = [line];
    blockHasExtBundle = false;
    continue;
  }

  if (inBlock) {
    blockLines.push(line);
    if (line.includes(EXT_BUNDLE)) blockHasExtBundle = true;

    if (BLOCK_END.test(line)) {
      if (blockHasExtBundle) {
        let patchedBlock = blockLines.join('\n');
        const originalBlock = patchedBlock;

        // 1. Force Manual signing for the extension target
        if (/CODE_SIGN_STYLE = Automatic;/.test(patchedBlock)) {
          patchedBlock = patchedBlock.replace(/CODE_SIGN_STYLE = Automatic;/g, 'CODE_SIGN_STYLE = Manual;');
        } else if (!/CODE_SIGN_STYLE/.test(patchedBlock)) {
          patchedBlock = patchedBlock.replace(
            /(\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = "[^"]*";)/,
            `$1\n\t\t\t\tCODE_SIGN_STYLE = Manual;`
          );
        }

        // 2. Set PROVISIONING_PROFILE to the extension UUID
        if (/PROVISIONING_PROFILE = "[^"]*";/.test(patchedBlock)) {
          patchedBlock = patchedBlock.replace(
            /PROVISIONING_PROFILE = "[^"]*";/g,
            `PROVISIONING_PROFILE = "${extUUID}";`
          );
        } else {
          // Add it after CODE_SIGN_STYLE
          patchedBlock = patchedBlock.replace(
            /(CODE_SIGN_STYLE = Manual;)/,
            `$1\n\t\t\t\tPROVISIONING_PROFILE = "${extUUID}";`
          );
        }

        // 3. Remove PROVISIONING_PROFILE_SPECIFIER (let UUID take precedence)
        patchedBlock = patchedBlock.replace(/\n?\t*PROVISIONING_PROFILE_SPECIFIER = "[^"]*";\n?/g, '\n');

        // 4. Ensure DEVELOPMENT_TEAM is present
        if (!patchedBlock.includes('DEVELOPMENT_TEAM')) {
          patchedBlock = patchedBlock.replace(
            /(CODE_SIGN_STYLE = Manual;)/,
            `$1\n\t\t\t\tDEVELOPMENT_TEAM = "${TEAM_ID}";`
          );
        }

        // Collapse double blank lines
        patchedBlock = patchedBlock.replace(/\n{3,}/g, '\n\n');

        if (patchedBlock !== originalBlock) {
          changed = true;
          console.log(`✅ Patched extension XCBuildConfiguration → Manual signing, PROVISIONING_PROFILE = ${extUUID}`);
        } else {
          console.log('Extension block found but no changes needed (already correct?)');
          console.log('Block snippet:', originalBlock.slice(0, 400));
        }
        outLines.push(...patchedBlock.split('\n'));
      } else {
        outLines.push(...blockLines);
      }

      inBlock = false;
      blockLines = [];
      continue;
    }
    continue;
  }

  outLines.push(line);
}

if (changed) {
  fs.writeFileSync(pbxPath, outLines.join('\n'));
  console.log('✅ project.pbxproj updated: extension target set to Manual signing with correct profile');

  const result = fs.readFileSync(pbxPath, 'utf8');
  console.log('=== PROVISIONING_PROFILE / CODE_SIGN lines AFTER patch ===');
  result.split('\n').forEach((line, i) => {
    if (line.includes('PROVISIONING_PROFILE') || line.includes('CODE_SIGN_STYLE')) {
      console.log(`  L${i + 1}: ${line.trim()}`);
    }
  });
  console.log('==========================================================');
} else {
  console.error('⚠️  No extension XCBuildConfiguration blocks were patched.');
  console.error('Dumping all blocks containing "Broadcast" or "GrabDocsBroadcastUpload":');
  let dump = false;
  let dumpLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (BLOCK_START.test(lines[i])) { dump = true; dumpLines = [lines[i]]; continue; }
    if (dump) {
      dumpLines.push(lines[i]);
      if (BLOCK_END.test(lines[i])) {
        if (dumpLines.some(l => l.includes('Broadcast') || l.includes('GrabDocsBroadcastUpload'))) {
          console.log(dumpLines.slice(0, 30).join('\n'));
          console.log('---');
        }
        dump = false;
      }
    }
  }
  process.exit(1);
}
