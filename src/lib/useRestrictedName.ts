import { useCallback, useMemo } from "react";
import { useExecutionResultsStore, getReservedNames } from "./execution/store";
import { ReservedNames } from "./execution/types";
import { isValidIdentifier } from "./utils";
import { PACKAGE_CATALOG } from "./packages/catalog";
import { useProjectStore } from "./store";
import type { Context } from "./execution/types";

type UseRestrictedNameOptions = {
  context?: Context;
  reservedNames?: ReservedNames;
};

export function useRestrictedName(options?: UseRestrictedNameOptions) {
  const rootContext = useExecutionResultsStore((s) => s.rootContext);
  const dependencies = useProjectStore(
    (s) => s.getCurrentProject()?.dependencies
  );

  const reservedNames = useMemo(() => {
    const ctx = options?.context ?? rootContext;
    const names = getReservedNames(ctx.variables);
    const deps = dependencies?.npm ?? [];
    const pkgNames: ReservedNames = [
      ...Object.keys(PACKAGE_CATALOG),
      ...deps.flatMap((d) => [d.name, d.namespace ?? d.name]),
      ...Object.values(ctx.packageAliases),
    ]
      .filter(Boolean)
      .map((name) => ({ kind: "reserved" as const, name }));
    const all = names.concat(pkgNames);
    if (options?.reservedNames) {
      return all.concat(options.reservedNames);
    }
    return all;
  }, [dependencies?.npm, options, rootContext]);

  const isRestricted = useCallback(
    (name: string, selfName?: string): string | null => {
      if (!name) return null;
      if (!isValidIdentifier(name)) return `"${name}" is not a valid name`;

      for (const r of reservedNames) {
        if (r.name === name && r.name !== selfName) {
          return `"${name}" is already used`;
        }
      }
      return null;
    },
    [reservedNames]
  );

  return { isRestricted, reservedNames };
}
