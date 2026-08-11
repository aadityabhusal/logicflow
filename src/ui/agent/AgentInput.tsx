import { Textarea, Menu } from "@mantine/core";
import { useAgentStore } from "@/lib/store";
import {
  AGENT_THINKING_LEVELS,
  AVAILABLE_MODELS,
  LLM_PROVIDERS,
} from "@/lib/data";
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
    thinkingLevel,
    setThinkingLevel,
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
  const thinkingLabel =
    AGENT_THINKING_LEVELS.find(({ value }) => value === thinkingLevel)?.label ??
    "Medium";
  const SelectedProviderIcon = selectedModelConfig
    ? LLM_PROVIDERS[selectedModelConfig.provider].Icon
    : undefined;

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
    <div className="border-t bg-editor">
      <div className="focus-within:outline focus-within:outline-white">
        <Textarea
          id="agent-prompt-input"
          ref={inputRef}
          aria-label="Message the agent"
          value={value}
          onChange={(e) =>
            activeThreadId && setDraft(activeThreadId, e.target.value)
          }
          placeholder="Ask anything..."
          autosize
          minRows={3}
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
            input:
              "rounded-none border-0 bg-transparent px-3 py-2 text-base focus-visible:outline-none",
          }}
        />
        <div className="flex min-w-0 gap-1 border-t border-border/60 px-2 py-1.5">
          <Menu position="top-start">
            <Menu.Target>
              <button
                type="button"
                className="flex min-h-9 min-w-0 items-center gap-2 rounded-xs px-2 text-sm text-dimmed hover:bg-dropdown-default hover:text-white focus-visible:outline-2 outline-white"
                aria-label={`Model: ${selectedModelConfig?.name ?? "Select model"}`}
              >
                {SelectedProviderIcon ? (
                  <SelectedProviderIcon className="shrink-0" />
                ) : null}
                <span className="truncate">
                  {selectedModelConfig?.name ?? "Select model"}
                </span>
                <FaChevronDown size={10} className="shrink-0" />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              {AVAILABLE_MODELS.map((model) => (
                <Menu.Item
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  role="menuitemradio"
                  aria-checked={model.id === selectedModel}
                  classNames={{
                    item:
                      model.id === selectedModel ? "bg-dropdown-selected" : "",
                  }}
                  disabled={!getApiKey(model.provider)}
                >
                  {model.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu position="top-start">
            <Menu.Target>
              <button
                type="button"
                className="flex min-h-9 shrink-0 items-center gap-2 rounded-xs px-2 text-sm text-dimmed hover:bg-dropdown-default hover:text-white focus-visible:outline-2 outline-white"
                aria-label={`Thinking: ${thinkingLabel}`}
              >
                {thinkingLabel}
                <FaChevronDown size={10} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              {AGENT_THINKING_LEVELS.map((level) => (
                <Menu.Item
                  key={level.value}
                  onClick={() => setThinkingLevel(level.value)}
                  role="menuitemradio"
                  aria-checked={level.value === thinkingLevel}
                  classNames={{
                    item:
                      level.value === thinkingLevel
                        ? "bg-dropdown-selected"
                        : "",
                  }}
                >
                  {level.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <div className="ml-auto" />
          {isLoading ? (
            <IconButton
              onClick={onCancel}
              icon={FaStop}
              className="border px-2"
              title="Cancel request"
            />
          ) : (
            <IconButton
              onClick={handleSubmit}
              icon={FaArrowUp}
              className="border px-2"
              title="Send"
              disabled={value.trim() === "" || !modelHasApiKey}
            />
          )}
        </div>
      </div>
    </div>
  );
}
