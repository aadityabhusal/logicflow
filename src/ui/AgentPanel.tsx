import { PasswordInput, Popover } from "@mantine/core";
import { FaKey, FaTrash, FaPlus, FaClockRotateLeft } from "react-icons/fa6";
import { AgentChat } from "./agent/AgentChat";
import { AgentInput } from "./agent/AgentInput";
import { runAgent } from "@/lib/agent/agent-service";
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
    chats,
    currentChatId,
    addChat,
    deleteChat,
    setCurrentChatId,
    updateToolCall,
    undoToMessage,
  } = useAgentStore();

  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const updateFile = useProjectStore((s) => s.updateFile);

  const handleSubmit = async (prompt: string) => {
    const currentOperation = createOperationFromFile(currentFile);
    if (!currentOperation) {
      addMessage({
        role: "assistant",
        content:
          "Please open an operation file first. The agent can only modify operation files.",
      });
      return;
    }

    const modelConfig = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
    if (!modelConfig) return;

    const apiKey = getApiKey(modelConfig.provider);
    if (!apiKey) return;

    addMessage({ role: "user", content: prompt, operationSnapshot: currentOperation });
    setIsLoading(true);

    try {
      const result = await runAgent({
        operation: currentOperation,
        userPrompt: prompt,
        model: `${modelConfig.provider}/${modelConfig.id}`,
        apiKey,
        onToolCall: (toolCall) => {
          updateToolCall(toolCall.id, toolCall);
        },
      });

      addMessage({
        role: "assistant",
        content: result.finalMessage,
      });

      const lastContent = createFileFromOperation(currentOperation).content;
      fileHistoryActions.pushState(currentOperation.id, lastContent);

      updateFile(
        currentOperation.id,
        createFileFromOperation(result.operation)
      );
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

  const handleUndoToMessage = (messageId: string) => {
    const snapshot = undoToMessage(messageId);
    if (snapshot) {
      updateFile(snapshot.id, createFileFromOperation(snapshot));
      fileHistoryActions.pushState(snapshot.id, createFileFromOperation(snapshot).content);
    }
  };

  return (
    <div className="flex flex-col h-full bg-editor">
      <div className="flex justify-between items-center p-1 border-b gap-1">
        <div className="px-2 text-sm font-medium truncate">
          {chats.find((c) => c.id === currentChatId)?.name ?? "Agent"}
        </div>
        <IconButton
          icon={FaPlus}
          onClick={() => addChat()}
          title="New chat"
          className="ml-auto p-0.5 hover:bg-dropdown-hover"
        />
        <Popover position="bottom-end" shadow="md">
          <Popover.Target>
            <IconButton
              icon={FaClockRotateLeft}
              title="Chat history"
              size={14}
              className="p-1 hover:bg-dropdown-hover"
            />
          </Popover.Target>
          <Popover.Dropdown
            classNames={{ dropdown: "border p-1 min-w-[200px]" }}
          >
            <div className="flex flex-col gap-1">
              <p className="p-1">Recent Chats</p>
              {chats.length === 0 && <p className="p-1 italic">No chats yet</p>}
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={[
                    "flex items-center justify-between gap-4 p-1 cursor-pointer hover:bg-dropdown-hover",
                    chat.id === currentChatId ? "bg-dropdown-selected" : "",
                  ].join(" ")}
                  onClick={() => setCurrentChatId(chat.id)}
                >
                  <p className="truncate">{chat.name}</p>
                  <IconButton
                    icon={FaTrash}
                    size={12}
                    title="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                  />
                </div>
              ))}
            </div>
          </Popover.Dropdown>
        </Popover>
        <Popover position="top-start">
          <Popover.Target>
            <IconButton
              icon={FaKey}
              size={14}
              title="Add API keys"
              className="p-1 hover:bg-dropdown-hover"
            />
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

      <AgentChat onUndoToMessage={handleUndoToMessage} />
      <AgentInput onSubmit={handleSubmit} />
    </div>
  );
}
