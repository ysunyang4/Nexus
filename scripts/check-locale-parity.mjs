import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.resolve(__dirname, '../apps/desktop/src/i18n/locales');

function parseKeys(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Simple regex parser for JS object keys
  const lines = content.split('\n');
  const keys = new Set();
  const stack = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('import') || trimmed.startsWith('export')) {
      continue;
    }
    
    // Check property definition: key: "value" or key: {
    const propMatch = trimmed.match(/^["']?([a-zA-Z0-9_\-]+)["']?\s*:\s*(.*)/);
    if (propMatch) {
      const key = propMatch[1];
      const rest = propMatch[2].trim();
      const currentPath = [...stack, key].join('.');
      keys.add(currentPath);

      if (rest.startsWith('{')) {
        stack.push(key);
      }
    }

    if (trimmed.endsWith('},') || trimmed.endsWith('}') || trimmed === '},' || trimmed === '}') {
      if (stack.length > 0) {
        stack.pop();
      }
    }
  }

  return keys;
}

const locales = ['en-US.ts', 'zh-CN.ts', 'ja-JP.ts', 'de-DE.ts'];
const keySets = {};

for (const loc of locales) {
  const fullPath = path.join(localesDir, loc);
  keySets[loc] = parseKeys(fullPath);
  console.log(`Parsed ${loc}: ${keySets[loc].size} keys`);
}

const baseKeys = keySets['en-US.ts'];
let hasError = false;

for (const loc of ['zh-CN.ts', 'ja-JP.ts', 'de-DE.ts']) {
  const targetKeys = keySets[loc];
  const missing = [...baseKeys].filter(k => !targetKeys.has(k));
  const extra = [...targetKeys].filter(k => !baseKeys.has(k));

  if (missing.length > 0) {
    console.error(`[FAIL] ${loc} is missing ${missing.length} keys from en-US:`);
    console.error(missing.slice(0, 10).join(', '));
    hasError = true;
  } else {
    console.log(`[PASS] ${loc} has all keys present in en-US.`);
  }

  if (extra.length > 0) {
    console.warn(`[INFO] ${loc} has ${extra.length} extra keys not in en-US:`);
    console.warn(extra.slice(0, 10).join(', '));
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('All 4 locales have 100% key parity with English base!');
  process.exit(0);
}
