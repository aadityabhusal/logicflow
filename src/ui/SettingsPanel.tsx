import type { Project } from "../lib/types";
import { useUiConfigStore, useProjectStore } from "../lib/store";
import { BooleanInput } from "../components/Input/BooleanInput";
import { createData } from "@/lib/utils";
import { useMediaQuery } from "@mantine/hooks";
import { Button } from "@mantine/core";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { PACKAGE_CATALOG } from "@/lib/packages/catalog";
import { useCallback, useRef, useState } from "react";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { executionWorkerClient } from "@/lib/execution/worker-client";
import { syncPackageRegistry } from "@/lib/operations/built-in";
import { notifications } from "@mantine/notifications";
import { useRestrictedName } from "@/lib/useRestrictedName";
import { ProjectSchema } from "@/lib/schemas";
import { ProjectCheckpoints } from "./ProjectCheckpoints";
import {
  FaSpinner,
  FaChevronDown,
  FaChevronRight,
  FaArrowUpRightFromSquare,
  FaDownload,
  FaUpload,
} from "react-icons/fa6";
import { createDownloadName, downloadBlob } from "@/lib/deployment/export";

export function SettingsPanel() {
  const disableKeyboard = useUiConfigStore((s) => s.disableKeyboard);
  const disableMobileWrapping = useUiConfigStore(
    (s) => s.disableMobileWrapping
  );
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const project = useProjectStore((s) => s.getCurrentProject());
  const projectId = useProjectStore((s) => s.getCurrentProject()?.id);
  const projectName = useProjectStore((s) => s.getCurrentProject()?.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const setCurrentFileId = useProjectStore((s) => s.setCurrentFileId);
  const dependencies = useProjectStore(
    (s) => s.getCurrentProject()?.dependencies
  );
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);
  const [expandedPackages, setExpandedPackages] = useState(new Set<string>());
  const [aliasInputs, setAliasInputs] = useState<Record<string, string>>({});
  const importInputRef = useRef<HTMLInputElement>(null);
  const { isRestricted } = useRestrictedName();

  const handleExportProject = useCallback(() => {
    if (!project) return;
    const config = JSON.stringify(ProjectSchema.parse(project), null, 2);
    const blob = new Blob([config], { type: "application/json" });
    downloadBlob(blob, `${createDownloadName(project.name)}.logicflow.json`);
  }, [project]);

  const handleImportProject = useCallback(
    async (file: File | undefined) => {
      if (!projectId || !file) return;
      try {
        const imported = ProjectSchema.parse(JSON.parse(await file.text()));
        const { id: _, ...projectConfig } = imported as Project;
        await syncPackageRegistry(imported.dependencies?.npm);
        updateProject(projectId, projectConfig);
        setCurrentFileId(imported.files[0]?.name);
        executionWorkerClient.reset();
        useExecutionResultsStore.getState().clearCache();
        notifications.show({ message: "Project config imported" });
      } catch {
        notifications.show({ message: "Could not import project config" });
      } finally {
        if (importInputRef.current) importInputRef.current.value = "";
      }
    },
    [projectId, setCurrentFileId, updateProject]
  );

  const applyPackageChanges = useCallback(
    async (
      nextDeps: NonNullable<NonNullable<Project["dependencies"]>["npm"]>
    ) => {
      if (!projectId) return;

      await syncPackageRegistry(
        nextDeps.map((dep) => ({ name: dep.name, namespace: dep.namespace }))
      );
      updateProject(projectId, {
        dependencies: { ...dependencies, npm: nextDeps },
      });
      executionWorkerClient.reset();
      useExecutionResultsStore.getState().clearCache();
    },
    [projectId, dependencies, updateProject]
  );

  const togglePackage = useCallback(
    async (pkgName: string) => {
      const deps = dependencies?.npm ?? [];
      const nextDeps = !deps.some((dep) => dep.name === pkgName)
        ? [...deps, { name: pkgName, version: "latest", exports: [] }]
        : deps.filter((dep) => dep.name !== pkgName);

      setLoadingPackage(pkgName);
      try {
        await applyPackageChanges(nextDeps);
      } finally {
        setLoadingPackage(null);
      }
    },
    [applyPackageChanges, dependencies]
  );

  const handleAliasChange = useCallback(
    async (pkgName: string, newAlias: string) => {
      if (!projectId) return;
      const deps = dependencies?.npm ?? [];
      const dep = deps.find((d) => d.name === pkgName);
      if (!dep) return;
      if (newAlias === (dep.namespace ?? "")) return;

      const nextDeps = deps.map((d) =>
        d.name !== pkgName ? d : { ...d, namespace: newAlias || undefined }
      );
      await applyPackageChanges(nextDeps);
    },
    [projectId, dependencies, applyPackageChanges]
  );

  const externalPackages = Object.entries(PACKAGE_CATALOG);

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center p-1 border-b gap-4 bg-dropdown-default">
        <p className="font-bold">Settings</p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto dropdown-scrollbar">
        {projectId && (
          <div className="border-b p-1">
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-300">Project name</span>
            </div>
            <input
              type="text"
              className="focus:outline outline-white border border-border w-full p-0.5 text-sm"
              placeholder={"Project name"}
              value={projectName}
              onChange={(e) => {
                updateProject(projectId, { name: e.target.value });
              }}
            />
          </div>
        )}
        {smallScreen && (
          <label className="flex items-center justify-between gap-2 border-b p-2">
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
          <label className="flex items-center justify-between gap-2 border-b p-2">
            <span className="text-sm">Disable code wrapping</span>
            <BooleanInput
              data={createData({ value: disableMobileWrapping ?? false })}
              handleData={(data) =>
                setUiConfig({ disableMobileWrapping: data.value })
              }
            />
          </label>
        )}
        {projectId && <ProjectCheckpoints />}
        {projectId && externalPackages.length > 0 && (
          <div className="border-b p-1">
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-300">Packages</span>
            </div>
            {externalPackages.map(([name, entry]) => {
              const dependency = dependencies?.npm?.find(
                (d) => d.name === name
              );
              const isExpanded = expandedPackages.has(name);
              return (
                <div
                  key={name}
                  className="border-b border-border last:border-b-0"
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={[
                        "flex items-center gap-2 py-1 flex-1 truncate text-sm cursor-pointer hover:bg-dropdown-hover",
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
                          value={
                            aliasInputs[name] ?? dependency?.namespace ?? ""
                          }
                          onChange={(e) =>
                            setAliasInputs((prev) => {
                              return { ...prev, [name]: e.target.value };
                            })
                          }
                          onBlur={(e) => {
                            const alias = e.target.value.trim();
                            const error = isRestricted(alias, name);
                            if (error) {
                              notifications.show({ message: error });
                            } else {
                              handleAliasChange(name, alias);
                            }
                            setAliasInputs((prev) => {
                              const next = { ...prev };
                              delete next[name];
                              return next;
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
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
        {projectId && (
          <div className="border-b p-1">
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-300">Project Config</span>
            </div>
            <div className="flex gap-3 flex-wrap p-1">
              <Button
                leftSection={<FaDownload />}
                onClick={handleExportProject}
                disabled={!project}
              >
                Export
              </Button>
              <Button
                leftSection={<FaUpload />}
                onClick={() => importInputRef.current?.click()}
              >
                Import
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => handleImportProject(e.target.files?.[0])}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
