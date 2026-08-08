import { Button, Menu, PasswordInput, Popover } from "@mantine/core";
import {
  FaArrowRotateLeft,
  FaArrowRotateRight,
  FaListUl,
  FaPen,
  FaPlus,
  FaTrash,
} from "react-icons/fa6";
import { AgentChat } from "./agent/AgentChat";
import { AgentInput } from "./agent/AgentInput";
import {
  generateExecutionFeedbackResponse,
  generateOperationProposal,
  getExplicitDeploymentIntent,
} from "@/lib/agent/agent-service";
import {
  useProjectStore,
  useAgentStore,
  useAgentPersistenceErrorStore,
  useSidebarTabStore,
} from "@/lib/store";
import { AVAILABLE_MODELS, LLM_PROVIDERS } from "@/lib/data";
import { IconButton } from "./IconButton";
import { createOperationFromFile } from "@/lib/utils";
import { MdVpnKey } from "react-icons/md";
import { type FocusEvent, useEffect, useRef, useState } from "react";
import { AgentTransportError } from "@/lib/agent/transport";
import {
  applyAgentProposal,
  canRedoAgentEdit,
  canUndoAgentEdit,
  redoAgentEdit,
  undoAgentEdit,
} from "@/lib/agent/history";
import { executionController } from "@/lib/execution/controller";
import {
  createAgentExecutionFeedback,
  getAgentExecutionSecrets,
} from "@/lib/agent/execution-feedback";

