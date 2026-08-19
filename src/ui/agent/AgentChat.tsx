import { Button, Popover } from "@mantine/core";
import {
  FaArrowRotateLeft,
  FaArrowRotateRight,
  FaCheck,
  FaSpinner,
  FaTrash,
} from "react-icons/fa6";
import { useLayoutEffect, useRef, useState } from "react";
import { useAgentStore, useProjectStore } from "@/lib/store";
import type { AgentMessage, AgentRetry } from "@/lib/agent/types";
import { IconButton } from "../IconButton";
import { NoteText } from "../NoteText";
import { isAgentProposalStale } from "@/lib/agent/proposal";
import { AgentProposalReview } from "./AgentProposalReview";
import { getAgentApplicationStatus } from "@/lib/agent/history";

const CHAT_BOTTOM_THRESHOLD = 80;

function getTurnApplication(messages: AgentMessage[], userIndex: number) {
  for (let index = userIndex + 1; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === "user") return;
    if (message.proposal?.applicationId) return message.proposal.applicationId;
  }
}

function scrollToLatest(
  element: HTMLDivElement,
  bottom: HTMLDivElement | null,
) {
  bottom?.scrollIntoView?.({ block: "end" });
  element.scrollTop = element.scrollHeight;
}

export function AgentChat({
  onApplyProposal,
  onRejectProposal,
  onReviseProposal,
  onRegenerateProposal,
  onUndoApplication,
  onRedoApplication,
  onDeleteTurn,
  onOpenDeploymentPanel,
  onOpenApiKeys,
  onRetry,
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
  onOpenApiKeys: () => void;
  onRetry: (retry: AgentRetry) => void;
  historyBusy: boolean;
}) {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const { agentProjects, activeRun, pendingProposals, agentReady } =
    useAgentStore();
  const agentProject = currentProjectId
    ? agentProjects[currentProjectId]
    : undefined;
  const activeThread = agentProject?.threads.find(
    (thread) => thread.id === agentProject.activeThreadId,
  );
  const activeThreadId = activeThread?.id;
  const pendingProposal = activeThreadId
    ? pendingProposals[activeThreadId]
    : undefined;
  const recoverable = !!(
    pendingProposal &&
    currentProject?.files.some(
      (file) => file.id === pendingProposal.fileId && file.type === "operation",
    )
  );
  const threadMessages = activeThread?.messages ?? [];
  const isLoading = activeRun?.threadId === activeThreadId;
  const [deleteMessageId, setDeleteMessageId] = useState<string>();
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [jumpThreadId, setJumpThreadId] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldFollowLatest = useRef(true);
  const previousThreadId = useRef(activeThreadId);

  const isNearBottom = (element: HTMLDivElement) =>
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    CHAT_BOTTOM_THRESHOLD;

  const updateScrollState = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom = isNearBottom(element);
    shouldFollowLatest.current = nearBottom;
    setJumpThreadId(activeThreadId);
    setShowJumpToLatest(
      !nearBottom && element.scrollHeight > element.clientHeight,
    );
  };

  const handleJumpToLatest = () => {
    const element = scrollRef.current;
    if (!element) return;
    scrollToLatest(element, bottomRef.current);
    shouldFollowLatest.current = true;
    setShowJumpToLatest(false);
  };

  useLayoutEffect(() => {
    if (previousThreadId.current !== activeThreadId) {
      previousThreadId.current = activeThreadId;
      shouldFollowLatest.current = true;
    }
    if (shouldFollowLatest.current && scrollRef.current) {
      scrollToLatest(scrollRef.current, bottomRef.current);
    }
  }, [
    activeRun?.streamingContent,
    activeRun?.traces.length,
    activeThreadId,
    agentReady,
    pendingProposal?.id,
    threadMessages.length,
  ]);

  return (
    <div className="relative flex-1 min-h-0 min-w-0">
      <div
        ref={scrollRef}
        role="log"
        aria-label="Agent conversation"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={isLoading}
        onScroll={updateScrollState}
        className="h-full min-w-0 overflow-y-auto p-2"
      >
        {!agentReady ? (
          <div role="status" className="p-3 text-sm text-dimmed">
            Loading agent chats...
          </div>
        ) : !activeThread ? (
          <div role="status" className="p-3 text-sm text-dimmed">
            Preparing a new conversation...
          </div>
        ) : threadMessages.length === 0 && !isLoading ? (
          <div className="mx-auto flex max-w-sm flex-col gap-1 p-4 text-center">
            <p className="text-sm">
              Ask the agent to inspect or change your project.
            </p>
            <p className="text-xs text-dimmed">
              {currentFile?.type === "operation"
                ? "Your selected operation will be used as the starting point."
                : "Select an operation before sending a request."}
            </p>
          </div>
        ) : null}
        {threadMessages.map((msg, messageIndex) => {
          const turnApplicationId =
            msg.role === "user"
              ? getTurnApplication(threadMessages, messageIndex)
              : undefined;
          const turnApplicationStatus = turnApplicationId
            ? getAgentApplicationStatus(
                agentProject,
                turnApplicationId,
                currentProject,
              )
            : undefined;

          return (
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
                  {msg.error ? (
                    <div
                      role="alert"
                      className="rounded-xs border border-red-400/40 bg-red-400/10 p-2 text-red-100"
                    >
                      <div>{msg.content}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {msg.error.requiresApiKey ? (
                          <Button
                            size="compact-xs"
                            className="min-h-9"
                            onClick={onOpenApiKeys}
                            disabled={!!activeRun || historyBusy}
                          >
                            Add API key
                          </Button>
                        ) : null}
                        {msg.error.retry ? (
                          <Button
                            size="compact-xs"
                            className="min-h-9"
                            onClick={() => {
                              if (msg.error?.retry) onRetry(msg.error.retry);
                            }}
                            disabled={!!activeRun || historyBusy}
                          >
                            Retry request
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === "user" ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {turnApplicationId &&
                    (turnApplicationStatus === "applied" ||
                      turnApplicationStatus === "undone") ? (
                      <IconButton
                        icon={
                          turnApplicationStatus === "applied"
                            ? FaArrowRotateLeft
                            : FaArrowRotateRight
                        }
                        title={
                          turnApplicationStatus === "applied"
                            ? "Undo agent edit"
                            : "Redo agent edit"
                        }
                        size={16}
                        className="p-0.5 text-dimmed hover:text-white hover:outline hover:outline-border"
                        onClick={() =>
                          turnApplicationStatus === "applied"
                            ? onUndoApplication(turnApplicationId)
                            : onRedoApplication(turnApplicationId)
                        }
                        disabled={!!activeRun || historyBusy}
                      />
                    ) : null}
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
                          <span
                            id={`delete-turn-${msg.id}`}
                            className="text-sm"
                          >
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
                  </div>
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
                          msg.proposal.applicationId,
                          currentProject,
                        )
                      : undefined
                  }
                  diagnosticFileNames={msg.proposal.diagnostics.map(
                    (diagnostic) =>
                      diagnostic.fileId
                        ? ((pendingProposal &&
                          pendingProposal.id === msg.proposal?.id
                            ? pendingProposal.proposedState?.operationFiles.find(
                                ({ file }) => file.id === diagnostic.fileId,
                              )?.file.name
                            : undefined) ??
                          currentProject?.files.find(
                            (file) => file.id === diagnostic.fileId,
                          )?.name)
                        : undefined,
                  )}
                  onApply={onApplyProposal}
                  onReject={onRejectProposal}
                  onRevise={onReviseProposal}
                  onRegenerate={onRegenerateProposal}
                />
              ) : null}
            </article>
          );
        })}
        {isLoading ? (
          <div
            role="status"
            aria-label="Agent progress"
            className="mx-2 mb-2 rounded-xs border border-border bg-dropdown-default px-2 py-2"
          >
            <div className="px-1 text-xs text-dimmed">
              Working through your request
            </div>
            <ol className="mt-2 space-y-1 text-sm">
              {(activeRun?.traces ?? []).map((trace) => {
                const active = trace.status === "active";
                return (
                  <li
                    key={trace.id}
                    aria-current={active ? "step" : undefined}
                    className={[
                      "flex items-center gap-2 px-1",
                      active ? "text-white" : "text-disabled",
                    ].join(" ")}
                  >
                    {active ? (
                      <FaSpinner
                        aria-hidden="true"
                        className="shrink-0 animate-spin"
                        size={12}
                      />
                    ) : (
                      <FaCheck
                        aria-hidden="true"
                        className="shrink-0"
                        size={12}
                      />
                    )}
                    <span>{trace.label}</span>
                  </li>
                );
              })}
            </ol>
            {activeRun?.streamingContent ? (
              <NoteText className="mt-2 border-t border-border/60 px-1 pt-2">
                {activeRun.streamingContent}
              </NoteText>
            ) : null}
          </div>
        ) : null}
        <div ref={bottomRef} aria-hidden="true" className="h-px" />
      </div>
      {showJumpToLatest && jumpThreadId === activeThreadId ? (
        <Button
          size="compact-xs"
          className="absolute bottom-3 left-1/2 min-h-9 -translate-x-1/2 shadow-lg"
          onClick={handleJumpToLatest}
        >
          Jump to latest
        </Button>
      ) : null}
    </div>
  );
}
