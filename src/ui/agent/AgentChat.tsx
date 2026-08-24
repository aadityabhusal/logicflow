import { Button, Popover } from "@mantine/core";
import {
  FaArrowRotateLeft,
  FaArrowRotateRight,
  FaCheck,
  FaSpinner,
  FaTrash,
} from "react-icons/fa6";
import { useLayoutEffect, useRef, useState } from "react";
import { useAgentRunStore, useAgentStore, useProjectStore } from "@/lib/store";
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

function scrollToLatest(element: HTMLDivElement) {
  element.scrollTop = element.scrollHeight;
}

function AgentStreamingContent({ threadId }: { threadId: string }) {
  const content = useAgentRunStore((state) =>
    state.activeRun?.threadId === threadId
      ? state.activeRun.streamingContent
      : "",
  );
  return content ? (
    <NoteText className="mt-2 border-t border-border/60 px-1 pt-2">
      {content}
    </NoteText>
  ) : null;
}

function AgentRunProgress({ threadId }: { threadId: string }) {
  const traces = useAgentRunStore((state) =>
    state.activeRun?.threadId === threadId ? state.activeRun.traces : [],
  );
  return (
    <div
      role="status"
      aria-label="Agent progress"
      className="mx-2 mb-2 rounded-xs border border-border bg-dropdown-default px-2 py-2"
    >
      <div className="px-1 text-xs text-dimmed">
        Working through your request
      </div>
      <ol className="mt-2 space-y-1 text-sm">
        {traces.map((trace) => {
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
                <FaCheck aria-hidden="true" className="shrink-0" size={12} />
              )}
              <span>{trace.label}</span>
            </li>
          );
        })}
      </ol>
      <AgentStreamingContent threadId={threadId} />
    </div>
  );
}

function AgentAutoScroll({
  activeThreadId,
  agentReady,
  messageCount,
  pendingProposalId,
  previousThreadId: previousThreadIdRef,
  scrollRef,
  shouldFollowLatest: shouldFollowLatestRef,
}: {
  activeThreadId?: string;
  agentReady: boolean;
  messageCount: number;
  pendingProposalId?: string;
  previousThreadId: React.MutableRefObject<string | undefined>;
  scrollRef: React.RefObject<HTMLDivElement>;
  shouldFollowLatest: React.MutableRefObject<boolean>;
}) {
  const runUpdate = useAgentRunStore((state) => {
    const run = state.activeRun;
    if (!run || run.threadId !== activeThreadId) return [0, ""];
    return [run.traces.length, run.streamingContent];
  });

  useLayoutEffect(() => {
    if (previousThreadIdRef.current !== activeThreadId) {
      previousThreadIdRef.current = activeThreadId;
      shouldFollowLatestRef.current = true;
    }
    if (!shouldFollowLatestRef.current || !scrollRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (shouldFollowLatestRef.current && scrollRef.current) {
        scrollToLatest(scrollRef.current);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    activeThreadId,
    agentReady,
    messageCount,
    pendingProposalId,
    previousThreadIdRef,
    runUpdate,
    scrollRef,
    shouldFollowLatestRef,
  ]);

  return null;
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
  const agentProject = useAgentStore((state) =>
    currentProjectId ? state.agentProjects[currentProjectId] : undefined,
  );
  const agentReady = useAgentStore((state) => state.agentReady);
  const activeThread = agentProject?.threads.find(
    (thread) => thread.id === agentProject.activeThreadId,
  );
  const activeThreadId = activeThread?.id;
  const pendingProposal = useAgentStore((state) =>
    activeThreadId ? state.pendingProposals[activeThreadId] : undefined,
  );
  const recoverable = !!(
    pendingProposal &&
    currentProject?.files.some(
      (file) => file.id === pendingProposal.fileId && file.type === "operation",
    )
  );
  const threadMessages = activeThread?.messages ?? [];
  const isLoading = useAgentRunStore(
    (state) => state.activeRun?.threadId === activeThreadId,
  );
  const isRunning = useAgentRunStore((state) => !!state.activeRun);
  const [deleteMessageId, setDeleteMessageId] = useState<string>();
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [jumpThreadId, setJumpThreadId] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
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
    scrollToLatest(element);
    shouldFollowLatest.current = true;
    setShowJumpToLatest(false);
  };

  return (
    <div className="relative flex-1 min-h-0 min-w-0">
      <AgentAutoScroll
        activeThreadId={activeThreadId}
        agentReady={agentReady}
        messageCount={threadMessages.length}
        pendingProposalId={pendingProposal?.id}
        previousThreadId={previousThreadId}
        scrollRef={scrollRef}
        shouldFollowLatest={shouldFollowLatest}
      />
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
                            disabled={isRunning || historyBusy}
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
                            disabled={isRunning || historyBusy}
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
                        disabled={isRunning || historyBusy}
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
                          disabled={isRunning || historyBusy}
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
                  disabled={isRunning || historyBusy}
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
                  busy={isRunning || historyBusy}
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
        {isLoading && activeThreadId ? (
          <AgentRunProgress threadId={activeThreadId} />
        ) : null}
        <div aria-hidden="true" className="h-px" />
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
