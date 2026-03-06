#!/usr/bin/env node
// Ensures ios/GrabDocsBroadcastUpload/GrabDocsBroadcastUpload.entitlements
// contains com.apple.security.application-groups with group.com.grabdocs.mobile.
// Run from repo root after prebuild.

const fs = require('fs');
const path = require('path');

const EXT_REL = 'ios/GrabDocsBroadcastUpload';
const ENTITLEMENTS_NAME = 'GrabDocsBroadcastUpload.entitlements';
const APP_GROUP = 'group.com.grabdocs.mobile';

const extDir = path.join(process.cwd(), EXT_REL);
const entPath = path.join(extDir, ENTITLEMENTS_NAME);

const PLIST_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>${APP_GROUP}</string>
	</array>
</dict>
</plist>
`;

function ensureEntitlements() {
  if (!fs.existsSync(extDir)) {
    console.log('Extension dir not found:', extDir, '- skipping entitlements check');
    return;
  }

  const existing = fs.existsSync(entPath) ? fs.readFileSync(entPath, 'utf8') : '';
  if (existing.includes('com.apple.security.application-groups') && existing.includes(APP_GROUP)) {
    console.log('Extension entitlements already contain', APP_GROUP);
    return;
  }

  fs.writeFileSync(entPath, PLIST_CONTENT, 'utf8');
  console.log('Wrote', entPath, 'with com.apple.security.application-groups:', APP_GROUP);
}

ensureEntitlements();
