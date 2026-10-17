const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const version = String(process.env.VERSION || process.env.GITHUB_REF_NAME || '').replace(/^v/, '');
let notes = '';
try {
  notes = execSync('git log -1 --pretty=%B').toString().trim();
} catch {}

const out = path.join(__dirname, '..', 'desktop', 'whatsnew.json');
fs.writeFileSync(out, JSON.stringify({ version, notes }, null, 2), 'utf8');
console.log(`[whatsnew] ${out} (versao ${version})`);