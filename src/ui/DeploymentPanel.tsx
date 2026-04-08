import { memo, useState } from "react";
import { Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { FaChevronDown, FaChevronUp, FaTrash, FaPlus } from "react-icons/fa6";
import { useProjectStore } from "@/lib/store";
import { Project } from "@/lib/types";
import { createDeploymentConfig } from "@/lib/deployment/config";
import { createVariableName } from "@/lib/utils";
import { IconButton } from "./IconButton";

const PLATFORM_LABELS: Record<string, string> = {
  vercel: "Vercel",
  netlify: "Netlify",
  supabase: "Supabase Edge Functions",
};

function DeploymentPanelComponent() {
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const updateProject = useProjectStore((s) => s.updateProject);
  const [isEnvExpanded, setIsEnvExpanded] = useState(false);

  if (!currentProject) return null;

  const deployment =
    currentProject.deployment ?? createDeploymentConfig("vercel");

  const handleUpdateDeployment = (
    updates: Partial<Omit<Project["deployment"], "platform">>
  ) => {
    updateProject(currentProject.id, {
      deployment: { ...deployment, ...updates },
    });
  };

  const handleChangePlatform = (
    platform: "vercel" | "netlify" | "supabase"
  ) => {
    updateProject(currentProject.id, {
      deployment: createDeploymentConfig(platform),
    });
  };

  const handleAddEnvVar = () => {
    const envVars = deployment.environmentVariables;
    const key = createVariableName({
      prefix: "ENV",
      prev: envVars.map((v) => v.key),
    });
    handleUpdateDeployment({
      environmentVariables: [...envVars, { key, value: "" }],
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
      const isDuplicate = deployment.environmentVariables.some(
        (v, i) => i !== index && v.key === updates.key
      );
      if (isDuplicate) {
        notifications.show({ message: `Key '${updates.key}' already exists` });
        return;
      }
    }
    const envVars = deployment.environmentVariables;
    const updated = [...envVars];
    updated[index] = { ...updated[index], ...updates };
    handleUpdateDeployment({ environmentVariables: updated });
  };

  const handleRemoveEnvVar = (index: number) => {
    handleUpdateDeployment({
      environmentVariables: deployment.environmentVariables.filter(
        (_, i) => i !== index
      ),
    });
  };

  return (
    <div className="p-2 bg-editor h-full overflow-auto flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="font-semibold">Deployment</span>
      </div>

      <div className="flex flex-col gap-1 relative">
        <span className="text-sm text-gray-400">Platform</span>
        <Menu
          width={"100%"}
          offset={1}
          withinPortal={false}
          position="bottom-start"
        >
          <Menu.Target>
            <button className="flex justify-between items-center gap-1 p-1 hover:bg-dropdown-hover outline outline-border w-full">
              <span className="truncate">
                {PLATFORM_LABELS[deployment.platform]}
              </span>
              <FaChevronDown size={12} />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => handleChangePlatform("vercel")}>
              Vercel
            </Menu.Item>
            <Menu.Item onClick={() => handleChangePlatform("netlify")}>
              Netlify
            </Menu.Item>
            <Menu.Item onClick={() => handleChangePlatform("supabase")}>
              Supabase Edge Functions
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-medium">Env Variables</span>
        <IconButton
          icon={isEnvExpanded ? FaChevronUp : FaChevronDown}
          size={12}
          onClick={() => setIsEnvExpanded(!isEnvExpanded)}
        />
      </div>

      {isEnvExpanded && (
        <div className="flex flex-col gap-1">
          {deployment.environmentVariables.map((envVar, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                className="flex-1 outline-0 bg-inherit border p-1 text-sm min-w-0"
                placeholder="key"
                value={envVar.key}
                onChange={(e) =>
                  handleUpdateEnvVar(index, { key: e.target.value })
                }
              />
              <input
                className="flex-1 outline-0 bg-inherit border p-1 text-sm min-w-0"
                placeholder="value"
                value={envVar.value || ""}
                onChange={(e) =>
                  handleUpdateEnvVar(index, { value: e.target.value })
                }
              />
              <IconButton
                icon={FaTrash}
                size={12}
                className="text-red-500"
                onClick={() => handleRemoveEnvVar(index)}
              />
            </div>
          ))}
          <IconButton icon={FaPlus} size={12} onClick={handleAddEnvVar}>
            Add Variable
          </IconButton>
        </div>
      )}
    </div>
  );
}

export const Deployment = memo(DeploymentPanelComponent);
