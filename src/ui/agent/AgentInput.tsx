import { Textarea, Button, Menu, Tooltip } from "@mantine/core";
import { useAgentStore } from "@/lib/store";
import { AVAILABLE_MODELS } from "@/lib/data";
import { FaArrowUp, FaChevronDown, FaStop } from "react-icons/fa6";
import { IconButton } from "../IconButton";
import { useProjectStore } from "@/lib/store";

interface AgentInputProps {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function AgentInput({ onSubmit, onCancel, isLoading }: AgentInputProps) {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const {
    selectedModel,
    getApiKey,
    setSelectedModel,
    agentProjects,
    setDraft,
  } = useAgentStore();
  const agentProject = currentProjectId
    ? agentProjects[currentProjectId]
    : undefined;
  const activeThread = agentProject?.threads.find(
    (thread) => thread.id === agentProject.activeThreadId
  );
  const activeThreadId = activeThread?.id;
  const value = activeThread?.draft ?? "";
  const selectedModelConfig = AVAILABLE_MODELS.find(
    (m) => m.id === selectedModel
  );
  const modelHasApiKey = selectedModelConfig
    ? getApiKey(selectedModelConfig.provider)
    : false;

  const handleSubmit = () => {
    if (value.trim() && !isLoading) {
      onSubmit(value.trim());
      if (activeThreadId) setDraft(activeThreadId, "");
    }
  };

  return (
    <div className="flex flex-col border-t p-1 gap-1">
      <Textarea
        value={value}
        onChange={(e) =>
          activeThreadId && setDraft(activeThreadId, e.target.value)
        }
        placeholder="Describe the changes you want..."
        autosize
        className="p-2"
        minRows={2}
        maxRows={10}
        disabled={isLoading}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="flex justify-between p-1 gap-2">
        <Menu position="top-start">
          <Menu.Target>
            <Button
              leftSection={<FaChevronDown size={12} />}
              className="outline-none"
            >
              {selectedModelConfig?.name ?? "Select model"}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {AVAILABLE_MODELS.map((model) => (
              <Tooltip
                key={model.id}
                label={!getApiKey(model.provider) ? "Add API key" : ""}
                position="right"
                disabled={!!getApiKey(model.provider)}
              >
                <Menu.Item
                  onClick={() => setSelectedModel(model.id)}
                  classNames={{
                    item:
                      model.id === selectedModel ? "bg-dropdown-selected" : "",
                  }}
                  disabled={!getApiKey(model.provider)}
                >
                  {model.name}
                </Menu.Item>
              </Tooltip>
            ))}
          </Menu.Dropdown>
        </Menu>
        {isLoading ? (
          <IconButton
            onClick={onCancel}
            icon={FaStop}
            className="px-2 outline"
            title="Cancel request"
          />
        ) : (
          <IconButton
            onClick={handleSubmit}
            icon={FaArrowUp}
            className="px-2 outline"
            title="Send"
            disabled={value.trim() === "" || !modelHasApiKey}
          />
        )}
      </div>
    </div>
  );
}
