#!/usr/bin/env node
// Usage: node scripts/patch-ext-profile.js <project.pbxproj path> <extension-profile-uuid>
// Finds all XCBuildConfiguration blocks belonging to the extension target
// and sets PROVISIONING_PROFILE to the supplied UUID and clears PROVISIONING_PROFILE_SPECIFIER.

const fs = require('fs');
const [,, pbxPath, extUUID] = process.argv;

if (!pbxPath || !extUUID) {
  console.error('Usage: node patch-ext-profile.js <project.pbxproj> <ext-uuid>');
  process.exit(1);
}

if (!fs.existsSync(pbxPath)) {
  console.log(`File not found: ${pbxPath}, skipping`);
  process.exit(0);
}

const EXT_BUNDLE = 'com.grabdocs.mobile.GrabDocsBroadcastUpload';
const content = fs.readFileSync(pbxPath, 'utf8');

// ---- Diagnostic: show all PROVISIONING_PROFILE lines before patch ----
console.log('=== PROVISIONING_PROFILE lines BEFORE patch ===');
content.split('\n').forEach((line, i) => {
  if (line.includes('PROVISIONING_PROFILE')) {
    console.log(`  L${i + 1}: ${line.trim()}`);
  }
});
console.log('=================================================');

// Match XCBuildConfiguration blocks.
// The pbxproj format indents with tabs; each block ends with \n\t\t};
// We match greedily per block using a split-and-reassemble approach
// to avoid catastrophic backtracking on large files.

// Case-insensitive hex — EAS may write lowercase UUIDs
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
      // End of block — patch if it belongs to extension
      if (blockHasExtBundle) {
        const originalBlock = blockLines.join('\n');
        let patchedBlock = originalBlock;

        // 1. Set or add PROVISIONING_PROFILE to the extension UUID (manual signing by UUID)
        if (/PROVISIONING_PROFILE = "[^"]*";/.test(patchedBlock)) {
          patchedBlock = patchedBlock.replace(
            /PROVISIONING_PROFILE = "[^"]*";/g,
            `PROVISIONING_PROFILE = "${extUUID}";`
          );
        } else {
          // Block has SPECIFIER but no PROVISIONING_PROFILE — add after CODE_SIGN_STYLE or PRODUCT_BUNDLE_IDENTIFIER
          if (/CODE_SIGN_STYLE = Manual;/.test(patchedBlock)) {
            patchedBlock = patchedBlock.replace(
              /(CODE_SIGN_STYLE = Manual;)/,
              `$1\n\t\t\t\tPROVISIONING_PROFILE = "${extUUID}";`
            );
          } else {
            patchedBlock = patchedBlock.replace(
              /(\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = "[^"]*";)/,
              `$1\n\t\t\t\tPROVISIONING_PROFILE = "${extUUID}";`
            );
          }
        }

        // 2. Remove PROVISIONING_PROFILE_SPECIFIER entirely so Xcode uses PROVISIONING_PROFILE (UUID) only.
        // Setting to "" can leave Xcode using the wrong profile; delete the line.
        patchedBlock = patchedBlock.replace(
          /\s*PROVISIONING_PROFILE_SPECIFIER = "[^"]*";\s*\n?/g,
          ''
        );
        // 3. Force Manual signing so the UUID we set is used
        patchedBlock = patchedBlock.replace(
          /CODE_SIGN_STYLE = Automatic;/g,
          'CODE_SIGN_STYLE = Manual;'
        );

        if (patchedBlock !== originalBlock) {
          changed = true;
          console.log(`✅ Patched extension XCBuildConfiguration block (PROVISIONING_PROFILE → ${extUUID}, SPECIFIER cleared)`);
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
  console.log('✅ project.pbxproj updated with extension provisioning profile UUID');

  // Show result
  const result = fs.readFileSync(pbxPath, 'utf8');
  console.log('=== PROVISIONING_PROFILE lines AFTER patch ===');
  result.split('\n').forEach((line, i) => {
    if (line.includes('PROVISIONING_PROFILE')) {
      console.log(`  L${i + 1}: ${line.trim()}`);
    }
  });
  console.log('================================================');
} else {
  console.error('⚠️  No extension XCBuildConfiguration blocks were patched.');
  console.error('This means the signing will remain incorrect. Dumping diagnostic info:');
  console.log('Dumping all XCBuildConfiguration block starts that mention GrabDocsBroadcastUpload or Broadcast:');
  let dump = false;
  let dumpLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (BLOCK_START.test(lines[i])) { dump = true; dumpLines = [lines[i]]; continue; }
    if (dump) {
      dumpLines.push(lines[i]);
      if (BLOCK_END.test(lines[i])) {
        if (dumpLines.some(l => l.includes('Broadcast') || l.includes('GrabDocsBroadcastUpload'))) {
          console.log(dumpLines.slice(0, 20).join('\n'));
          console.log('---');
        }
      dump = false;
    }
  }
  // Exit non-zero so we get diagnostic output; skip_profile_detection + Gymfile UUIDs may still allow build to succeed
  process.exit(1);
}
}
