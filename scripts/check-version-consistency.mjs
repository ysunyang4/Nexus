import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rootPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const expectedVersion = rootPackageJson.version; // '1.3.4'
console.log(`Root version: ${expectedVersion}`);

const appsDir = path.join(rootDir, 'apps');
const versionRegex = /1\.3\.(\d+)/g;

let violations = [];

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'target', '.git', 'out', 'build', 'resources', 'extension'].includes(entry.name)) {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      if (['.png', '.jpg', '.ico', '.exe', '.lock', '.zip', '.map'].some(ext => entry.name.endsWith(ext))) {
        continue;
      }
      if (entry.name === 'pnpm-lock.yaml' || entry.name.includes('package-lock')) {
        continue;
      }
      
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        let match;
        while ((match = versionRegex.exec(content)) !== null) {
          const found = match[0];
          // We only fail if it's a version string starting with 1.3. that is NOT 1.3.4 (e.g. 1.3.1, 1.3.2, 1.3.5)
          // Exclude valid semver ranges, IP addresses, dates, hashes, etc.
          if (found !== expectedVersion) {
            // Check context to avoid false positives (e.g. IP 1.3.x.x, random decimals)
            const preChar = match.index > 0 ? content[match.index - 1] : '';
            const postChar = match.index + found.length < content.length ? content[match.index + found.length] : '';
            
            // If preceded or followed by digit/dot, might be IP or float
            if (!/^\d$/.test(preChar) && postChar !== '.' && !/^\d$/.test(postChar)) {
              violations.push({
                file: path.relative(rootDir, fullPath),
                found,
                expected: expectedVersion,
                line: content.substring(0, match.index).split('\n').length
              });
            }
          }
        }
      } catch {}
    }
  }
}

scanDirectory(appsDir);

if (violations.length > 0) {
  console.error(`[FAIL] Found ${violations.length} hardcoded version inconsistencies under apps/:`);
  for (const v of violations.slice(0, 20)) {
    console.error(`  ${v.file}:${v.line} -> Found '${v.found}', expected '${v.expected}'`);
  }
  process.exit(1);
} else {
  console.log(`[PASS] All version references under apps/ strictly match root version ${expectedVersion}!`);
  process.exit(0);
}
