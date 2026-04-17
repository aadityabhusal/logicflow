import { memo, useState } from "react";
import { Button, Menu, Popover } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  FaTrash,
  FaPlus,
  FaRocket,
  FaSpinner,
  FaCircleCheck,
  FaCircleXmark,
  FaArrowUpRightFromSquare,
  FaChevronDown,
  FaChevronRight,
} from "react-icons/fa6";
import { MdVpnKey } from "react-icons/md";
import { useProjectStore } from "@/lib/store";
import {
  DeploymentTarget,
  DeploymentStatus,
  DeploymentRecord,
} from "@/lib/types";
import { createVariableName } from "@/lib/utils";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { deployToPlatform } from "@/lib/deployment/api/deploy";
import { DeploymentProgress } from "@/lib/types";
import { IconButton } from "./IconButton";
import { NoteText } from "./NoteText";
import { formatRelativeTime } from "@/lib/deployment/utils";
import { Link } from "react-router";
import { capitalize } from "remeda";
import { PLATFORMS } from "@/lib/data";

type DeploymentState = {
  isDeploying: boolean;
  progress?: DeploymentProgress;
  error?: string;
};

function DeploymentPanelComponent() {
  const project = useProjectStore((s) => s.getCurrentProject());
  const updateProject = useProjectStore((s) => s.updateProject);
  const rootContext = useExecutionResultsStore((s) => s.rootContext);
  const [expanded, setExpandedPlatforms] = useState(new Set<string>());
  const [deploymentStates, setDeploymentStates] = useState<
    Record<string, DeploymentState>
  >({});

  const deployment = project?.deployment ?? { envVariables: [], platforms: [] };
  const availablePlatforms = Object.keys(PLATFORMS)
    .map((p) => ({ platform: p as keyof typeof PLATFORMS, deployments: [] }))
    .filter(
      (p) => !deployment.platforms.some((t) => t.platform === p.platform)
    );

  const handleUpdateDeployment = (updates: Partial<typeof deployment>) => {
    if (!project) return;
    updateProject(project.id, { deployment: { ...deployment, ...updates } });
  };

  const handleAddPlatform = (target: DeploymentTarget) => {
    handleUpdateDeployment({ platforms: [...deployment.platforms, target] });
    setExpandedPlatforms((prev) => new Set(prev).add(target.platform));
  };

  const handleRemovePlatform = (platform: string) => {
    handleUpdateDeployment({
      platforms: deployment.platforms.filter((t) => t.platform !== platform),
    });
    setExpandedPlatforms((prev) => {
      const next = new Set(prev);
      next.delete(platform);
      return next;
    });
    setDeploymentStates((prev) => {
      const next = { ...prev };
      delete next[platform];
      return next;
    });
  };

  const togglePlatformExpanded = (platform: string) => {
    setExpandedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const handleDeploy = async (platform: keyof typeof PLATFORMS) => {
    if (!project || !rootContext) return;

    const target = deployment.platforms.find((t) => t.platform === platform);
    if (!target?.credentials?.token) {
      notifications.show({
        message: `Please add your ${PLATFORMS[platform].label} API token first`,
      });
      return;
    }

    setDeploymentStates((prev) => ({
      ...prev,
      [platform]: { isDeploying: true, progress: { stage: "generating" } },
    }));

    const result = await deployToPlatform(
      project,
      rootContext,
      target,
      (progress) => {
        setDeploymentStates((prev) => ({
          ...prev,
          [platform]: {
            isDeploying: true,
            progress,
            error:
              progress.stage === "error"
                ? progress.message
                : prev[platform]?.error,
          },
        }));
      }
    );

    if (result.success && result.projectId) {
      const record: DeploymentRecord = {
        id: result.id || "",
        url: result.url || "",
        state: (result.state || "ready") as DeploymentStatus,
        createdAt: Date.now(),
        dashboardUrl: result.dashboardUrl,
        triggerUrls: result.triggerUrls,
      };

      updateProject(project.id, {
        deployment: {
          ...deployment,
          platforms: deployment.platforms.map((t) => {
            if (t.platform !== platform) return t;
            return {
              ...target,
              ...(result.projectId ? { projectId: result.projectId } : {}),
              deployments: [...(record ? [record] : []), ...target.deployments],
            };
          }),
        },
      });
    }

    setDeploymentStates((prev) => ({
      ...prev,
      [platform]: {
        isDeploying: false,
        progress: result.success
          ? { stage: "ready", url: result.url }
          : { stage: "error", message: result.error },
        error: result.success ? undefined : result.error,
      },
    }));

    if (result.success) {
      notifications.show({
        message: `Deployed to ${PLATFORMS[platform].label}!`,
      });
    } else if (result.error) {
      notifications.show({ message: result.error });
    }
  };

  const handleAddEnvVar = () => {
    const envVars = deployment.envVariables;
    const key = createVariableName({
      prefix: "ENV",
      prev: envVars.map((v) => v.key),
    });
    handleUpdateDeployment({ envVariables: [...envVars, { key, value: "" }] });
  };

  const handleUpdateEnvVar = (
    index: number,
    updates: Partial<{ key: string; value: string }>
  ) => {
    if (updates.key !== undefined) {
      if (!updates.key.trim()) {
        notifications.show({ message: "Key cannot be empty" });
        return;
      }
      const isDuplicate = deployment.envVariables.some(
        (v, i) => i !== index && v.key === updates.key
      );
      if (isDuplicate) {
        notifications.show({ message: `Key '${updates.key}' already exists` });
        return;
      }
    }
    const envVars = deployment.envVariables;
    const updated = [...envVars];
    updated[index] = { ...updated[index], ...updates };
    handleUpdateDeployment({ envVariables: updated });
  };

  const handleRemoveEnvVar = (index: number) => {
    handleUpdateDeployment({
      envVariables: deployment.envVariables.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center p-1 border-b gap-4 bg-dropdown-default">
        <p className="font-bold">Deployment</p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto dropdown-scrollbar">
        <div className="border-b">
          <div className="flex justify-between items-center p-1">
            <span className="text-gray-300">Platforms</span>
            {availablePlatforms.length > 0 && (
              <Menu withinPortal={false} position="bottom-end">
                <Menu.Target>
                  <IconButton icon={FaPlus} title="Add platform" />
                </Menu.Target>
                <Menu.Dropdown>
                  {availablePlatforms.map((opt) => (
                    <Menu.Item
                      key={opt.platform}
                      onClick={() => handleAddPlatform(opt)}
                    >
                      {PLATFORMS[opt.platform].label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
          </div>

          {deployment.platforms.length === 0 && (
            <NoteText center>No platforms configured</NoteText>
          )}

          {deployment.platforms.map((target) => {
            const latestDeploy = target.deployments?.[0];
            const deployState = deploymentStates[target.platform];
            const isExpanded = expanded.has(target.platform);
            return (
              <div
                key={target.platform}
                className="border-b border-border last:border-b-0"
              >
                <div className="flex items-center gap-1">
                  <span
                    className={[
                      "flex items-center gap-2 p-1 flex-1 truncate text-sm cursor-pointer hover:bg-dropdown-hover",
                      isExpanded ? "" : "text-gray-300",
                    ].join(" ")}
                    onClick={() => togglePlatformExpanded(target.platform)}
                  >
                    {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                    {PLATFORMS[target.platform].label}
                  </span>
                  <Popover position="bottom-start" withinPortal={false}>
                    <Popover.Target>
                      <IconButton
                        icon={MdVpnKey}
                        title="Credentials"
                        className="mr-1 p-1"
                      />
                    </Popover.Target>
                    <Popover.Dropdown classNames={{ dropdown: "border" }}>
                      <div className="flex flex-col gap-1.5 min-w-[200px] p-1">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-sm">
                              {PLATFORMS[target.platform].token.label}
                            </span>
                            <a
                              href={PLATFORMS[target.platform].token.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FaArrowUpRightFromSquare size={9} />
                            </a>
                          </div>
                          <input
                            type="password"
                            className="focus:outline outline-white border w-full p-0.5 text-sm"
                            placeholder={PLATFORMS[target.platform].token.label}
                            value={target.credentials?.token}
                            onChange={({ target: { value: token } }) => {
                              handleUpdateDeployment({
                                platforms: deployment.platforms.map((p) => {
                                  if (p.platform !== target.platform) return p;
                                  return { ...p, credentials: { token } };
                                }),
                              });
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-sm">
                              {PLATFORMS[target.platform].projectId.label}
                            </span>
                            <a
                              href={PLATFORMS[target.platform].projectId.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FaArrowUpRightFromSquare size={9} />
                            </a>
                          </div>
                          <input
                            type="text"
                            className="focus:outline outline-white border w-full p-0.5 text-sm"
                            placeholder={
                              PLATFORMS[target.platform].projectId.label
                            }
                            value={target.projectId || ""}
                            onChange={(e) => {
                              handleUpdateDeployment({
                                platforms: deployment.platforms.map((t) => {
                                  if (t.platform !== target.platform) return t;
                                  return { ...t, projectId: e.target.value };
                                }),
                              });
                            }}
                          />
                        </div>
                      </div>
                    </Popover.Dropdown>
                  </Popover>
                </div>

                {isExpanded && (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3 p-1 justify-between">
                      {latestDeploy?.dashboardUrl && (
                        <Button
                          component={Link}
                          to={latestDeploy.dashboardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="outline-none text-sm"
                          rightSection={<FaArrowUpRightFromSquare size={12} />}
                        >
                          Dashboard
                        </Button>
                      )}
                      {latestDeploy?.createdAt && (
                        <div className="flex items-center gap-1 text-sm">
                          <FaCircleCheck className="text-green-400" />
                          <span className="text-gray-400 truncate">
                            {formatRelativeTime(latestDeploy.createdAt)}
                          </span>
                        </div>
                      )}
                    </div>
                    {latestDeploy?.triggerUrls && (
                      <div className="flex flex-col gap-1 p-2 bg-dropdown-hover/30">
                        <p className="text-sm">Live Endpoints</p>
                        <div className="flex gap-3 flex-wrap">
                          {latestDeploy.triggerUrls.map((url) => {
                            const name =
                              target.platform === "supabase"
                                ? url.split("/").pop()
                                : url.split("/api/").pop();
                            return (
                              <Button
                                component={Link}
                                key={url}
                                to={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="outline-none text-sm"
                                rightSection={
                                  <FaArrowUpRightFromSquare size={10} />
                                }
                              >
                                {name || url}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {deployState?.error && !deployState?.isDeploying && (
                      <div className="flex items-center gap-1 text-sm text-red-400 p-1">
                        <FaCircleXmark />
                        <span className="break-all">{deployState?.error}</span>
                      </div>
                    )}

                    <div className="flex gap-2 justify-between p-1">
                      <Popover position="bottom-start" withArrow offset={1}>
                        <Popover.Target>
                          <Button
                            className="text-sm outline-none"
                            leftSection={<FaTrash className="text-red-400" />}
                          >
                            Remove
                          </Button>
                        </Popover.Target>
                        <Popover.Dropdown classNames={{ dropdown: "border" }}>
                          <div className="flex flex-col gap-2 p-1">
                            <span className="text-sm">Are you sure?</span>
                            <Button
                              leftSection={<FaTrash className="text-red-400" />}
                              className="text-sm self-end"
                              onClick={() =>
                                handleRemovePlatform(target.platform)
                              }
                            >
                              Yes, remove.
                            </Button>
                          </div>
                        </Popover.Dropdown>
                      </Popover>
                      <Button
                        className="text-sm truncate max-w-1/2"
                        leftSection={
                          deployState?.isDeploying ? (
                            <FaSpinner className="animate-spin" />
                          ) : (
                            <FaRocket className="text-green-400" />
                          )
                        }
                        onClick={() => handleDeploy(target.platform)}
                        disabled={!target.credentials?.token}
                        loading={deployState?.isDeploying}
                      >
                        {deployState?.progress
                          ? deployState?.progress.message ||
                            capitalize(deployState?.progress.stage)
                          : "Deploy"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-b">
          <div className="flex justify-between items-center p-1">
            <span className="text-gray-300">Environment Variables</span>
            <IconButton
              icon={FaPlus}
              title="Add variable"
              onClick={handleAddEnvVar}
            />
          </div>

          <div className="flex flex-col gap-1 p-1">
            {deployment.envVariables.length === 0 && (
              <NoteText center>No environment variables</NoteText>
            )}
            {deployment.envVariables.map((envVar, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  className="focus:outline outline-white border border-border w-full p-0.5"
                  placeholder="Key"
                  value={envVar.key}
                  onChange={(e) =>
                    handleUpdateEnvVar(index, { key: e.target.value })
                  }
                />
                <input
                  className="focus:outline outline-white border border-border w-full p-0.5"
                  placeholder="Value"
                  value={envVar.value}
                  onChange={(e) =>
                    handleUpdateEnvVar(index, { value: e.target.value })
                  }
                />
                <IconButton
                  icon={FaTrash}
                  title="Remove variable"
                  onClick={() => handleRemoveEnvVar(index)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Deployment = memo(DeploymentPanelComponent);
