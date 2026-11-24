import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("Bundling bridge...");
const bridgeDist = path.join(__dirname, "dist/index.js");
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`,
  },
  outfile: bridgeDist,
});

const bridgeOut = "E:/workspace/release/verify_install/resources/bridge/index.js";
const desktopBridgeOut = "E:/workspace/cod/apps/desktop/src-tauri/resources/bridge/index.js";
fs.copyFileSync(bridgeDist, bridgeOut);
fs.copyFileSync(bridgeDist, desktopBridgeOut);

console.log("Bundling server...");
esbuild.buildSync({
  entryPoints: ["E:/workspace/cod/apps/server/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["better-sqlite3"],
  banner: {
    js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`,
  },
  outfile: "E:/workspace/release/verify_install/resources/server/index.js",
});

const serverOut = "E:/workspace/release/verify_install/resources/server/index.js";
const desktopServerOut = "E:/workspace/cod/apps/desktop/src-tauri/resources/server/index.js";
fs.copyFileSync(serverOut, desktopServerOut);

console.log("Bundling completed successfully!");
