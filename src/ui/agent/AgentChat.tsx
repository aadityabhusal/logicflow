import { Menu } from "@mantine/core";
import { FaEllipsisVertical, FaTrash, FaRotateLeft } from "react-icons/fa6";
import { useAgentStore } from "@/lib/store";
import { NoteText } from "../NoteText";
import { IconButton } from "../IconButton";
import { useMemo } from "react";
import { ToolCallDisplayComponent } from "./ToolCallDisplay";

interface AgentChatProps {
  onUndoToMessage: (messageId: string) => void;
}

export function AgentChat({ onUndoToMessage }: AgentChatProps) {
  const {
    chats,
    currentChatId,
    isLoading,
    deleteMessagePair,
    pendingToolCalls,
  } = useAgentStore();

  const messages = useMemo(
    () => chats.find((c) => c.id === currentChatId)?.messages ?? [],
    [chats, currentChatId]
  );

  if (messages.length === 0 && pendingToolCalls.length === 0) {
    return (
      <NoteText center className="py-4">
        Ask the AI to help modify your operation
      </NoteText>
    );
  }

  return (
    <div className="p-2 h-full overflow-y-auto">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={[
            "flex items-start justify-between rounded-md p-2 mb-2",
            msg.role === "user" ? "bg-dropdown-scrollbar" : "",
          ].join(" ")}
        >
          <div className="flex-1 min-w-0">
            <div className="whitespace-pre-wrap">{msg.content}</div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {msg.toolCalls.map((tc) => (
                  <ToolCallDisplayComponent key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}
          </div>
          {msg.role === "user" && (
            <Menu position="bottom-end">
              <Menu.Target>
                <IconButton icon={FaEllipsisVertical} className="p-1" />
              </Menu.Target>
              <Menu.Dropdown>
                {msg.operationSnapshot && (
                  <Menu.Item
                    leftSection={<FaRotateLeft size={12} />}
                    onClick={() => onUndoToMessage(msg.id)}
                  >
                    Undo
                  </Menu.Item>
                )}
                <Menu.Item
                  leftSection={<FaTrash size={12} />}
                  color="red"
                  onClick={() => deleteMessagePair(msg.id)}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </div>
      ))}
      {isLoading && pendingToolCalls.length > 0 && (
        <div className="rounded-md p-2 mb-2">
          <div className="text-sm text-gray-400 mb-1">Processing...</div>
          <div className="flex flex-col gap-1">
            {pendingToolCalls.map((tc) => (
              <ToolCallDisplayComponent key={tc.id} toolCall={tc} />
            ))}
          </div>
        </div>
      )}
      {isLoading && pendingToolCalls.length === 0 && (
        <NoteText>Loading...</NoteText>
      )}
    </div>
  );
}
