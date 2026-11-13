import { describe,it,expect } from "vitest";
import path from "node:path";
import {validatePathSandbox} from "../src/security.js";
describe("Open-source Bridge path containment",()=>{
 it("allows files inside root and blocks sibling prefix paths",()=>{
  const base=path.resolve("D:/examples/nexus-test-root");
  expect(validatePathSandbox(base,"docs/readme.md").valid).toBe(true);
  expect(validatePathSandbox(base,"../nexus-test-root-other/private.txt").valid).toBe(false);
  expect(validatePathSandbox(base,"../../outside.txt").valid).toBe(false);
 });
});
