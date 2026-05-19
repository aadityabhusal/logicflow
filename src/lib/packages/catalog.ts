import { InstanceTypeConfig } from "./registry";
import type { OperationListItem } from "../execution/types";
import type { PackageNamespace, Project } from "../types";

export interface PackageCatalogEntry {
  displayName: string;
  packageName: string;
  importKind: "default" | "namespace" | "named";
  sourceNames: string[];
  description?: string;
  links?: { label: string; url: string }[];
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
    description: "A tiny wrapper built around fetch with an intuitive syntax.",
    links: [
      { label: "npm", url: "https://www.npmjs.com/package/wretch" },
      { label: "GitHub", url: "https://github.com/elbywan/wretch" },
    ],
    load: () => import("../operations/wretch").then((m) => m.default),
  },
  rowguard: {
    displayName: "Rowguard",
    packageName: "rowguard",
    importKind: "namespace",
    sourceNames: [
      "rowguard",
      "rowguardColumnBuilder",
      "rowguardCondition",
      "rowguardConditionChain",
      "rowguardPolicyBuilder",
      "rowguardSubqueryBuilder",
    ],
    description:
      "A TypeScript DSL for defining PostgreSQL Row Level Security (RLS) policies.",
    links: [
      { label: "npm", url: "https://www.npmjs.com/package/rowguard" },
      {
        label: "GitHub",
        url: "https://github.com/supabase-community/rowguard",
      },
    ],
    load: () => import("../operations/rowguard").then((m) => m.default),
  },
  faker: {
    displayName: "Faker",
    packageName: "@faker-js/faker",
    importKind: "named",
    sourceNames: ["faker"],
    description:
      "Generate massive amounts of fake data in the browser and node.js",
    links: [
      { label: "npm", url: "https://www.npmjs.com/package/@faker-js/faker" },
      { label: "GitHub", url: "https://github.com/faker-js/faker" },
    ],
    load: () => import("../operations/faker").then((m) => m.default),
  },
  "date-fns": {
    displayName: "date-fns",
    packageName: "date-fns",
    importKind: "namespace",
    sourceNames: ["date-fns"],
    description: "Modern JavaScript date utility library",
    links: [
      { label: "npm", url: "https://www.npmjs.com/package/date-fns" },
      { label: "GitHub", url: "https://github.com/date-fns/date-fns" },
    ],
    load: () => import("../operations/date-fns").then((m) => m.default),
  },
};

export function getEnabledPackages(project?: Project): PackageNamespace[] {
  return (project?.dependencies?.npm ?? [])
    .filter((dep) => dep.name in PACKAGE_CATALOG)
    .map((dep) => ({ name: dep.name, namespace: dep.namespace }));
}

export function getAliasesFromPackages(packages?: PackageNamespace[]) {
  const result: Record<string, string> = {};
  for (const pkg of packages ?? []) {
    if (pkg.namespace) result[pkg.name] = pkg.namespace;
  }
  return result;
}
