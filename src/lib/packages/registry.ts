import type { OperationListItem } from "../execution/types";
import type { ConstructorType, OperationType } from "../types";
import { getPromiseArgsType } from "../data";
import { PACKAGE_CATALOG } from "./catalog";

export type InstanceTypeConfig<
  K extends string = string,
  C extends ConstructorType = ConstructorType,
> = {
  readonly name: K;
  readonly Constructor: C;
  readonly constructorArgs:
    | OperationType["parameters"]
    | ((data?: OperationType["parameters"]) => OperationType["parameters"]);
  readonly hideFromDropdown?: boolean;
  readonly prepareArgs?: (args: unknown[]) => unknown[];
  readonly importInfo?: { packageName: string };
  readonly referenceExpression?: string;
};

export const customInstances = new WeakMap<object, ConstructorType>();

function buildPackageRegistry() {
  const registry: Record<
    string,
    { importName: string; importKind: "default" | "namespace" }
  > = {};
  for (const [name, entry] of Object.entries(PACKAGE_CATALOG)) {
    registry[name] = {
      importName: entry.packageName,
      importKind: entry.importKind,
    };
  }
  return registry;
}

export const PACKAGE_REGISTRY = buildPackageRegistry();

function buildSourcePackageMap() {
  const map: Record<string, string> = {};
  for (const [name, entry] of Object.entries(PACKAGE_CATALOG)) {
    for (const sourceName of entry.sourceNames) map[sourceName] = name;
  }
  return map;
}

export const SOURCE_PACKAGE_MAP = buildSourcePackageMap();

export const InstanceTypes: { [K in string]: InstanceTypeConfig<K> } = {
  Promise: {
    name: "Promise",
    Constructor: Promise,
    constructorArgs: getPromiseArgsType,
  },
  Date: {
    name: "Date",
    Constructor: Date,
    constructorArgs: [
      { type: { kind: "string" }, isOptional: true },
    ] as OperationType["parameters"],
  },
  URL: {
    name: "URL",
    Constructor: URL,
    constructorArgs: [
      { type: { kind: "string" } },
    ] as OperationType["parameters"],
  },
  Request: {
    name: "Request",
    Constructor: Request,
    constructorArgs: [
      { type: { kind: "string" }, name: "url" },
      {
        type: { kind: "dictionary", elementType: { kind: "unknown" } },
        name: "options",
        isOptional: true,
      },
    ] as OperationType["parameters"],
    prepareArgs(args) {
      const [url, options, ...rest] = args;
      if (
        options !== null &&
        typeof options === "object" &&
        "body" in (options as Record<string, unknown>)
      ) {
        const opts = { ...(options as Record<string, unknown>) };
        if (opts.body !== null && typeof opts.body === "object") {
          opts.body = JSON.stringify(opts.body);
        }
        return [url, opts, ...rest];
      }
      return args;
    },
  },
  Response: {
    name: "Response",
    Constructor: Response,
    constructorArgs: [
      { type: { kind: "unknown" }, isOptional: true },
      {
        type: { kind: "dictionary", elementType: { kind: "unknown" } },
        isOptional: true,
      },
    ] as OperationType["parameters"],
    prepareArgs(args) {
      const [body, ...rest] = args;
      if (body !== null && typeof body === "object") {
        return [JSON.stringify(body), ...rest];
      }
      return args;
    },
  },
};

type PackageLoadResult = {
  operations: OperationListItem[];
  instanceTypes?: Record<string, InstanceTypeConfig>;
};

export const loadedPackageOperations = new Map<string, OperationListItem[]>();
const loadedInstanceTypes = new Map<string, InstanceTypeConfig>();

export function resolveDisplayName(
  fullName: string,
  aliases: Record<string, string> = {}
) {
  const dotIndex = fullName.indexOf(".");
  if (dotIndex === -1) return fullName;
  const packageName = fullName.substring(0, dotIndex);
  const alias = aliases[packageName];
  if (!alias) return fullName;
  return alias + fullName.substring(dotIndex);
}

export async function loadPackage(packageName: string): Promise<void> {
  if (loadedPackageOperations.has(packageName)) return;
  const entry = PACKAGE_CATALOG[packageName];
  if (!entry) return;

  const result: PackageLoadResult = await entry.load();

  const prefixedOps = result.operations.map((op) => ({
    ...op,
    name:
      op.source?.packageCallTarget === "import"
        ? op.name
        : `${packageName}.${op.name}`,
    source: op.source ? op.source : { name: packageName },
  }));

  loadedPackageOperations.set(packageName, prefixedOps);

  if (result.instanceTypes) {
    for (const [key, config] of Object.entries(result.instanceTypes)) {
      loadedInstanceTypes.set(key, config);
    }
  }
}

export async function unloadPackage(packageName: string): Promise<void> {
  loadedPackageOperations.delete(packageName);

  for (const key of loadedInstanceTypes.keys()) {
    const config = loadedInstanceTypes.get(key);
    if (config?.importInfo?.packageName === packageName) {
      loadedInstanceTypes.delete(key);
    }
  }
}

export function getAllInstanceTypes(): Record<string, InstanceTypeConfig> {
  const loaded: Record<string, InstanceTypeConfig> = {};
  for (const [key, config] of loadedInstanceTypes) {
    loaded[key] = config;
  }
  return { ...InstanceTypes, ...loaded };
}

export function resetPackageRegistry(): void {
  loadedPackageOperations.clear();
  loadedInstanceTypes.clear();
}
