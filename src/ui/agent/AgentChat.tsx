import { useAgentStore, useProjectStore } from "@/lib/store";
import { NoteText } from "../NoteText";
import { isAgentProposalStale } from "@/lib/agent/proposal";
import { AgentProposalReview } from "./AgentProposalReview";
import { getAgentApplicationStatus } from "@/lib/agent/history";

export function AgentChat({
  onApplyProposal,
  onRejectProposal,
  onReviseProposal,
  onRegenerateProposal,
  onUndoApplication,
  onRedoApplication,
  onOpenDeploymentPanel,
  historyBusy,
}: {
  onApplyProposal: () => void;
  onRejectProposal: () => void;
  onReviseProposal: () => void;
  onRegenerateProposal: () => void;
  onUndoApplication: (applicationId: string) => void;
  onRedoApplication: (applicationId: string) => void;
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

  return (
    <div
      role="log"
      aria-label="Agent conversation"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isLoading}
      className="flex-1 min-h-0 min-w-0 overflow-y-auto p-2"
    >
      {threadMessages.map((msg) => (
        <article
          key={msg.id}
          aria-label={msg.role === "user" ? "You" : "Agent"}
          className={[
            "min-w-0 rounded-xs p-2 mb-2 wrap-anywhere",
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
              className="mt-2 min-h-9 rounded-xs border px-2 py-1 text-sm underline"
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
              applicationStatus={
                msg.proposal.applicationId
                  ? getAgentApplicationStatus(
                      agentProject,
                      msg.proposal.applicationId
                    )
                  : undefined
              }
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
              onUndo={() =>
                msg.proposal?.applicationId &&
                onUndoApplication(msg.proposal.applicationId)
              }
              onRedo={() =>
                msg.proposal?.applicationId &&
                onRedoApplication(msg.proposal.applicationId)
              }
            />
          ) : null}
        </article>
      ))}
      {isLoading ? (
        <div>
          <NoteText>{activeRun?.streamingContent || "Loading..."}</NoteText>
        </div>
      ) : null}
    </div>
  );
}
