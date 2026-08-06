import { useAgentStore, useProjectStore } from "@/lib/store";
import { NoteText } from "../NoteText";
import { isAgentProposalStale } from "@/lib/agent/proposal";
import { AgentProposalReview } from "./AgentProposalReview";

export function AgentChat({
  onApplyProposal,
  onRejectProposal,
  onReviseProposal,
  onRegenerateProposal,
  historyBusy,
}: {
  onApplyProposal: () => void;
  onRejectProposal: () => void;
  onReviseProposal: () => void;
  onRegenerateProposal: () => void;
  historyBusy: boolean;
}) {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const { agentProjects, activeRun, pendingProposals } = useAgentStore();
  const agentProject = currentProjectId
    ? agentProjects[currentProjectId]
    : undefined;
  const activeThread = agentProject?.threads.find(
    (thread) => thread.id === agentProject.activeThreadId
  );
  const activeThreadId = activeThread?.id;
  const pendingProposal = activeThreadId
    ? pendingProposals[activeThreadId]
    : undefined;
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
          {msg.proposal ? (
            <AgentProposalReview
              proposal={msg.proposal}
              active={pendingProposal?.id === msg.proposal.id}
              stale={
                pendingProposal?.id === msg.proposal.id &&
                (isAgentProposalStale(pendingProposal, currentProject) ||
                  currentFile?.id !== pendingProposal.fileId)
              }
              busy={!!activeRun || historyBusy}
              recoverable={currentFile?.id === pendingProposal?.fileId}
              onApply={onApplyProposal}
              onReject={onRejectProposal}
              onRevise={onReviseProposal}
              onRegenerate={onRegenerateProposal}
            />
          ) : null}
        </div>
      ))}
      {isLoading ? (
        <NoteText>{activeRun?.streamingContent || "Loading..."}</NoteText>
      ) : null}
    </div>
  );
}
