import { describe, it, expect, beforeEach } from "vitest";
import {
  PACKAGE_REGISTRY,
  SOURCE_PACKAGE_MAP,
  loadPackage,
  unloadPackage,
  resetPackageRegistry,
  loadedPackageOperations,
  getAllInstanceTypes,
  getInstanceDocsUrl,
  loadPackageDescriptor,
  resolveDisplayName,
} from "./registry";
import {
  applySupportedPackageChanges,
  PACKAGE_CATALOG,
  getAliasesFromPackages,
  getEnabledPackages,
} from "./catalog";
import {
  builtInOperationsByName,
  syncPackageRegistry,
  withSyncedPackageRegistry,
} from "../operations/built-in";

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

  it("stores the catalog key as the importName", () => {
    for (const name of Object.keys(PACKAGE_CATALOG)) {
      expect(PACKAGE_REGISTRY[name].importName).toBe(name);
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

  it("does not define duplicate source names in the catalog", () => {
    const owners = new Map<string, string>();

    for (const [pkgName, entry] of Object.entries(PACKAGE_CATALOG)) {
      for (const sourceName of entry.sourceNames) {
        expect(owners.get(sourceName)).toBeUndefined();
        owners.set(sourceName, pkgName);
      }
    }
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
    expect(wretchOp?.source).toMatchObject({
      name: "wretch",
      packageCallTarget: "import",
    });
  });

  it("preserves package source metadata on loaded operations", async () => {
    await loadPackage("rowguard");
    const ops = loadedPackageOperations.get("rowguard")!;

    expect(ops.find((op) => op.name === "rowguard.on")?.source).toMatchObject({
      name: "rowguardPolicyBuilder",
    });
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

    expect(getAllInstanceTypes()["wretch.Wretch"]).toBeDefined();
    expect(getAllInstanceTypes()["rowguard.PolicyBuilder"]).toBeDefined();

    resetPackageRegistry();

    expect(loadedPackageOperations.size).toBe(0);
    expect(getAllInstanceTypes()["wretch.Wretch"]).toBeUndefined();
    expect(getAllInstanceTypes()["rowguard.PolicyBuilder"]).toBeUndefined();
  });

  it("unloadPackage is idempotent for unknown packages", async () => {
    await expect(unloadPackage("missing")).resolves.toBeUndefined();
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

describe("package descriptors and synchronized registry", () => {
  beforeEach(() => {
    resetPackageRegistry();
  });

  it("normalizes a descriptor without mutating loader results or live state", async () => {
    const entry = PACKAGE_CATALOG.wretch;
    const originalLoad = entry.load;
    const loaded = await originalLoad();
    const plainOperation = {
      ...loaded.operations.find((operation) => operation.name === "url")!,
      name: "plain",
      source: undefined,
    };
    const importOperation = {
      ...loaded.operations.find((operation) => operation.name === "wretch")!,
      name: "factory",
    };
    const operations = [plainOperation, importOperation];
    entry.load = async () => ({
      operations,
      instanceTypes: loaded.instanceTypes,
    });

    try {
      const descriptor = await loadPackageDescriptor("wretch");

      expect(descriptor.name).toBe("wretch");
      expect(descriptor.operations.map(({ name }) => name)).toEqual([
        "wretch.plain",
        "factory",
      ]);
      expect(descriptor.operations[0].source).toEqual({ name: "wretch" });
      expect(descriptor.instanceTypes).toBe(loaded.instanceTypes);
      expect(descriptor.operations[0]).not.toBe(plainOperation);
      expect(operations[0]).toBe(plainOperation);
      expect(plainOperation).toMatchObject({
        name: "plain",
        source: undefined,
      });
      expect(importOperation.name).toBe("factory");
      expect(loadedPackageOperations.size).toBe(0);
      expect(getAllInstanceTypes()["wretch.Wretch"]).toBeUndefined();
    } finally {
      entry.load = originalLoad;
    }
  });

  it("rejects unsupported descriptor names", async () => {
    await expect(loadPackageDescriptor("missing")).rejects.toThrow(
      "Unsupported package: missing"
    );
  });

  it("preserves the live registry when staged loading fails", async () => {
    await syncPackageRegistry([{ name: "wretch" }]);
    const previousOperations = loadedPackageOperations.get("wretch");
    const previousInstance = getAllInstanceTypes()["wretch.Wretch"];
    const entry = PACKAGE_CATALOG.rowguard;
    const originalLoad = entry.load;
    entry.load = async () => {
      throw new Error("load failed");
    };

    try {
      await expect(
        syncPackageRegistry([{ name: "faker" }, { name: "rowguard" }])
      ).rejects.toThrow("load failed");

      expect(loadedPackageOperations.get("wretch")).toBe(previousOperations);
      expect(getAllInstanceTypes()["wretch.Wretch"]).toBe(previousInstance);
      expect(loadedPackageOperations.has("faker")).toBe(false);
      expect(builtInOperationsByName.has("wretch.url")).toBe(true);
      expect(builtInOperationsByName.has("faker.person.firstName")).toBe(false);
    } finally {
      entry.load = originalLoad;
    }
  });

  it("restores exact registry state and indexes when the callback rejects", async () => {
    await syncPackageRegistry([{ name: "wretch" }]);
    const previousOperations = loadedPackageOperations.get("wretch");
    const previousInstance = getAllInstanceTypes()["wretch.Wretch"];

    await expect(
      withSyncedPackageRegistry([{ name: "rowguard" }], async () => {
        expect(loadedPackageOperations.has("wretch")).toBe(false);
        expect(loadedPackageOperations.has("rowguard")).toBe(true);
        expect(builtInOperationsByName.has("rowguard.on")).toBe(true);
        throw new Error("persistence failed");
      })
    ).rejects.toThrow("persistence failed");

    expect(loadedPackageOperations.get("wretch")).toBe(previousOperations);
    expect(getAllInstanceTypes()["wretch.Wretch"]).toBe(previousInstance);
    expect(loadedPackageOperations.has("rowguard")).toBe(false);
    expect(getAllInstanceTypes()["rowguard.PolicyBuilder"]).toBeUndefined();
    expect(builtInOperationsByName.has("wretch.url")).toBe(true);
    expect(builtInOperationsByName.has("rowguard.on")).toBe(false);
  });

  it("ignores unsupported persisted dependencies during synchronization", async () => {
    await expect(
      syncPackageRegistry([{ name: "missing" }, { name: "faker" }])
    ).resolves.toBeUndefined();
    expect([...loadedPackageOperations.keys()]).toEqual(["faker"]);
  });

  it("serializes registry transactions through their callbacks", async () => {
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];

    const first = withSyncedPackageRegistry([{ name: "wretch" }], async () => {
      order.push("first-start");
      markFirstStarted();
      await holdFirst;
      order.push("first-end");
    });
    await firstStarted;

    const second = withSyncedPackageRegistry([{ name: "faker" }], () => {
      order.push("second");
    });
    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
    expect([...loadedPackageOperations.keys()]).toEqual(["faker"]);
  });
});

describe("faker named-import package", () => {
  beforeEach(() => {
    resetPackageRegistry();
  });

  it("PACKAGE_REGISTRY has named importKind", () => {
    expect(PACKAGE_REGISTRY["faker"]).toBeDefined();
    expect(PACKAGE_REGISTRY["faker"].importKind).toBe("named");
    expect(PACKAGE_REGISTRY["faker"].importName).toBe("faker");
  });

  it("SOURCE_PACKAGE_MAP maps the faker source name", () => {
    expect(SOURCE_PACKAGE_MAP["faker"]).toBe("faker");
  });

  it("loads faker operations", async () => {
    await loadPackage("faker");

    const ops = loadedPackageOperations.get("faker");
    expect(ops).toBeDefined();
    expect(ops!.length).toBeGreaterThan(0);

    const nameOp = ops!.find((op) => op.name === "faker.person.firstName");
    expect(nameOp).toBeDefined();
  });

  it("has no instance types", async () => {
    await loadPackage("faker");
    const instanceTypes = getAllInstanceTypes();

    expect(Object.keys(instanceTypes).some((k) => k.startsWith("faker."))).toBe(
      false
    );
  });

  it("does not reload an already-loaded package", async () => {
    await loadPackage("faker");
    const opsFirst = loadedPackageOperations.get("faker");

    await loadPackage("faker");
    const opsSecond = loadedPackageOperations.get("faker");

    expect(opsSecond).toBe(opsFirst);
  });

  it("unloads faker operations", async () => {
    await loadPackage("faker");
    expect(loadedPackageOperations.has("faker")).toBe(true);

    await unloadPackage("faker");
    expect(loadedPackageOperations.has("faker")).toBe(false);
  });

  it("unloading faker does not affect other packages", async () => {
    await loadPackage("faker");
    await loadPackage("rowguard");

    await unloadPackage("faker");

    expect(loadedPackageOperations.has("faker")).toBe(false);
    expect(loadedPackageOperations.has("rowguard")).toBe(true);
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

describe("ffmpeg virtual package", () => {
  beforeEach(() => {
    resetPackageRegistry();
  });

  it("PACKAGE_CATALOG entry exists with packageType virtual", () => {
    expect(PACKAGE_CATALOG["ffmpeg"]).toBeDefined();
    expect(PACKAGE_CATALOG["ffmpeg"].packageType).toBe("virtual");
  });

  it("PACKAGE_REGISTRY has namespace importKind", () => {
    expect(PACKAGE_REGISTRY["ffmpeg"]).toBeDefined();
    expect(PACKAGE_REGISTRY["ffmpeg"].importKind).toBe("namespace");
    expect(PACKAGE_REGISTRY["ffmpeg"].importName).toBe("ffmpeg");
  });

  it("SOURCE_PACKAGE_MAP maps the ffmpeg source name", () => {
    expect(SOURCE_PACKAGE_MAP["ffmpeg"]).toBe("ffmpeg");
  });

  it("loads ffmpeg operations with prefix", async () => {
    await loadPackage("ffmpeg");

    const ops = loadedPackageOperations.get("ffmpeg");
    expect(ops).toBeDefined();
    expect(ops!.length).toBeGreaterThan(0);

    const inputOp = ops!.find((op) => op.name === "ffmpeg.input");
    expect(inputOp).toBeDefined();

    const commandOp = ops!.find((op) => op.name === "ffmpeg.command");
    expect(commandOp).toBeDefined();
  });

  it("all operations are prefixed with package name", async () => {
    await loadPackage("ffmpeg");
    const ops = loadedPackageOperations.get("ffmpeg")!;
    const commandOp = ops.every(
      (op) => op.name.startsWith("ffmpeg.") || op.name === "ffmpeg"
    );
    expect(commandOp).toBe(true);
  });

  it("loads ffmpeg instance types", async () => {
    await loadPackage("ffmpeg");
    const instanceTypes = getAllInstanceTypes();
    expect(instanceTypes["ffmpeg.Command"]).toBeDefined();
  });

  it("does not reload an already-loaded package", async () => {
    await loadPackage("ffmpeg");
    const opsFirst = loadedPackageOperations.get("ffmpeg");

    await loadPackage("ffmpeg");
    const opsSecond = loadedPackageOperations.get("ffmpeg");

    expect(opsSecond).toBe(opsFirst);
  });

  it("unloads ffmpeg operations", async () => {
    await loadPackage("ffmpeg");
    expect(loadedPackageOperations.has("ffmpeg")).toBe(true);

    await unloadPackage("ffmpeg");
    expect(loadedPackageOperations.has("ffmpeg")).toBe(false);
  });

  it("resetPackageRegistry clears ffmpeg state", async () => {
    await loadPackage("ffmpeg");
    resetPackageRegistry();
    expect(loadedPackageOperations.size).toBe(0);
    expect(getAllInstanceTypes()["ffmpeg.Command"]).toBeUndefined();
  });
});

describe("supabase package", () => {
  beforeEach(() => {
    resetPackageRegistry();
  });

  it("PACKAGE_CATALOG entry exists with npm packageType", () => {
    expect(PACKAGE_CATALOG["supabase"]).toBeDefined();
    expect(PACKAGE_CATALOG["supabase"].packageType).toBeUndefined();
    expect(PACKAGE_CATALOG["supabase"].packageName).toBe(
      "@supabase/supabase-js"
    );
    expect(PACKAGE_CATALOG["supabase"].importKind).toBe("namespace");
  });

  it("PACKAGE_REGISTRY has namespace importKind", () => {
    expect(PACKAGE_REGISTRY["supabase"]).toBeDefined();
    expect(PACKAGE_REGISTRY["supabase"].importKind).toBe("namespace");
    expect(PACKAGE_REGISTRY["supabase"].importName).toBe("supabase");
  });

  it("SOURCE_PACKAGE_MAP maps supabase source names", () => {
    expect(SOURCE_PACKAGE_MAP["supabase"]).toBe("supabase");
    expect(SOURCE_PACKAGE_MAP["supabaseClient"]).toBe("supabase");
    expect(SOURCE_PACKAGE_MAP["supabaseQueryBuilder"]).toBe("supabase");
    expect(SOURCE_PACKAGE_MAP["supabaseBuilder"]).toBe("supabase");
    expect(SOURCE_PACKAGE_MAP["supabaseFunctions"]).toBe("supabase");
  });

  it("loads supabase operations and instance types", async () => {
    await loadPackage("supabase");

    const ops = loadedPackageOperations.get("supabase");
    expect(ops).toBeDefined();
    expect(ops!.length).toBeGreaterThan(0);

    const instanceTypes = getAllInstanceTypes();
    expect(instanceTypes["supabase.SupabaseClient"]).toBeDefined();
    expect(instanceTypes["supabase.PostgrestQueryBuilder"]).toBeDefined();
    expect(instanceTypes["supabase.PostgrestFilterBuilder"]).toBeDefined();
  });

  it("prefixes createClient as a package member operation", async () => {
    await loadPackage("supabase");
    const ops = loadedPackageOperations.get("supabase")!;
    const createClientOp = ops.find(
      (op) => op.name === "supabase.createClient"
    );
    expect(createClientOp).toBeDefined();
    expect(createClientOp?.source?.packageCallTarget).toBeUndefined();
  });

  it("prefixes builder operations with package name", async () => {
    await loadPackage("supabase");
    const ops = loadedPackageOperations.get("supabase")!;
    const fromOp = ops.find((op) => op.name === "supabase.from");
    expect(fromOp).toBeDefined();
    const eqOp = ops.find((op) => op.name === "supabase.eq");
    expect(eqOp).toBeDefined();
    const invokeOp = ops.find((op) => op.name === "supabase.functions.invoke");
    expect(invokeOp).toBeDefined();
  });

  it("unloads supabase operations and instance types", async () => {
    await loadPackage("supabase");
    expect(loadedPackageOperations.has("supabase")).toBe(true);
    expect(getAllInstanceTypes()["supabase.SupabaseClient"]).toBeDefined();

    await unloadPackage("supabase");
    expect(loadedPackageOperations.has("supabase")).toBe(false);
    expect(getAllInstanceTypes()["supabase.SupabaseClient"]).toBeUndefined();
  });
});

describe("getEnabledPackages", () => {
  it("returns an empty array for undefined project", () => {
    expect(getEnabledPackages(undefined)).toEqual([]);
  });

  it("returns an empty array when project has no dependencies", () => {
    const project = {
      id: "p1",
      name: "test",
      version: "1",
      createdAt: 1,
      files: [],
    };
    expect(getEnabledPackages(project)).toEqual([]);
  });

  it("returns an empty array when npm deps are empty", () => {
    const project = {
      id: "p1",
      name: "test",
      version: "1",
      createdAt: 1,
      files: [],
      dependencies: { npm: [] },
    };
    expect(getEnabledPackages(project)).toEqual([]);
  });

  it("returns only catalog packages with their namespaces", () => {
    const project = {
      id: "p1",
      name: "test",
      version: "1",
      createdAt: 1,
      files: [],
      dependencies: {
        npm: [
          { name: "rowguard", version: "latest", exports: [], namespace: "Rg" },
        ],
      },
    };
    expect(getEnabledPackages(project)).toEqual([
      { name: "rowguard", namespace: "Rg" },
    ]);
  });

  it("filters out non-catalog packages", () => {
    const project = {
      id: "p1",
      name: "test",
      version: "1",
      createdAt: 1,
      files: [],
      dependencies: {
        npm: [
          {
            name: "nonexistent",
            version: "latest",
            exports: [],
            namespace: "Nx",
          },
        ],
      },
    };
    expect(getEnabledPackages(project)).toEqual([]);
  });

  it("filters out non-catalog packages while keeping catalog ones", () => {
    const project = {
      id: "p1",
      name: "test",
      version: "1",
      createdAt: 1,
      files: [],
      dependencies: {
        npm: [
          { name: "wretch", version: "latest", exports: [], namespace: "W" },
          { name: "nonexistent", version: "latest", exports: [] },
        ],
      },
    };
    expect(getEnabledPackages(project)).toEqual([
      { name: "wretch", namespace: "W" },
    ]);
  });
});

describe("applySupportedPackageChanges", () => {
  const unknownDependency = {
    name: "custom-package",
    version: "1.2.3",
    namespace: "Custom",
    types: "custom-types",
    exports: [{ name: "run", importedBy: [{ operationName: "main" }] }],
  };
  const existingPackage = {
    name: "wretch",
    version: "3.0.0",
    namespace: "Http",
    exports: [{ name: "default", importedBy: [] }],
  };

  it("preserves full existing and unknown records while applying deltas", () => {
    const dependencies = [unknownDependency, existingPackage];
    const result = applySupportedPackageChanges(dependencies, [
      { name: "wretch", enabled: true },
      { name: "faker", enabled: true },
    ]);

    expect(result).toEqual([
      unknownDependency,
      existingPackage,
      { name: "faker", version: "latest", exports: [] },
    ]);
    expect(result[0]).toBe(unknownDependency);
    expect(result[1]).toBe(existingPackage);
    expect(dependencies).toEqual([unknownDependency, existingPackage]);
  });

  it("is idempotent and removes only the disabled catalog dependency", () => {
    const dependencies = [unknownDependency, existingPackage];
    const once = applySupportedPackageChanges(dependencies, [
      { name: "wretch", enabled: false },
      { name: "faker", enabled: true },
    ]);
    const twice = applySupportedPackageChanges(once, [
      { name: "wretch", enabled: false },
      { name: "faker", enabled: true },
    ]);

    expect(twice).toEqual(once);
    expect(twice[0]).toBe(unknownDependency);
  });

  it("rejects unsupported changes without mutating dependencies", () => {
    const dependencies = [unknownDependency, existingPackage];

    expect(() =>
      applySupportedPackageChanges(dependencies, [
        { name: "faker", enabled: true },
        { name: "missing", enabled: false },
      ])
    ).toThrow("Unsupported package: missing");
    expect(dependencies).toEqual([unknownDependency, existingPackage]);
  });
});

describe("comfyui namespace-import package", () => {
  beforeEach(() => {
    resetPackageRegistry();
  });

  it("PACKAGE_REGISTRY has namespace importKind", () => {
    expect(PACKAGE_REGISTRY["comfyui"]).toBeDefined();
    expect(PACKAGE_REGISTRY["comfyui"].importKind).toBe("namespace");
    expect(PACKAGE_REGISTRY["comfyui"].importName).toBe("comfyui");
  });

  it("SOURCE_PACKAGE_MAP maps all comfyui source names", () => {
    expect(SOURCE_PACKAGE_MAP["comfyuiApi"]).toBe("comfyui");
    expect(SOURCE_PACKAGE_MAP["comfyuiPool"]).toBe("comfyui");
    expect(SOURCE_PACKAGE_MAP["comfyuiPromptBuilder"]).toBe("comfyui");
    expect(SOURCE_PACKAGE_MAP["comfyuiCallWrapper"]).toBe("comfyui");
    expect(SOURCE_PACKAGE_MAP["comfyuiWorkflowBuilder"]).toBe("comfyui");
  });

  it("loads comfyui operations", async () => {
    await loadPackage("comfyui");

    const ops = loadedPackageOperations.get("comfyui");
    expect(ops).toBeDefined();
    expect(ops!.length).toBeGreaterThan(0);

    const apiOp = ops!.find((op) => op.name === "comfyui.ComfyApi");
    expect(apiOp).toBeUndefined();

    const initOp = ops!.find((op) => op.name === "comfyui.init");
    expect(initOp).toBeDefined();

    const buildOp = ops!.find((op) => op.name === "comfyui.build");
    expect(buildOp).toBeDefined();

    const inputOp = ops!.find((op) => op.name === "comfyui.input");
    expect(inputOp).toBeDefined();

    const runOp = ops!.find((op) => op.name === "comfyui.run");
    expect(runOp).toBeDefined();
  });

  it("registers instance types on load", async () => {
    await loadPackage("comfyui");

    const instanceTypes = getAllInstanceTypes();
    expect(instanceTypes["comfyui.ComfyApi"]).toBeDefined();
    expect(instanceTypes["comfyui.ComfyPool"]).toBeDefined();
    expect(instanceTypes["comfyui.PromptBuilder"]).toBeDefined();
    expect(instanceTypes["comfyui.CallWrapper"]).toBeDefined();
    expect(instanceTypes["comfyui.WorkflowBuilder"]).toBeDefined();
  });

  it("unloads operations and instance types", async () => {
    await loadPackage("comfyui");
    expect(loadedPackageOperations.has("comfyui")).toBe(true);

    await unloadPackage("comfyui");
    expect(loadedPackageOperations.has("comfyui")).toBe(false);
    expect(getAllInstanceTypes()["comfyui.ComfyApi"]).toBeUndefined();
  });

  it("does not reload an already-loaded package", async () => {
    await loadPackage("comfyui");
    const opsFirst = loadedPackageOperations.get("comfyui");

    await loadPackage("comfyui");
    const opsSecond = loadedPackageOperations.get("comfyui");

    expect(opsSecond).toBe(opsFirst);
  });

  it("registers constructor parameters on instance types", async () => {
    await loadPackage("comfyui");
    const instanceTypes = getAllInstanceTypes();

    expect(instanceTypes["comfyui.ComfyApi"].constructorArgs).toMatchObject([
      { name: "host", type: { kind: "string" } },
      { name: "clientId", isOptional: true, type: { kind: "string" } },
      { name: "opts", isOptional: true, type: { kind: "dictionary" } },
    ]);

    expect(
      instanceTypes["comfyui.PromptBuilder"].constructorArgs
    ).toMatchObject([
      { name: "workflow", type: { kind: "dictionary" } },
      { name: "inputKeys", type: { kind: "array" } },
      { name: "outputKeys", type: { kind: "array" } },
    ]);
  });

  it.each([
    ["comfyui.ComfyApi", "https://github.com/tctien342/comfyui-sdk#comfyapi"],
    [
      "comfyui.WorkflowBuilder",
      "https://github.com/tctien342/comfyui-sdk#workflowbuilder",
    ],
    [
      "wretch.Wretch",
      "https://elbywan.github.io/wretch/api/interfaces/index.Wretch.html",
    ],
    [
      "rowguard.PolicyBuilder",
      "https://supabase-community.github.io/rowguard/classes/PolicyBuilder.html",
    ],
    [
      "ffmpeg.Command",
      "https://github.com/aadityabhusal/logicflow/blob/main/docs/ffmpeg-package.md",
    ],
  ])("exposes docsUrl for %s after load", async (className, expected) => {
    await loadPackage(className.split(".")[0]);
    expect(getAllInstanceTypes()[className]?.docsUrl).toBe(expected);
    expect(getInstanceDocsUrl(className)).toBe(expected);
  });

  it("returns undefined for unknown instance docsUrl", () => {
    expect(getInstanceDocsUrl("comfyui.ComfyApi")).toBeUndefined();
    expect(getInstanceDocsUrl("Date")).toBeUndefined();
  });
});
