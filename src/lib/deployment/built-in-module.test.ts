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
  ];

  it.each(keyExports)("contains key export: %s", (name) => {
    expect(generateBuiltInModule()).toContain(name);
  });
});