export function AgentPanel() {
  const {
    selectedModel,
    addMessage,
    getApiKey,
    setApiKey,
    agentProjects,
    agentReady,
    createThread,
    renameThread,
    selectThread,
    removeThread,
    startRun,
    setStreamingContent,
    finishRun,
    activeRun,
    pendingProposals,
    setPendingProposal,
    setDraft,
  } = useAgentStore();

  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const abortController = useRef<AbortController>();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [editingThreadId, setEditingThreadId] = useState<string>();
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [revisionProposalId, setRevisionProposalId] = useState<string>();
  const [historyBusy, setHistoryBusy] = useState(false);
  const [executionPending, setExecutionPending] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const persistenceError = useAgentPersistenceErrorStore((s) => s.error);
  const agentProject = currentProjectId
    ? agentProjects[currentProjectId]
    : undefined;
  const projectThreads = agentProject?.threads ?? [];
  const activeThread = projectThreads.find(
    (thread) => thread.id === agentProject?.activeThreadId
  );
  const activeThreadId = activeThread?.id;
  const pendingProposal = activeThreadId
    ? pendingProposals[activeThreadId]
    : undefined;

  useEffect(() => {
    abortController.current?.abort();
  }, [currentProjectId]);

  useEffect(() => {
    if (agentReady && currentProjectId && !agentProject) {
      createThread(currentProjectId);
    }
  }, [agentProject, agentReady, createThread, currentProjectId]);

  useEffect(
    () => () => {
      abortController.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (editingThreadId) renameInputRef.current?.focus();
  }, [editingThreadId]);

  useEffect(() => {
    setEditingThreadId(undefined);
    setDeleteConfirmationOpen(false);
    setRevisionProposalId(undefined);
    setHistoryError(undefined);
  }, [activeThreadId, currentProjectId]);

  const handleSubmit = async (
    prompt: string,
    options?: {
      regenerate?: boolean;
      sourceFileId?: string;
      repairAttempt?: number;
      manualDeploymentAfterApply?: boolean;
    }
  ) => {
    if (useAgentStore.getState().activeRun) return;
    const submittedProject = useProjectStore.getState().getCurrentProject();
    const deploymentIntent =
      !options?.regenerate && !options?.repairAttempt
        ? getExplicitDeploymentIntent(prompt)
        : undefined;
    if (!submittedProject || !currentProjectId || !activeThreadId) return;
    if (deploymentIntent && !deploymentIntent.afterChanges) {
      if (!options?.regenerate && !options?.repairAttempt) {
        addMessage(activeThreadId, { role: "user", content: prompt });
      }
      addMessage(activeThreadId, {
        role: "assistant",
        content:
          "Open the Deployment panel to configure and deploy this project.",
        deploymentAction: "open-deployment-panel",
      });
      return;
    }
    const sourceFileId = options?.sourceFileId ?? currentFile?.id;
    const sourceFile = submittedProject.files.find(
      (file) => file.id === sourceFileId && file.type === "operation"
    );
    const currentOperation = createOperationFromFile(sourceFile);
    if (!currentOperation || !sourceFile || !submittedProject) return;

    const modelConfig = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
    if (!modelConfig) return;
    const apiKey = getApiKey(modelConfig.provider);
    if (!apiKey) return;

    if (!options?.regenerate && !options?.repairAttempt) {
      addMessage(activeThreadId, { role: "user", content: prompt });
    }
    const revisedProposal =
      pendingProposal &&
      pendingProposal.id === revisionProposalId &&
      pendingProposal.projectId === currentProjectId &&
      pendingProposal.threadId === activeThreadId &&
      pendingProposal.fileId === sourceFile.id &&
      !options?.regenerate
        ? pendingProposal
        : undefined;
    const requestPrompt = revisedProposal
      ? `Original request:\n${revisedProposal.sourcePrompt}\n\nCurrent proposal draft:\n${JSON.stringify(revisedProposal.draft)}\n\nRequested revision:\n${prompt}`
      : prompt;
    const controller = new AbortController();
    abortController.current = controller;
    startRun(activeThreadId);

    try {
      const { response, proposal } = await generateOperationProposal({
        operation: currentOperation,
        project: submittedProject,
        userPrompt: requestPrompt,
        model: `${modelConfig.provider}/${modelConfig.id}`,
        apiKey,
        initialProposal: revisedProposal,
        abortSignal: controller.signal,
        onPartialExplanation: setStreamingContent,
      });

      if (controller.signal.aborted) return;
      const manualDeploymentAfterApply =
        options?.manualDeploymentAfterApply ??
        revisedProposal?.manualDeploymentAfterApply ??
        (options?.regenerate
          ? pendingProposal?.manualDeploymentAfterApply
          : deploymentIntent?.afterChanges);
      addMessage(activeThreadId, {
        role: "assistant",
        content:
          response.explanation ||
          (proposal ? "Proposal ready for review." : "No changes proposed."),
        proposal: proposal
          ? {
              id: proposal.id,
              review: proposal.review,
              diagnostics: proposal.diagnostics,
            }
          : undefined,
      });
      if (proposal) {
        setPendingProposal(activeThreadId, {
          ...proposal,
          threadId: activeThreadId,
          repairAttempt:
            options?.repairAttempt ??
            revisedProposal?.repairAttempt ??
            (options?.regenerate ? pendingProposal?.repairAttempt : undefined),
          sourcePrompt: options?.regenerate
            ? prompt
            : revisedProposal
              ? revisedProposal.sourcePrompt
              : prompt,
          manualDeploymentAfterApply,
        });
      }
      setRevisionProposalId(undefined);
    } catch (error) {
      if (
        !(error instanceof AgentTransportError) ||
        error.code !== "cancelled"
      ) {
        addMessage(activeThreadId, {
          role: "assistant",
          content: `Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    } finally {
      if (abortController.current === controller) {
        abortController.current = undefined;
      }
      finishRun(activeThreadId);
    }
  };

  const handleRejectProposal = () => {
    if (activeThreadId) setPendingProposal(activeThreadId, undefined);
    setRevisionProposalId(undefined);
  };

  const handleExecutionFeedback = async (
    feedback: Parameters<
      typeof generateExecutionFeedbackResponse
    >[0]["feedback"],
    threadId: string
  ) => {
    const modelConfig = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
    if (!modelConfig) return;
    const apiKey = getApiKey(modelConfig.provider);
    if (!apiKey) return;
    const controller = new AbortController();
    abortController.current = controller;
    startRun(threadId);
    try {
      const response = await generateExecutionFeedbackResponse({
        feedback,
        model: `${modelConfig.provider}/${modelConfig.id}`,
        apiKey,
        abortSignal: controller.signal,
        onPartialExplanation: setStreamingContent,
      });
      if (!controller.signal.aborted) {
        addMessage(threadId, {
          role: "assistant",
          content: response.explanation || `Execution ${feedback.status}.`,
        });
      }
    } catch (error) {
      if (
        !(error instanceof AgentTransportError) ||
        error.code !== "cancelled"
      ) {
        addMessage(threadId, {
          role: "assistant",
          content: `Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    } finally {
      if (abortController.current === controller) {
        abortController.current = undefined;
      }
      finishRun(threadId);
    }
  };

  const handleHistoryAction = async (action: () => Promise<unknown>) => {
    if (historyBusy || activeRun) return;
    setHistoryBusy(true);
    setHistoryError(undefined);
    try {
      await action();
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Agent edit failed"
      );
    } finally {
      setHistoryBusy(false);
    }
  };

  const handleApplyProposal = () => {
    if (!pendingProposal) return;
    const proposal = pendingProposal;
    void handleHistoryAction(async () => {
      setExecutionPending(true);
      try {
        const application = await applyAgentProposal(proposal);
        const outcome = await executionController.waitForApplication(
          application.id
        );
        if (outcome.projectId !== proposal.projectId) {
          throw new Error("Execution feedback belongs to another project");
        }
        const projectState = useProjectStore.getState();
        const project = projectState.projects[proposal.projectId];
        if (!project) return;
        const selectedFile = project?.files.find(
          (file) =>
            file.id === application.afterSelectedFileId &&
            file.type === "operation"
        );
        const operation = createOperationFromFile(selectedFile);
        const feedback = createAgentExecutionFeedback({
          outcome,
          operation,
          secrets: getAgentExecutionSecrets(
            project,
            useAgentStore.getState().apiKeys
          ).concat(outcome.redactionValues ?? []),
        });
        addMessage(proposal.threadId!, {
          role: "assistant",
          content: `Execution ${feedback.status.replace("_", " ")}.`,
          executionFeedback: feedback,
        });

        const repairAttempt = (proposal.repairAttempt ?? 0) + 1;
        const canContinue =
          projectState.currentProjectId === proposal.projectId &&
          useAgentStore.getState().agentProjects[proposal.projectId]
            ?.activeThreadId === proposal.threadId;
        if (
          feedback.status === "failed" &&
          repairAttempt <= 2 &&
          application.afterSelectedFileId &&
          canContinue
        ) {
          await handleSubmit(
            `The previous proposal was applied. Use this sanitized execution feedback to propose a focused repair. Do not apply it:\n${JSON.stringify(feedback)}`,
            {
              sourceFileId: application.afterSelectedFileId,
              repairAttempt,
              manualDeploymentAfterApply: proposal.manualDeploymentAfterApply,
            }
          );
        } else if (canContinue) {
          await handleExecutionFeedback(feedback, proposal.threadId!);
          if (
            proposal.manualDeploymentAfterApply &&
            feedback.status === "succeeded"
          ) {
            addMessage(proposal.threadId!, {
              role: "assistant",
              content: "The proposal was applied successfully.",
              deploymentAction: "open-deployment-panel",
            });
          }
        }
      } finally {
        setExecutionPending(false);
      }
    });
  };

  const handleReviseProposal = () => {
    const project = useProjectStore.getState().getCurrentProject();
    if (
      !pendingProposal ||
      !activeThreadId ||
      pendingProposal.projectId !== currentProjectId ||
      pendingProposal.threadId !== activeThreadId ||
      !project?.files.some(
        (file) =>
          file.id === pendingProposal.fileId && file.type === "operation"
      )
    )
      return;
    setRevisionProposalId(pendingProposal.id);
    setDraft(activeThreadId, "Revise the proposal: ");
  };

  const handleRegenerateProposal = () => {
    if (
      !pendingProposal ||
      pendingProposal.projectId !== currentProjectId ||
      pendingProposal.threadId !== activeThreadId ||
      useAgentStore.getState().activeRun
    )
      return;
    void handleSubmit(pendingProposal.sourcePrompt, {
      regenerate: true,
      sourceFileId: pendingProposal.fileId,
    });
  };

  const handleRenameThread = ({
    currentTarget,
  }: FocusEvent<HTMLInputElement>) => {
    if (activeThread) renameThread(activeThread.id, currentTarget.value);
    setEditingThreadId(undefined);
  };

  return (
    <div className="flex flex-col h-full bg-editor">
      <div className="flex justify-between items-center p-1 border-b gap-1 bg-dropdown-default">
        <Menu position="bottom-start">
          <Menu.Target>
            <IconButton
              icon={FaListUl}
              title="Chat list"
              aria-label="Chat list"
              disabled={!!activeRun || !currentProjectId}
            />
          </Menu.Target>
          <Menu.Dropdown>
            {projectThreads.map((thread) => (
              <Menu.Item
                key={thread.id}
                onClick={() =>
                  currentProjectId && selectThread(currentProjectId, thread.id)
                }
                classNames={{
                  item:
                    thread.id === activeThreadId ? "bg-dropdown-selected" : "",
                }}
              >
                <span className="block max-w-56 truncate">{thread.title}</span>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <div className="flex min-w-0 items-center gap-1">
          {editingThreadId === activeThreadId && activeThread ? (
            <input
              ref={renameInputRef}
              aria-label="Chat name"
              className="min-w-0 flex-1 rounded-xs p-0.5 focus:outline outline-white"
              defaultValue={activeThread.title}
              onBlur={handleRenameThread}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setEditingThreadId(undefined);
                }
              }}
            />
          ) : (
            <span
              className="max-w-40 truncate p-0.5"
              title={activeThread?.title}
            >
              {activeThread?.title ?? "Agent"}
            </span>
          )}
          {!editingThreadId ? (
            <IconButton
              icon={FaPen}
              onClick={() =>
                activeThread && setEditingThreadId(activeThread.id)
              }
              size={14}
              title="Rename chat"
              aria-label="Rename chat"
              className="px-0.5 hover:outline hover:outline-border"
              disabled={!activeThread || !!activeRun}
            />
          ) : null}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <IconButton
            icon={FaArrowRotateLeft}
            title="Undo agent edit"
            disabled={
              historyBusy || !!activeRun || !canUndoAgentEdit(agentProject)
            }
            onClick={() =>
              currentProjectId &&
              void handleHistoryAction(() => undoAgentEdit(currentProjectId))
            }
          />
          <IconButton
            icon={FaArrowRotateRight}
            title="Redo agent edit"
            disabled={
              historyBusy || !!activeRun || !canRedoAgentEdit(agentProject)
            }
            onClick={() =>
              currentProjectId &&
              void handleHistoryAction(() => redoAgentEdit(currentProjectId))
            }
          />
          <Popover
            position="bottom-end"
            offset={1}
            opened={deleteConfirmationOpen}
            onChange={setDeleteConfirmationOpen}
            trapFocus
            returnFocus
          >
            <Popover.Target>
              <IconButton
                icon={FaTrash}
                title="Delete chat"
                size={14}
                aria-label="Delete chat"
                className="p-0.5 hover:outline hover:outline-border"
                disabled={!activeThread || !!activeRun}
                onClick={() => setDeleteConfirmationOpen((opened) => !opened)}
              />
            </Popover.Target>
            <Popover.Dropdown classNames={{ dropdown: "border" }}>
              <div className="flex flex-col gap-2 p-1">
                <span className="text-sm">Delete this chat?</span>
                <Button
                  leftSection={<FaTrash className="text-red-400" />}
                  className="text-sm self-end"
                  onClick={() => {
                    const threadId = activeThreadId;
                    setDeleteConfirmationOpen(false);
                    if (threadId) removeThread(threadId);
                  }}
                >
                  Yes, delete.
                </Button>
              </div>
            </Popover.Dropdown>
          </Popover>
          <IconButton
            icon={FaPlus}
            onClick={() => currentProjectId && createThread(currentProjectId)}
            title="New chat"
            disabled={!!activeRun || !currentProjectId || !agentProject}
          />
          <Popover position="top-start">
            <Popover.Target>
              <IconButton icon={MdVpnKey} title="Add API keys" />
            </Popover.Target>
            <Popover.Dropdown classNames={{ dropdown: "border" }}>
              <div className="flex flex-col gap-1">
                <p className="px-1 text-xs text-dimmed">
                  Keys stay in this browser tab and are not saved.
                </p>
                {Object.entries(LLM_PROVIDERS).map(([id, { name, Icon }]) => (
                  <PasswordInput
                    key={id}
                    leftSection={<Icon />}
                    placeholder={`Enter ${name} key`}
                    classNames={{
                      wrapper: "p-1",
                      innerInput: "focus:outline outline-white p-0.5",
                    }}
                    value={getApiKey(id as keyof typeof LLM_PROVIDERS)}
                    onChange={(e) =>
                      setApiKey(
                        id as keyof typeof LLM_PROVIDERS,
                        e.target.value
                      )
                    }
                  />
                ))}
              </div>
            </Popover.Dropdown>
          </Popover>
        </div>
      </div>
      {persistenceError ? (
        <div className="border-b p-2 text-xs">
          <p>{persistenceError}</p>
          <Button
            size="compact-xs"
            className="mt-1"
            onClick={() =>
              useAgentPersistenceErrorStore.setState({ error: undefined })
            }
          >
            Dismiss
          </Button>
        </div>
      ) : null}
      {historyError ? (
        <div role="alert" className="border-b p-2 text-xs">
          {historyError}
        </div>
      ) : null}
      {executionPending ? (
        <div role="status" className="border-b p-2 text-xs">
          Running the selected operation...
        </div>
      ) : null}
      <p className="border-b p-2 text-xs text-dimmed">
        Sanitized execution feedback may be sent to the selected model provider.
      </p>
      <AgentChat
        onApplyProposal={handleApplyProposal}
        onRejectProposal={handleRejectProposal}
        onReviseProposal={handleReviseProposal}
        onRegenerateProposal={handleRegenerateProposal}
        onOpenDeploymentPanel={() =>
          useSidebarTabStore.getState().setActiveTab("deployment")
        }
        historyBusy={historyBusy}
      />
      <AgentInput
        onSubmit={(prompt) =>
          handleSubmit(prompt, {
            sourceFileId:
              revisionProposalId &&
              pendingProposal &&
              revisionProposalId === pendingProposal.id
                ? pendingProposal.fileId
                : undefined,
          })
        }
        onCancel={() => abortController.current?.abort()}
        isLoading={!!activeRun || historyBusy}
      />
    </div>
  );
}
