import { useAgentStore, useProjectStore } from "@/lib/store";
import { NoteText } from "../NoteText";

export function AgentChat() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const { agentProjects, activeRun } = useAgentStore();
  const agentProject = currentProjectId
    ? agentProjects[currentProjectId]
    : undefined;
  const activeThread = agentProject?.threads.find(
    (thread) => thread.id === agentProject.activeThreadId
  );
  const activeThreadId = activeThread?.id;
  const threadMessages = activeThread?.messages ?? [];
  const isLoading = activeRun?.threadId === activeThreadId;

  if (threadMessages.length === 0 && !isLoading) {
    return (
      <NoteText center className="py-4">
        Ask the AI to help modify your operation
      </NoteText>
    );
  }

  return (
    <div className="p-2 h-full overflow-y-auto">
      {threadMessages.map((msg) => (
        <div
          key={msg.id}
          className={[
            "rounded-xs p-2 mb-2",
            msg.role === "user" ? "bg-dropdown-scrollbar" : "",
          ].join(" ")}
        >
          <div className="whitespace-pre-wrap">{msg.content}</div>
        </div>
      ))}
      {isLoading ? (
        <NoteText>{activeRun?.streamingContent || "Loading..."}</NoteText>
      ) : null}
    </div>
  );
}
