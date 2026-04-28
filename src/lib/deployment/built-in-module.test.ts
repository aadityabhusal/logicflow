import { describe, it, expect } from "vitest";
import { generateBuiltInModule } from "@/lib/deployment/built-in-module";

describe("generateBuiltInModule", () => {
  it("returns a non-empty string", () => {
    const result = generateBuiltInModule();
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the same string on repeated calls (deterministic)", () => {
    const first = generateBuiltInModule();
    const second = generateBuiltInModule();
    expect(first).toBe(second);
  });

  it("contains remeda import", () => {
    expect(generateBuiltInModule()).toContain('import { purry } from "remeda"');
  });

  it("starts with import statement", () => {
    expect(generateBuiltInModule().trimStart().startsWith("import")).toBe(true);
  });

  it("contains export statements", () => {
    const result = generateBuiltInModule();
    expect(result).toContain("export const");
  });

  const keyExports = [
    "pipeAsync",
    "length",
    "includes",
    "fetch",
    "not",
    "and",
    "or",
    "thenElse",
    "getUrl",
    "getMethod",
    "getHeader",
    "getQuery",
    "getStatus",
    "getPath",
    "log",
  ];

  it.each(keyExports)("contains key export: %s", (name) => {
    expect(generateBuiltInModule()).toContain(name);
  });

  describe("additional exports", () => {
    const runtimeExports = ["lessThan", "concat", "join", "get"];

    it.each(runtimeExports)("contains runtime export: %s", (name) => {
      expect(generateBuiltInModule()).toContain(name);
    });
  });

  it("produces module code that starts with an import", () => {
    const code = generateBuiltInModule();
    expect(code.trimStart().startsWith("import")).toBe(true);
  });

  it("contains pipeAsync export", () => {
    const code = generateBuiltInModule();
    expect(code).toContain("pipeAsync");
  });
});
