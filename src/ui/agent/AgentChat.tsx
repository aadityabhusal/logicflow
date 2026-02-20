import { useAgentStore } from "@/lib/store";
import { NoteText } from "../NoteText";
import { IconButton } from "../IconButton";
import { FaTrash } from "react-icons/fa6";
import { useMemo } from "react";

export function AgentChat() {
  const { chats, currentChatId, isLoading, deleteMessagePair } =
    useAgentStore();

  const messages = useMemo(
    () => chats.find((c) => c.id === currentChatId)?.messages ?? [],
    [chats, currentChatId]
  );

  if (messages.length === 0) {
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
          <div className="whitespace-pre-wrap">{msg.content}</div>
          {msg.role === "user" && (
            <IconButton
              icon={FaTrash}
              onClick={() => deleteMessagePair(msg.id)}
              title="Delete message"
            />
          )}
        </div>
      ))}
      {isLoading ? <NoteText>Loading...</NoteText> : null}
    </div>
  );
}
