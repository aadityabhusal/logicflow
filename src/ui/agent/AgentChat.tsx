import { useAgentStore } from "@/lib/store";
import { NoteText } from "../NoteText";

export function AgentChat() {
  const { messages, isLoading } = useAgentStore();

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
            "rounded-md p-2 mb-2",
            msg.role === "user" ? "bg-dropdown-scrollbar" : "",
          ].join(" ")}
        >
          <div className="whitespace-pre-wrap">{msg.content}</div>
        </div>
      ))}
      {isLoading ? <NoteText>Loading...</NoteText> : null}
    </div>
  );
}
