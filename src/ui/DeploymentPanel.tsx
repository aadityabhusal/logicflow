import { memo, useState } from "react";
import { Button, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  FaChevronDown,
  FaChevronUp,
  FaTrash,
  FaPlus,
  FaRocket,
} from "react-icons/fa6";
import { useProjectStore } from "@/lib/store";
import { DeploymentTarget } from "@/lib/types";
import { createVariableName } from "@/lib/utils";
import { IconButton } from "./IconButton";
import { NoteText } from "./NoteText";

const PLATFORM_OPTIONS: DeploymentTarget[] = [
  { platform: "vercel" },
  { platform: "netlify" },
  { platform: "supabase" },
];

const PLATFORM_LABELS: Record<string, string> = {
  vercel: "Vercel",
  netlify: "Netlify",
  supabase: "Supabase",
};

function DeploymentPanelComponent() {
  const project = useProjectStore((s) => s.getCurrentProject());
  const updateProject = useProjectStore((s) => s.updateProject);
  const [expandedPlatforms, setExpandedPlatforms] = useState(new Set());

  const deployment = project?.deployment ?? { envVariables: [], platforms: [] };
  const availablePlatforms = PLATFORM_OPTIONS.filter(
    (opt) => !deployment.platforms.some((t) => t.platform === opt.platform)
  );

  const handleUpdateDeployment = (updates: Partial<typeof deployment>) => {
    if (!project) return;
    updateProject(project.id, {
      deployment: { ...deployment, ...updates },
    });
  };

  const handleAddPlatform = (target: DeploymentTarget) => {
    handleUpdateDeployment({ platforms: [...deployment.platforms, target] });
    setExpandedPlatforms((prev) => new Set(prev).add(target.platform));
  };

  const handleRemovePlatform = (platform: string) => {
    handleUpdateDeployment({
      platforms: deployment.platforms.filter((t) => t.platform !== platform),
    });
  };

  const handleDeploy = (platform: string) => {
    notifications.show({
      message: `Deployment to ${PLATFORM_LABELS[platform]} coming soon`,
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

  const handleAddEnvVar = () => {
    const envVars = deployment.envVariables;
    const key = createVariableName({
      prefix: "ENV",
      prev: envVars.map((v) => v.key),
    });
    handleUpdateDeployment({
      envVariables: [...envVars, { key, value: "" }],
    });
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
      <div className="flex justify-between items-center p-1 border-b">
        <span>Deployment</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto dropdown-scrollbar">
        <div className="border-b p-1">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-gray-400">Platforms</span>
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
                      {PLATFORM_LABELS[opt.platform]}
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
            const isExpanded = expandedPlatforms.has(target.platform);
            return (
              <div key={target.platform}>
                <div
                  className="flex items-center gap-1 p-1 hover:bg-dropdown-hover cursor-pointer"
                  onClick={() => togglePlatformExpanded(target.platform)}
                >
                  <span className="flex-1 truncate">
                    {PLATFORM_LABELS[target.platform]}
                  </span>
                  <IconButton icon={isExpanded ? FaChevronUp : FaChevronDown} />
                </div>
                {isExpanded && (
                  <div className="p-2 flex flex-col gap-1 bg-dropdown-hover/30">
                    <NoteText italic>
                      No platform-specific settings available yet
                    </NoteText>
                    <div className="flex gap-2 self-end">
                      <Button
                        leftSection={<FaTrash />}
                        onClick={() => handleRemovePlatform(target.platform)}
                        className="outline-none text-red-400"
                      >
                        Delete
                      </Button>
                      <Button
                        leftSection={<FaRocket />}
                        onClick={() => handleDeploy(target.platform)}
                      >
                        Deploy
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
            <span className="text-gray-400">Environment Variables</span>
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
