import child_process from "node:child_process";

console.log("================================================================================");
console.log("            NEXUS 1.3.0 COMPREHENSIVE INTEGRATION & REGRESSION TEST             ");
console.log("================================================================================\n");

function runCommand(cmd: string, args: string[]) {
  console.log(`> Running: ${cmd} ${args.join(" ")}\n`);
  const res = child_process.spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
  });
  if (res.status !== 0) {
    console.error(`Command failed with exit code ${res.status}`);
    process.exit(res.status || 1);
  }
}

// 1. Run Token Optimization & Script Runner E2E Test
runCommand("npx", ["tsx", "tests/token-optimization-e2e.test.ts"]);

// 2. Run MCP Protocol & Dispatcher E2E Test
runCommand("npx", ["tsx", "tests/mcp-server-protocol.test.ts"]);

console.log("================================================================================");
console.log("            ALL TEST SUITES EXECUTED AND PASSED CLEANLY (100% SUCCESS)          ");
console.log("================================================================================\n");
process.exit(0);
