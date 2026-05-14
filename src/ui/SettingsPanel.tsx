import { useUiConfigStore, useProjectStore } from "../lib/store";
import { BooleanInput } from "../components/Input/BooleanInput";
import { createData } from "@/lib/utils";
import { useMediaQuery } from "@mantine/hooks";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { PACKAGE_CATALOG } from "@/lib/packages/catalog";
import { useCallback, useState } from "react";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { executionWorkerClient } from "@/lib/execution/worker-client";
import { syncPackageRegistry } from "@/lib/operations/built-in";
import {
  FaSpinner,
  FaChevronDown,
  FaChevronRight,
  FaArrowUpRightFromSquare,
} from "react-icons/fa6";

export function SettingsPanel() {
  const disableKeyboard = useUiConfigStore((s) => s.disableKeyboard);
  const disableMobileWrapping = useUiConfigStore(
    (s) => s.disableMobileWrapping
  );
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const currentProjectId = useProjectStore((s) => s.getCurrentProject()?.id);
  const currentProjectName = useProjectStore(
    (s) => s.getCurrentProject()?.name
  );
  const updateProject = useProjectStore((s) => s.updateProject);
  const dependencies = useProjectStore(
    (s) => s.getCurrentProject()?.dependencies
  );
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);
  const [expandedPackages, setExpandedPackages] = useState(new Set<string>());

  const togglePackage = useCallback(
    async (pkgName: string) => {
      if (!currentProjectId) return;
      const project = useProjectStore.getState().getCurrentProject();
      if (!project) return;
      const deps = project.dependencies?.npm ?? [];
      const enabled = deps.some((dep) => dep.name === pkgName);
      const nextDeps = !enabled
        ? [...deps, { name: pkgName, version: "latest", exports: [] }]
        : deps.filter((dep) => dep.name !== pkgName);

      setLoadingPackage(pkgName);
      try {
        await syncPackageRegistry(
          nextDeps.map((dep) => ({ name: dep.name, namespace: dep.namespace }))
        );

        updateProject(currentProjectId, {
          dependencies: { ...project.dependencies, npm: nextDeps },
        });

        executionWorkerClient.reset();
        useExecutionResultsStore.getState().clearCache();
      } finally {
        setLoadingPackage(null);
      }
    },
    [currentProjectId, updateProject]
  );

  const externalPackages = Object.entries(PACKAGE_CATALOG);

  return (
    <div className="flex flex-col h-full">
      <div className="p-1 border-b font-bold bg-dropdown-default">Settings</div>
      <div className="p-2 flex flex-col gap-2 overflow-y-auto">
        {currentProjectId && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-gray-300">Project name</span>
            <input
              type="text"
              className="focus:outline outline-white border w-full p-0.5 text-sm"
              placeholder={"Project name"}
              value={currentProjectName}
              onChange={(e) => {
                updateProject(currentProjectId, { name: e.target.value });
              }}
            />
          </div>
        )}
        {smallScreen && (
          <label className="flex items-center justify-between gap-2 border-t pt-2">
            <span className="text-sm">Disable keyboard focus</span>
            <BooleanInput
              data={createData({ value: disableKeyboard ?? false })}
              handleData={(data) =>
                setUiConfig({ disableKeyboard: data.value })
              }
            />
          </label>
        )}
        {smallScreen && (
          <label className="flex items-center justify-between gap-2 border-t pt-2">
            <span className="text-sm">Disable code wrapping</span>
            <BooleanInput
              data={createData({ value: disableMobileWrapping ?? false })}
              handleData={(data) =>
                setUiConfig({ disableMobileWrapping: data.value })
              }
            />
          </label>
        )}
        {currentProjectId && externalPackages.length > 0 && (
          <div className="border-t pt-2 flex flex-col gap-2">
            <span className="text-sm text-gray-300">Packages</span>
            {externalPackages.map(([name, entry]) => {
              const dependency = dependencies?.npm?.find(
                (d) => d.name === name
              );
              const isExpanded = expandedPackages.has(name);
              return (
                <div key={name} className="border border-border">
                  <div className="flex items-center gap-1">
                    <span
                      className={[
                        "flex items-center gap-2 p-1 flex-1 truncate text-sm cursor-pointer hover:bg-dropdown-hover",
                        isExpanded ? "" : "text-gray-300",
                      ].join(" ")}
                      onClick={() => {
                        setExpandedPackages((prev) => {
                          const next = new Set(prev);
                          if (next.has(name)) next.delete(name);
                          else next.add(name);
                          return next;
                        });
                      }}
                    >
                      {isExpanded ? (
                        <FaChevronDown className="shrink-0" size={10} />
                      ) : (
                        <FaChevronRight className="shrink-0" size={10} />
                      )}
                      {entry.displayName}
                    </span>
                    {loadingPackage === name && (
                      <FaSpinner className="animate-spin" />
                    )}
                    <div className="mr-1">
                      <BooleanInput
                        data={createData({ value: Boolean(dependency) })}
                        handleData={() => {
                          if (loadingPackage !== name) togglePackage(name);
                        }}
                      />
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="flex flex-col p-2 gap-2 bg-dropdown-hover/30">
                      {entry.description && (
                        <p className="text-sm text-gray-300">
                          {entry.description}
                        </p>
                      )}
                      {entry.links && entry.links.length > 0 && (
                        <div className="flex gap-3 flex-wrap">
                          {entry.links.map((link) => (
                            <a
                              key={link.url}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-blue-400 hover:underline"
                            >
                              {link.label}
                              <FaArrowUpRightFromSquare size={9} />
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-gray-300">Alias</span>
                        <input
                          type="text"
                          className="focus:outline outline-white border w-full p-0.5 text-sm"
                          placeholder="Global alias for the package"
                          value={dependency?.namespace ?? ""}
                          onChange={({ target: { value } }) => {
                            if (!currentProjectId || !dependencies?.npm) return;
                            const updated = dependencies?.npm.map((dep) => {
                              if (dep.name !== name) return dep;
                              return { ...dep, namespace: value || undefined };
                            });
                            updateProject(currentProjectId, {
                              dependencies: { ...dependencies, npm: updated },
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
