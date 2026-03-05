#!/usr/bin/env node
// Usage: node scripts/patch-ext-profile.js <project.pbxproj path> <extension-profile-uuid>
// Finds all XCBuildConfiguration blocks belonging to the extension target
// and sets their PROVISIONING_PROFILE to the supplied UUID.

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

// Match individual XCBuildConfiguration blocks (each ends with \n\t\t};)
const blockRe = /(\t\t[0-9A-F]{24} \/\* [^*]+ \*\/ = \{[\s\S]*?isa = XCBuildConfiguration;[\s\S]*?\n\t\t\};)/g;

let changed = false;
const patched = content.replace(blockRe, (block) => {
  if (!block.includes(EXT_BUNDLE)) return block;

  let newBlock = block;

  if (/PROVISIONING_PROFILE = "[^"]*";/.test(newBlock)) {
    newBlock = newBlock.replace(
      /PROVISIONING_PROFILE = "[^"]*";/g,
      `PROVISIONING_PROFILE = "${extUUID}";`
    );
  } else {
    // Insert PROVISIONING_PROFILE before the closing }; of buildSettings
    newBlock = newBlock.replace(
      /(\s*CODE_SIGN_STYLE = Manual;)/,
      `$1\n\t\t\t\tPROVISIONING_PROFILE = "${extUUID}";`
    );
  }

  if (newBlock !== block) {
    changed = true;
    console.log(`Patched PROVISIONING_PROFILE → ${extUUID} in extension XCBuildConfiguration`);
  }
  return newBlock;
});

if (changed) {
  fs.writeFileSync(pbxPath, patched);
  console.log('✅ project.pbxproj updated with extension provisioning profile UUID');
} else {
  // Diagnostic: show what blocks exist for the extension
  const allBlocks = content.match(/\t\t[0-9A-F]{24} \/\* [^*]+ \*\/ = \{[\s\S]*?isa = XCBuildConfiguration;[\s\S]*?\n\t\t\};/g) || [];
  const extBlocks = allBlocks.filter(b => b.includes('GrabDocsBroadcastUpload'));
  if (extBlocks.length > 0) {
    console.log('Extension XCBuildConfiguration blocks found (no PROVISIONING_PROFILE to patch):');
    extBlocks.forEach(b => console.log(b.slice(0, 300)));
  } else {
    console.log('No extension XCBuildConfiguration blocks found — bundle ID may differ or blocks use different indentation');
    // Show any blocks containing "Broadcast"
    const broadcastBlocks = allBlocks.filter(b => b.includes('Broadcast'));
    if (broadcastBlocks.length > 0) {
      console.log('Blocks containing "Broadcast":');
      broadcastBlocks.forEach(b => console.log(b.slice(0, 300)));
    }
  }
}
