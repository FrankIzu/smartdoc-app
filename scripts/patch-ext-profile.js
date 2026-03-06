#!/usr/bin/env node
// Usage: node scripts/patch-ext-profile.js <project.pbxproj path>
// After EAS configure_ios_credentials assigns the main-app profile to ALL targets,
// this script resets the extension target to Automatic signing so Xcode handles it.

const fs = require('fs');
const [,, pbxPath] = process.argv;

if (!pbxPath) {
  console.error('Usage: node patch-ext-profile.js <project.pbxproj>');
  process.exit(1);
}

if (!fs.existsSync(pbxPath)) {
  console.log(`File not found: ${pbxPath}, skipping`);
  process.exit(0);
}

const EXT_BUNDLE = 'com.grabdocs.mobile.GrabDocsBroadcastUpload';
const TEAM_ID = 'Q33K3Q7Q53';
const content = fs.readFileSync(pbxPath, 'utf8');

console.log('=== CODE_SIGN_STYLE / PROVISIONING_PROFILE lines BEFORE patch ===');
content.split('\n').forEach((line, i) => {
  if (line.includes('CODE_SIGN_STYLE') || line.includes('PROVISIONING_PROFILE')) {
    console.log(`  L${i + 1}: ${line.trim()}`);
  }
});
console.log('=================================================================');

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

        // 1. Set CODE_SIGN_STYLE to Automatic (override Manual that EAS set)
        if (/CODE_SIGN_STYLE = Manual;/.test(patchedBlock)) {
          patchedBlock = patchedBlock.replace(/CODE_SIGN_STYLE = Manual;/g, 'CODE_SIGN_STYLE = Automatic;');
        } else if (!/CODE_SIGN_STYLE/.test(patchedBlock)) {
          patchedBlock = patchedBlock.replace(
            /(\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = "[^"]*";)/,
            `$1\n\t\t\t\tCODE_SIGN_STYLE = Automatic;`
          );
        }

        // 2. Remove PROVISIONING_PROFILE (UUID) — not needed for automatic signing
        patchedBlock = patchedBlock.replace(/\n?\t*PROVISIONING_PROFILE = "[^"]*";\n?/g, '\n');

        // 3. Remove PROVISIONING_PROFILE_SPECIFIER — let Xcode auto-pick
        patchedBlock = patchedBlock.replace(/\n?\t*PROVISIONING_PROFILE_SPECIFIER = "[^"]*";\n?/g, '\n');

        // 4. Remove CODE_SIGN_IDENTITY if explicitly set (let Xcode auto-pick)
        patchedBlock = patchedBlock.replace(/\n?\t*CODE_SIGN_IDENTITY = "[^"]*";\n?/g, '\n');

        // 5. Ensure DEVELOPMENT_TEAM is set (required for automatic signing)
        if (!patchedBlock.includes('DEVELOPMENT_TEAM')) {
          patchedBlock = patchedBlock.replace(
            /(\t\t\t\tCODE_SIGN_STYLE = Automatic;)/,
            `$1\n\t\t\t\tDEVELOPMENT_TEAM = "${TEAM_ID}";`
          );
        }

        // 6. Ensure CODE_SIGNING_ALLOWED = YES (not NO)
        if (/CODE_SIGNING_ALLOWED = NO;/.test(patchedBlock)) {
          patchedBlock = patchedBlock.replace(/CODE_SIGNING_ALLOWED = NO;/g, 'CODE_SIGNING_ALLOWED = YES;');
        }

        // Collapse any double blank lines introduced by deletions
        patchedBlock = patchedBlock.replace(/\n{3,}/g, '\n\n');

        if (patchedBlock !== originalBlock) {
          changed = true;
          console.log('✅ Patched extension XCBuildConfiguration block → Automatic signing, removed manual profile refs');
        } else {
          console.log('Extension block found but no changes needed (already Automatic?)');
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
  console.log('✅ project.pbxproj updated: extension target set to Automatic signing');

  const result = fs.readFileSync(pbxPath, 'utf8');
  console.log('=== CODE_SIGN_STYLE / PROVISIONING_PROFILE lines AFTER patch ===');
  result.split('\n').forEach((line, i) => {
    if (line.includes('CODE_SIGN_STYLE') || line.includes('PROVISIONING_PROFILE')) {
      console.log(`  L${i + 1}: ${line.trim()}`);
    }
  });
  console.log('================================================================');
} else {
  console.warn('⚠️  No extension XCBuildConfiguration blocks were patched.');
  console.warn('Dumping all blocks containing "Broadcast" or "GrabDocsBroadcastUpload":');
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
