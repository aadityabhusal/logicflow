import { InstanceTypeConfig } from "../data";
import type { OperationListItem } from "../execution/types";
import type { Project } from "../types";

export interface PackageCatalogEntry {
  displayName: string;
  packageName: string;
  importKind: "default" | "namespace";
  sourceNames: string[];
  load: () => Promise<{
    operations: OperationListItem[];
    instanceTypes?: Record<string, InstanceTypeConfig>;
  }>;
}

export const PACKAGE_CATALOG: Record<string, PackageCatalogEntry> = {
  wretch: {
    displayName: "Wretch",
    packageName: "wretch",
    importKind: "default",
    sourceNames: ["wretch", "wretchResponseChain"],
    load: () => import("../operations/wretch").then((m) => m.default),
  },
  rowguard: {
    displayName: "Rowguard",
    packageName: "rowguard",
    importKind: "namespace",
    sourceNames: [
      "rowguard",
      "rowguardColumnBuilder",
      "rowguardConditionChain",
      "rowguardPolicyBuilder",
      "rowguardSubqueryBuilder",
      "rowguardAuthBuilder",
      "rowguardSessionBuilder",
    ],
    load: () => import("../operations/rowguard").then((m) => m.default),
  },
};

export function getPackageSourceNames(packageName: string): string[] {
  return PACKAGE_CATALOG[packageName]?.sourceNames ?? [];
}

export function getEnabledPackageNames(project?: Project): string[] {
  return (project?.dependencies?.npm ?? [])
    .filter((dep) => dep.name in PACKAGE_CATALOG)
    .map((dep) => dep.name);
}
