import { describe, expect, it } from "vitest";
import { virtualPackageModules } from "@/lib/deployment/utils";
import { PACKAGE_CATALOG } from "@/lib/packages/catalog";
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

  it("provides a deployable source module for every virtual catalog package", () => {
    const virtualCatalogPackages = Object.entries(PACKAGE_CATALOG)
      .filter(([, entry]) => entry.packageType === "virtual")
      .map(([name]) => name)
      .sort();

    expect(Object.keys(virtualPackageModules).sort()).toEqual(
      virtualCatalogPackages
    );
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
