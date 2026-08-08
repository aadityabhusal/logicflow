import { Textarea, Button, Menu, Tooltip } from "@mantine/core";
import { useAgentStore } from "@/lib/store";
import { AVAILABLE_MODELS } from "@/lib/data";
import { FaArrowUp, FaChevronDown, FaStop } from "react-icons/fa6";
import { IconButton } from "../IconButton";
import { useProjectStore } from "@/lib/store";
import { useMediaQuery } from "@mantine/hooks";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { useEffect, useRef } from "react";

interface AgentInputProps {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function AgentInput({ onSubmit, onCancel, isLoading }: AgentInputProps) {
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasLoading = useRef(isLoading);
  const restoreComposerFocus = useRef(false);
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

  useEffect(() => {
    if (wasLoading.current && !isLoading) {
      const activeElement = document.activeElement;
      if (
        restoreComposerFocus.current &&
        (activeElement === document.body || activeElement === inputRef.current)
      ) {
        inputRef.current?.focus();
      }
      restoreComposerFocus.current = false;
    }
    wasLoading.current = isLoading;
  }, [isLoading]);

  const handleSubmit = () => {
    if (value.trim() && !isLoading && modelHasApiKey) {
      restoreComposerFocus.current = true;
      onSubmit(value.trim());
      if (activeThreadId) setDraft(activeThreadId, "");
    }
  };

  return (
    <div className="flex flex-col border-t p-1 gap-1">
      <Textarea
        id="agent-prompt-input"
        ref={inputRef}
        aria-label="Message the agent"
        aria-describedby={
          !modelHasApiKey ? "agent-api-key-required" : undefined
        }
        value={value}
        onChange={(e) =>
          activeThreadId && setDraft(activeThreadId, e.target.value)
        }
        placeholder="Describe the changes you want..."
        autosize
        className="p-2"
        minRows={2}
        maxRows={smallScreen ? 6 : 10}
        disabled={isLoading}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            (e.metaKey || e.ctrlKey || (!smallScreen && !e.shiftKey))
          ) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        classNames={{
          input: "focus-visible:outline-2 outline-white",
        }}
      />
      {!modelHasApiKey ? (
        <p id="agent-api-key-required" className="px-1 text-xs text-dimmed">
          Add an API key for the selected model to send a message.
        </p>
      ) : null}
      <div className="flex min-w-0 justify-between p-1 gap-2">
        <Menu position="top-start">
          <Menu.Target>
            <Button
              leftSection={<FaChevronDown size={12} />}
              className="min-w-0 flex-1 focus-visible:outline-2"
              aria-label={`Model: ${selectedModelConfig?.name ?? "Select model"}`}
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
                  role="menuitemradio"
                  aria-checked={model.id === selectedModel}
                  aria-label={`${model.name}${
                    getApiKey(model.provider) ? "" : ", API key required"
                  }`}
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
            className="shrink-0 px-2 outline"
            title="Cancel request"
          />
        ) : (
          <IconButton
            onClick={handleSubmit}
            icon={FaArrowUp}
            className="shrink-0 px-2 outline"
            title="Send"
            disabled={value.trim() === "" || !modelHasApiKey}
          />
        )}
      </div>
    </div>
  );
}
