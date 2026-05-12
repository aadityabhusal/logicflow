import type { OperationListItem } from "../execution/types";
import type { InstanceTypeConfig } from "../data";
import { InstanceTypes as CoreInstanceTypes } from "../data";
import { PACKAGE_CATALOG, getPackageSourceNames } from "./catalog";

type PackageLoadResult = {
  operations: OperationListItem[];
  instanceTypes?: Record<string, InstanceTypeConfig>;
};

export const loadedPackageOperations = new Map<string, OperationListItem[]>();
const loadedInstanceTypes = new Map<string, InstanceTypeConfig>();

export async function loadPackage(packageName: string): Promise<void> {
  if (loadedPackageOperations.has(packageName)) return;
  const entry = PACKAGE_CATALOG[packageName];
  if (!entry) return;

  const result: PackageLoadResult = await entry.load();

  const prefixedOps = result.operations.map((op) => ({
    ...op,
    name: `${packageName}.${op.name}`,
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
    if (
      config?.importInfo &&
      getPackageSourceNames(packageName).includes(config.importInfo.packageName)
    ) {
      loadedInstanceTypes.delete(key);
    }
  }
}

export function getAllInstanceTypes(): Record<string, InstanceTypeConfig> {
  const loaded: Record<string, InstanceTypeConfig> = {};
  for (const [key, config] of loadedInstanceTypes) {
    loaded[key] = config;
  }
  return { ...CoreInstanceTypes, ...loaded };
}

export function resetPackageRegistry(): void {
  loadedPackageOperations.clear();
  loadedInstanceTypes.clear();
}
