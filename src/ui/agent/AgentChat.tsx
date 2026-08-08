import { useAgentStore, useProjectStore } from "@/lib/store";
import { NoteText } from "../NoteText";
import { isAgentProposalStale } from "@/lib/agent/proposal";
import { AgentProposalReview } from "./AgentProposalReview";

export function AgentChat({
  onApplyProposal,
  onRejectProposal,
  onReviseProposal,
  onRegenerateProposal,
  onOpenDeploymentPanel,
  historyBusy,
}: {
  onApplyProposal: () => void;
  onRejectProposal: () => void;
  onReviseProposal: () => void;
  onRegenerateProposal: () => void;
  onOpenDeploymentPanel: () => void;
  historyBusy: boolean;
}) {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const currentProject = useProjectStore((s) => s.getCurrentProject());
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
  const recoverable = !!(
    pendingProposal &&
    currentProject?.files.some(
      (file) => file.id === pendingProposal.fileId && file.type === "operation"
    )
  );
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
          {msg.executionFeedback ? (
            <div
              aria-label={`Execution ${msg.executionFeedback.status.replace("_", " ")}`}
              className="mt-2 border-l-2 pl-2 text-sm"
            >
              {msg.executionFeedback.resultType ? (
                <div>Result type: {msg.executionFeedback.resultType.kind}</div>
              ) : null}
              {msg.executionFeedback.resultPreview !== undefined ? (
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(msg.executionFeedback.resultPreview, null, 2)}
                </pre>
              ) : null}
              {msg.executionFeedback.errors.map((error, index) => (
                <div key={`${error.type ?? "error"}-${index}`} role="alert">
                  {error.type ? `${error.type}: ` : ""}
                  {error.message}
                </div>
              ))}
              {msg.executionFeedback.reason ? (
                <div>Reason: {msg.executionFeedback.reason}</div>
              ) : null}
              {msg.executionFeedback.truncated ? (
                <div>Feedback was truncated.</div>
              ) : null}
            </div>
          ) : null}
          {msg.deploymentAction === "open-deployment-panel" ? (
            <button
              type="button"
              className="mt-2 rounded-xs border px-2 py-1 text-sm underline"
              onClick={onOpenDeploymentPanel}
              disabled={!!activeRun || historyBusy}
            >
              Open Deployment panel
            </button>
          ) : null}
          {msg.proposal ? (
            <AgentProposalReview
              proposal={msg.proposal}
              active={pendingProposal?.id === msg.proposal.id}
              stale={
                pendingProposal?.id === msg.proposal.id &&
                isAgentProposalStale(pendingProposal, currentProject)
              }
              busy={!!activeRun || historyBusy}
              recoverable={recoverable}
              diagnosticFileNames={msg.proposal.diagnostics.map((diagnostic) =>
                diagnostic.fileId
                  ? ((pendingProposal && pendingProposal.id === msg.proposal?.id
                      ? pendingProposal.proposedState?.operationFiles.find(
                          ({ file }) => file.id === diagnostic.fileId
                        )?.file.name
                      : undefined) ??
                    currentProject?.files.find(
                      (file) => file.id === diagnostic.fileId
                    )?.name)
                  : undefined
              )}
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
