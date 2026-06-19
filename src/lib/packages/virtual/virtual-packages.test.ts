import { describe, expect, it } from "vitest";
import { virtualPackageModules } from "@/lib/deployment/utils";
import * as ffmpeg from "@/lib/packages/virtual/ffmpeg";

describe("virtual package modules", () => {
  function exportedNames(code: string) {
    const directExports = Array.from(
      code.matchAll(/export\s+(?:async\s+)?(?:const|function|class)\s+(\w+)/g),
      (match) => match[1]
    );
    const blockExports = Array.from(
      code.matchAll(/export\s*{([^}]+)}/g),
      (match) =>
        match[1].split(",").map(
          (name) =>
            name
              .trim()
              .split(/\s+as\s+/)
              .at(-1) ?? ""
        )
    ).flat();
    return [...directExports, ...blockExports].sort();
  }

  it("lists ffmpeg as a deployable virtual package", () => {
    expect(Object.keys(virtualPackageModules)).toEqual(["ffmpeg"]);
  });

  it("exports the ffmpeg source module surface", () => {
    const code = virtualPackageModules["ffmpeg"];
    const sourceExportNames = Object.getOwnPropertyNames(ffmpeg)
      .filter((k) => k !== "default")
      .sort();

    expect(code).toBeDefined();
    expect(exportedNames(code!)).toEqual(sourceExportNames);
  });
});
