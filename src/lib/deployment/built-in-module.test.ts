import { describe, it, expect } from "vitest";
import { generateBuiltInModule } from "@/lib/deployment/built-in-module";
import * as runtime from "@/lib/operations/runtime";

describe("generateBuiltInModule", () => {
  function exportedNames() {
    return Array.from(
      generateBuiltInModule().matchAll(/export\s+(?:const|function)\s+(\w+)/g),
      (match) => match[1]
    ).sort();
  }

  it("is deterministic", () => {
    expect(generateBuiltInModule()).toBe(generateBuiltInModule());
  });

  const runtimeExportNames = Object.getOwnPropertyNames(runtime)
    .filter((k) => k !== "default")
    .sort();

  it("exports the runtime surface used by generated operations", () => {
    expect(exportedNames()).toEqual(runtimeExportNames);
  });

  it("imports remeda purry because generated curried helpers depend on it", () => {
    expect(generateBuiltInModule()).toContain('import { purry } from "remeda"');
  });

  it("clones Request/Response instances before reading body content", () => {
    const code = generateBuiltInModule();
    expect(code).toContain("instance.clone().json()");
    expect(code).toContain("instance.clone().text()");
  });

  it("uses URL parsing for request query and path helpers", () => {
    const code = generateBuiltInModule();
    expect(code).toContain("new URL(request.url).searchParams.get(paramName)");
    expect(code).toContain("new URL(request.url).pathname");
  });

  it("supports fetch overloads for direct and curried invocation", () => {
    const code = generateBuiltInModule();
    expect(code).toContain("globalThis.fetch(args[0], args[1])");
    expect(code).toContain("return (url) => globalThis.fetch(url, args[0])");
    expect(code).toContain("return (url) => globalThis.fetch(url)");
  });
});
