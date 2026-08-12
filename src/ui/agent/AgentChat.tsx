import { Button, Popover } from "@mantine/core";
import { FaTrash } from "react-icons/fa6";
import { useState } from "react";
import { useAgentStore, useProjectStore } from "@/lib/store";
import { IconButton } from "../IconButton";
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
  onDeleteTurn,
  onOpenDeploymentPanel,
  historyBusy,
}: {
  onApplyProposal: () => void;
  onRejectProposal: () => void;
  onReviseProposal: () => void;
  onRegenerateProposal: () => void;
  onUndoApplication: (applicationId: string) => void;
  onRedoApplication: (applicationId: string) => void;
  onDeleteTurn: (messageId: string) => void;
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
  const [deleteMessageId, setDeleteMessageId] = useState<string>();

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
            "min-w-0 mb-2 wrap-anywhere text-sm leading-5",
            msg.role === "user"
              ? "ml-auto w-fit max-w-[92%] rounded-xs border border-border bg-dropdown-default px-3 py-2"
              : "px-2 py-1",
          ].join(" ")}
        >
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1 whitespace-pre-wrap">
              {msg.content}
            </div>
            {msg.role === "user" ? (
              <Popover
                opened={deleteMessageId === msg.id}
                onChange={(opened) =>
                  setDeleteMessageId(opened ? msg.id : undefined)
                }
                position="bottom-end"
                offset={1}
                trapFocus
                returnFocus
              >
                <Popover.Target>
                  <IconButton
                    icon={FaTrash}
                    title="Delete turn"
                    size={16}
                    className="shrink-0 p-0.5 text-dimmed hover:text-white hover:outline hover:outline-border"
                    onClick={() => setDeleteMessageId(msg.id)}
                    disabled={!!activeRun || historyBusy}
                  />
                </Popover.Target>
                <Popover.Dropdown
                  aria-labelledby={`delete-turn-${msg.id}`}
                  classNames={{ dropdown: "border" }}
                >
                  <div className="flex max-w-64 flex-col gap-2 p-1">
                    <span id={`delete-turn-${msg.id}`} className="text-sm">
                      Delete this request and its response?
                    </span>
                    <span className="text-xs text-dimmed">
                      Applied project changes will remain unchanged.
                    </span>
                    <Button
                      size="compact-xs"
                      leftSection={<FaTrash className="text-red-400" />}
                      className="self-end"
                      onClick={() => {
                        setDeleteMessageId(undefined);
                        onDeleteTurn(msg.id);
                      }}
                    >
                      Yes, delete.
                    </Button>
                  </div>
                </Popover.Dropdown>
              </Popover>
            ) : null}
          </div>
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
