import fs from 'fs';
import path from 'path';

const GITHUB_TOKEN = process.env.GH_TOKEN;
const OWNER = 'ysunyang4';
const REPO = 'Nexus';
const TAG = process.argv[2] || process.env.RELEASE_TAG;

const filePath = 'D:/Geek_AI/Nexus1.3.4/apps/desktop/src-tauri/target/release/bundle/nsis/Nexus_1.3.4_x64-setup.exe';
const fileName = 'Nexus_1.3.4_x64-setup.exe';

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('Error: GH_TOKEN environment variable is required.');
    process.exit(1);
  }
  if (!TAG) {
    console.error('Error: Release tag must be provided via CLI argument or RELEASE_TAG environment variable.');
    process.exit(1);
  }

  console.log(`Target release: ${OWNER}/${REPO} tag=${TAG}, asset=${fileName}`);
  if (process.env.CONFIRM_RELEASE_UPLOAD !== 'yes') {
    console.error('Aborted: set CONFIRM_RELEASE_UPLOAD=yes to confirm release asset upload.');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Installer file not found at ${filePath}`);
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  console.log(`Target installer exists: ${filePath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'Nexus-Release-Bot',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 1. Get release info
  const relRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, { headers });
  if (!relRes.ok) {
    throw new Error(`Failed to get release: ${relRes.status} ${await relRes.text()}`);
  }
  const release = await relRes.json();
  console.log(`Release found: ID ${release.id}, tag ${release.tag_name}, upload_url: ${release.upload_url}`);

  // 2. Remove existing asset with same name if any
  for (const asset of release.assets) {
    if (asset.name === fileName) {
      console.log(`Deleting existing asset ${asset.id} (${asset.name})...`);
      const delRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`, {
        method: 'DELETE',
        headers,
      });
      console.log(`Delete response: ${delRes.status}`);
    }
  }

  // 3. Upload new asset
  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);
  console.log(`Uploading to ${uploadUrl}...`);

  const fileStream = fs.readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size.toString(),
    },
    body: fileStream,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  const newAsset = await uploadRes.json();
  console.log(`Upload succeeded! Asset ID: ${newAsset.id}, URL: ${newAsset.browser_download_url}`);

  // 4. Ensure release is marked latest
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${release.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ make_latest: 'true' })
  });
  console.log('Release updated to latest.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
