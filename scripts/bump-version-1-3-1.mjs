import fs from "node:fs";

const jsonFiles = [
  "package.json",
  "apps/desktop/package.json",
  "apps/runner/package.json",
  "apps/server/package.json",
  "packages/protocol/package.json",
  "packages/security/package.json",
  "packages/shared/package.json",
];

for (const f of jsonFiles) {
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  data.version = "1.3.1";
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Updated ${f} to 1.3.1`);
}

// tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync("apps/desktop/src-tauri/tauri.conf.json", "utf8"));
tauriConf.version = "1.3.1";
fs.writeFileSync("apps/desktop/src-tauri/tauri.conf.json", JSON.stringify(tauriConf, null, 2) + "\n", "utf8");
console.log("Updated tauri.conf.json to 1.3.1");

// Cargo.toml
let cargo = fs.readFileSync("apps/desktop/src-tauri/Cargo.toml", "utf8");
cargo = cargo.replace('version = "1.3.0"', 'version = "1.3.1"');
fs.writeFileSync("apps/desktop/src-tauri/Cargo.toml", cargo, "utf8");
console.log("Updated Cargo.toml to 1.3.1");

// bridge index.ts & server.ts
let bridgeIdx = fs.readFileSync("apps/bridge/src/index.ts", "utf8");
bridgeIdx = bridgeIdx.replaceAll('"1.3.0"', '"1.3.1"');
fs.writeFileSync("apps/bridge/src/index.ts", bridgeIdx, "utf8");
console.log("Updated apps/bridge/src/index.ts to 1.3.1");

let bridgeSrv = fs.readFileSync("apps/bridge/src/server.ts", "utf8");
bridgeSrv = bridgeSrv.replaceAll('"1.3.0"', '"1.3.1"');
fs.writeFileSync("apps/bridge/src/server.ts", bridgeSrv, "utf8");
console.log("Updated apps/bridge/src/server.ts to 1.3.1");

// UI components
const uiFiles = [
  "apps/desktop/src/components/Sidebar.tsx",
  "apps/desktop/src/components/StartupScreen.tsx",
  "apps/desktop/src/pages/ConnectionsPage.tsx",
  "apps/desktop/src/pages/ControlPage.tsx",
  "apps/desktop/src/pages/execution/RuntimePage.tsx",
];
for (const f of uiFiles) {
  let content = fs.readFileSync(f, "utf8");
  content = content.replaceAll("1.3.0", "1.3.1");
  fs.writeFileSync(f, content, "utf8");
  console.log(`Updated ${f} to 1.3.1`);
}
