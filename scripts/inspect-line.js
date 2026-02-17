const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'submit-ios-local.ps1');
const raw = fs.readFileSync(p);
console.log('BOM/First bytes:', raw.slice(0, 4));
const content = raw.toString('utf8');
const lines = content.split(/\r?\n/);
lines.forEach((L, idx) => {
  const n = (L.match(/"/g) || []).length;
  if (n % 2 !== 0) console.log('Line', idx + 1, 'odd number of ASCII double-quotes:', n, L.slice(0, 60));
});
console.log('Done.');
