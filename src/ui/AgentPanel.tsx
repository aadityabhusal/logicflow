import { PasswordInput, Popover } from "@mantine/core";
import { FaKey, FaTrash } from "react-icons/fa6";
import { AgentChat } from "./agent/AgentChat";
import { AgentInput } from "./agent/AgentInput";
import {
  generateOperationChanges,
  applyChangesToOperation,
} from "@/lib/agent/agent-service";
import {
  useProjectStore,
  fileHistoryActions,
  useAgentStore,
} from "@/lib/store";
import { AVAILABLE_MODELS, LLM_PROVIDERS } from "@/lib/data";
import { IconButton } from "./IconButton";
import { createFileFromOperation, createOperationFromFile } from "@/lib/utils";

export function AgentPanel() {
  const {
    selectedModel,
    addMessage,
    setIsLoading,
    getApiKey,
    setApiKey,
    clearMessages,
  } = useAgentStore();

  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const updateFile = useProjectStore((s) => s.updateFile);

  const handleSubmit = async (prompt: string) => {
    const currentOperation = createOperationFromFile(currentFile);
    if (!currentOperation) return;

    const modelConfig = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
    if (!modelConfig) return;
    const apiKey = getApiKey(modelConfig.provider);
    if (!apiKey) return;

    addMessage({ role: "user", content: prompt });
    setIsLoading(true);

    try {
      const { response, mappingContext } = await generateOperationChanges({
        operation: currentOperation,
        userPrompt: prompt,
        model: `${modelConfig.provider}/${modelConfig.id}`,
        apiKey,
      });

      addMessage({
        role: "assistant",
        content: response.explanation || "Changes applied successfully.",
        changes: response.changes,
      });

      if (response.changes.length > 0) {
        const lastContent = createFileFromOperation(currentOperation).content;
        fileHistoryActions.pushState(currentOperation.id, lastContent);
        const updatedOperation = applyChangesToOperation(
          currentOperation,
          response.changes,
          mappingContext
        );
        updateFile(
          currentOperation.id,
          createFileFromOperation(updatedOperation)
        );
      }
    } catch (error) {
      addMessage({
        role: "assistant",
        content: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-editor">
      <div className="flex justify-between items-center p-1 border-b gap-4">
        <div className="mr-auto">Agent</div>
        <IconButton
          icon={FaTrash}
          onClick={clearMessages}
          title="Clear messages"
        />
        <Popover position="top-start">
          <Popover.Target>
            <IconButton icon={FaKey} size={14} title="Add API keys" />
          </Popover.Target>
          <Popover.Dropdown classNames={{ dropdown: "border" }}>
            <div className="flex flex-col gap-1">
              {Object.entries(LLM_PROVIDERS).map(([id, { name, Icon }]) => (
                <PasswordInput
                  key={id}
                  leftSection={<Icon />}
                  placeholder={`Enter ${name} key`}
                  classNames={{
                    wrapper: "p-1",
                    innerInput: "focus:outline outline-white p-0.5",
                  }}
                  value={getApiKey(id as keyof typeof LLM_PROVIDERS)}
                  onChange={(e) =>
                    setApiKey(id as keyof typeof LLM_PROVIDERS, e.target.value)
                  }
                />
              ))}
            </div>
          </Popover.Dropdown>
        </Popover>
      </div>
      <AgentChat />
      <AgentInput onSubmit={handleSubmit} />
    </div>
  );
}
