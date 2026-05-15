import { describe, it, expect, beforeEach } from "vitest";
import {
  PACKAGE_REGISTRY,
  SOURCE_PACKAGE_MAP,
  loadPackage,
  unloadPackage,
  resetPackageRegistry,
  loadedPackageOperations,
  getAllInstanceTypes,
  resolveDisplayName,
} from "./registry";
import {
  PACKAGE_CATALOG,
  getAliasesFromPackages,
  getEnabledPackages,
} from "./catalog";
import type { Project } from "../types";

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

  it("stores operations and instance types with package-scoped names", async () => {
    await loadPackage("rowguard");

    const ops = loadedPackageOperations.get("rowguard")!;
    const onOp = ops.find((op) => op.name === "rowguard.on");
    expect(onOp).toBeDefined();

    const parameters =
      typeof onOp!.parameters === "function"
        ? onOp!.parameters({
            id: "test",
            type: { kind: "unknown" },
            value: undefined,
          })
        : onOp!.parameters;

    expect(parameters[0].type).toMatchObject({
      kind: "instance",
      className: "rowguard.PolicyBuilder",
    });

    const instanceTypes = getAllInstanceTypes();
    expect(instanceTypes["rowguard.PolicyBuilder"]).toBeDefined();
    expect(instanceTypes["rowguard.PolicyBuilder"]?.name).toBe(
      "rowguard.PolicyBuilder"
    );
  });

  it("resolveDisplayName replaces package prefix with alias", () => {
    expect(
      resolveDisplayName("rowguard.PolicyBuilder", { rowguard: "Rg" })
    ).toBe("Rg.PolicyBuilder");
    expect(resolveDisplayName("rowguard.on", { rowguard: "Rg" })).toBe("Rg.on");
  });

  it("resolveDisplayName returns original when no alias", () => {
    expect(resolveDisplayName("rowguard.PolicyBuilder", {})).toBe(
      "rowguard.PolicyBuilder"
    );
    expect(resolveDisplayName("Promise", {})).toBe("Promise");
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

describe("resolveDisplayName edge cases", () => {
  it("returns name unchanged when alias map is empty", () => {
    expect(resolveDisplayName("foo.bar", {})).toBe("foo.bar");
  });

  it("returns name unchanged when package has no alias", () => {
    expect(resolveDisplayName("foo.bar", { other: "X" })).toBe("foo.bar");
  });

  it("returns name unchanged when name has no dot", () => {
    expect(resolveDisplayName("Promise", { Promise: "P" })).toBe("Promise");
  });

  it("only replaces the first dot segment", () => {
    expect(resolveDisplayName("a.b.c", { a: "X" })).toBe("X.b.c");
  });

  it("does not partial-match package prefixes", () => {
    expect(resolveDisplayName("rowguardApi.foo", { rowguard: "Rg" })).toBe(
      "rowguardApi.foo"
    );
  });

  it("returns name unchanged for empty string input", () => {
    expect(resolveDisplayName("", {})).toBe("");
  });
});

describe("getAliasesFromPackages", () => {
  it("returns an empty object for undefined input", () => {
    expect(getAliasesFromPackages(undefined)).toEqual({});
  });

  it("returns an empty object for an empty array", () => {
    expect(getAliasesFromPackages([])).toEqual({});
  });

  it("returns an empty object when no packages have namespaces", () => {
    expect(
      getAliasesFromPackages([
        { name: "wretch", namespace: undefined },
        { name: "rowguard" },
      ])
    ).toEqual({});
  });

  it("maps namespaced packages to the alias record", () => {
    expect(
      getAliasesFromPackages([
        { name: "wretch", namespace: "W" },
        { name: "rowguard", namespace: "Rg" },
        { name: "other", namespace: undefined },
      ])
    ).toEqual({ wretch: "W", rowguard: "Rg" });
  });

  it("skips falsy namespaces", () => {
    expect(
      getAliasesFromPackages([
        { name: "wretch", namespace: "" },
        { name: "rowguard", namespace: "Rg" },
      ])
    ).toEqual({ rowguard: "Rg" });
  });
});

describe("getEnabledPackages", () => {
  it("returns an empty array for undefined project", () => {
    expect(getEnabledPackages(undefined)).toEqual([]);
  });

  it("returns an empty array when project has no dependencies", () => {
    const project = { id: "p1", name: "test", version: "1", createdAt: 1, files: [] };
    expect(getEnabledPackages(project)).toEqual([]);
  });

  it("returns an empty array when npm deps are empty", () => {
    const project = { id: "p1", name: "test", version: "1", createdAt: 1, files: [], dependencies: { npm: [] } };
    expect(getEnabledPackages(project)).toEqual([]);
  });

  it("returns only catalog packages with their namespaces", () => {
    const project = { id: "p1", name: "test", version: "1", createdAt: 1, files: [], dependencies: { npm: [{ name: "rowguard", version: "latest", exports: [], namespace: "Rg" }] } };
    expect(getEnabledPackages(project)).toEqual([{ name: "rowguard", namespace: "Rg" }]);
  });

  it("filters out non-catalog packages", () => {
    const project = { id: "p1", name: "test", version: "1", createdAt: 1, files: [], dependencies: { npm: [{ name: "nonexistent", version: "latest", exports: [], namespace: "Nx" }] } };
    expect(getEnabledPackages(project)).toEqual([]);
  });

  it("filters out non-catalog packages while keeping catalog ones", () => {
    const project = { id: "p1", name: "test", version: "1", createdAt: 1, files: [], dependencies: { npm: [{ name: "wretch", version: "latest", exports: [], namespace: "W" }, { name: "nonexistent", version: "latest", exports: [] }] } };
    expect(getEnabledPackages(project)).toEqual([{ name: "wretch", namespace: "W" }]);
  });
});
