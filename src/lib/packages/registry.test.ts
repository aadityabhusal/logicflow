import { describe, it, expect, beforeEach } from "vitest";
import {
  PACKAGE_REGISTRY,
  SOURCE_PACKAGE_MAP,
  loadPackage,
  unloadPackage,
  resetPackageRegistry,
  loadedPackageOperations,
  getAllInstanceTypes,
} from "./registry";
import { PACKAGE_CATALOG, getPackageSourceNames } from "./catalog";

describe("PACKAGE_REGISTRY derivation", () => {
  it("has an entry for every catalog package", () => {
    for (const name of Object.keys(PACKAGE_CATALOG)) {
      expect(PACKAGE_REGISTRY[name]).toBeDefined();
    }
  });

  it("has no extra entries beyond the catalog", () => {
    for (const name of Object.keys(PACKAGE_REGISTRY)) {
      expect(PACKAGE_CATALOG[name]).toBeDefined();
    }
  });

  it("uses packageName as the importName", () => {
    for (const [name, entry] of Object.entries(PACKAGE_CATALOG)) {
      expect(PACKAGE_REGISTRY[name].importName).toBe(entry.packageName);
    }
  });

  it("uses importKind from the catalog", () => {
    for (const [name, entry] of Object.entries(PACKAGE_CATALOG)) {
      expect(PACKAGE_REGISTRY[name].importKind).toBe(entry.importKind);
    }
  });
});

describe("SOURCE_PACKAGE_MAP derivation", () => {
  it("maps every catalog source name to its package", () => {
    for (const [pkgName, entry] of Object.entries(PACKAGE_CATALOG)) {
      for (const sourceName of entry.sourceNames) {
        expect(SOURCE_PACKAGE_MAP[sourceName]).toBe(pkgName);
      }
    }
  });

  it("contains no stale source names beyond the catalog", () => {
    const allSourceNames = new Set<string>();
    for (const entry of Object.values(PACKAGE_CATALOG)) {
      for (const sn of entry.sourceNames) {
        allSourceNames.add(sn);
      }
    }
    for (const key of Object.keys(SOURCE_PACKAGE_MAP)) {
      expect(allSourceNames.has(key)).toBe(true);
    }
  });

  it("contains rowguardCondition which rowguard operations reference", () => {
    expect(SOURCE_PACKAGE_MAP["rowguardCondition"]).toBe("rowguard");
  });
});

describe("loadPackage / unloadPackage / resetPackageRegistry", () => {
  beforeEach(() => {
    resetPackageRegistry();
  });

  it("loads wretch operations and instance types", async () => {
    await loadPackage("wretch");

    const ops = loadedPackageOperations.get("wretch");
    expect(ops).toBeDefined();
    expect(ops!.length).toBeGreaterThan(0);

    const instanceTypes = getAllInstanceTypes();
    expect(instanceTypes["wretch.Wretch"]).toBeDefined();
    expect(instanceTypes["wretch.WretchResponseChain"]).toBeDefined();
  });

  it("loads rowguard operations and instance types", async () => {
    await loadPackage("rowguard");

    const ops = loadedPackageOperations.get("rowguard");
    expect(ops).toBeDefined();
    expect(ops!.length).toBeGreaterThan(0);

    const instanceTypes = getAllInstanceTypes();
    expect(instanceTypes["rowguard.PolicyBuilder"]).toBeDefined();
    expect(instanceTypes["rowguard.ColumnBuilder"]).toBeDefined();
  });

  it("prefixes operation names with the package name", async () => {
    await loadPackage("wretch");
    const ops = loadedPackageOperations.get("wretch")!;

    const urlOp = ops.find((op) => op.name === "wretch.url");
    expect(urlOp).toBeDefined();
  });

  it("does not prefix operations with packageCallTarget 'import'", async () => {
    await loadPackage("wretch");
    const ops = loadedPackageOperations.get("wretch")!;

    const wretchOp = ops.find((op) => op.name === "wretch");
    expect(wretchOp).toBeDefined();
  });

  it("does not reload an already-loaded package", async () => {
    await loadPackage("wretch");

    const opsAfterFirst = loadedPackageOperations.get("wretch");

    await loadPackage("wretch");

    const opsAfterSecond = loadedPackageOperations.get("wretch");
    expect(opsAfterSecond).toBe(opsAfterFirst);
  });

  it("unloads package operations and its instance types", async () => {
    await loadPackage("wretch");

    expect(loadedPackageOperations.has("wretch")).toBe(true);
    expect(getAllInstanceTypes()["wretch.Wretch"]).toBeDefined();

    await unloadPackage("wretch");

    expect(loadedPackageOperations.has("wretch")).toBe(false);
    expect(getAllInstanceTypes()["wretch.Wretch"]).toBeUndefined();
  });

  it("unloading one package does not affect another", async () => {
    await loadPackage("wretch");
    await loadPackage("rowguard");

    await unloadPackage("wretch");

    expect(loadedPackageOperations.has("wretch")).toBe(false);
    expect(loadedPackageOperations.has("rowguard")).toBe(true);
    expect(getAllInstanceTypes()["rowguard.PolicyBuilder"]).toBeDefined();
  });

  it("resetPackageRegistry clears all loaded state", async () => {
    await loadPackage("wretch");
    await loadPackage("rowguard");

    resetPackageRegistry();

    expect(loadedPackageOperations.size).toBe(0);
  });

  it("getAllInstanceTypes includes built-in types after reset", () => {
    resetPackageRegistry();
    const types = getAllInstanceTypes();
    expect(types["Promise"]).toBeDefined();
    expect(types["Date"]).toBeDefined();
    expect(types["URL"]).toBeDefined();
    expect(types["Request"]).toBeDefined();
    expect(types["Response"]).toBeDefined();
  });

  it("loadPackage is a no-op for unknown packages", async () => {
    await loadPackage("nonexistent");
    expect(loadedPackageOperations.size).toBe(0);
  });
});

describe("getPackageSourceNames", () => {
  it("returns source names for known packages", () => {
    expect(getPackageSourceNames("wretch")).toEqual([
      "wretch",
      "wretchResponseChain",
    ]);
  });

  it("returns empty array for unknown packages", () => {
    expect(getPackageSourceNames("nonexistent")).toEqual([]);
  });
});
