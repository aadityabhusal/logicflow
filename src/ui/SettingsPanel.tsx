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
  const npmDependencies = useProjectStore(
    (s) => s.getCurrentProject()?.dependencies?.npm
  );
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);

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
        await syncPackageRegistry(nextDeps.map((dep) => dep.name));

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
              const dependency = npmDependencies?.find((d) => d.name === name);
              return (
                <div key={name} className="flex flex-col gap-1">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-sm">
                      {entry.displayName}
                      {loadingPackage === name ? " (loading...)" : ""}
                    </span>
                    <BooleanInput
                      data={createData({ value: Boolean(dependency) })}
                      handleData={() => {
                        if (loadingPackage !== name) togglePackage(name);
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
