import { Button, Menu, PasswordInput, Popover } from "@mantine/core";
import { FaListUl, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
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
  redoAgentApplication,
  undoAgentApplication,
} from "@/lib/agent/history";
import { executionController } from "@/lib/execution/controller";
import {
  createAgentExecutionFeedback,
  getAgentExecutionSecrets,
} from "@/lib/agent/execution-feedback";

export function AgentPanel() {
  const {
    selectedModel,
    thinkingLevel,
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
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const restoreRenameFocus = useRef(false);
  const [editingThreadId, setEditingThreadId] = useState<string>();
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [revisionProposalId, setRevisionProposalId] = useState<string>();
  const [historyBusy, setHistoryBusy] = useState(false);
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
    else if (restoreRenameFocus.current) {
      renameButtonRef.current?.focus();
      restoreRenameFocus.current = false;
    }
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
        thinkingLevel,
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
    document.getElementById("agent-prompt-input")?.focus();
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
        thinkingLevel,
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
    });
  };

  const handleRestoreApplication = (
    applicationId: string,
    direction: "undo" | "redo"
  ) => {
    if (!currentProjectId) return;
    void handleHistoryAction(() =>
      direction === "undo"
        ? undoAgentApplication(currentProjectId, applicationId)
        : redoAgentApplication(currentProjectId, applicationId)
    );
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
    document.getElementById("agent-prompt-input")?.focus();
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
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-editor">
      <div className="flex min-w-0 flex-wrap items-center p-1 border-b gap-1 bg-dropdown-default">
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
                role="menuitemradio"
                aria-checked={thread.id === activeThreadId}
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
        <div className="flex min-w-0 flex-1 items-center gap-1">
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
                  restoreRenameFocus.current = true;
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
              ref={renameButtonRef}
              icon={FaPen}
              onClick={() =>
                activeThread && setEditingThreadId(activeThread.id)
              }
              title="Rename chat"
              aria-label="Rename chat"
              className="px-0.5 hover:outline hover:outline-border"
              disabled={!activeThread || !!activeRun}
            />
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1">
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
                aria-label="Delete chat"
                className="p-0.5 hover:outline hover:outline-border"
                disabled={!activeThread || !!activeRun}
                onClick={() => setDeleteConfirmationOpen((opened) => !opened)}
              />
            </Popover.Target>
            <Popover.Dropdown
              aria-labelledby="delete-chat-title"
              classNames={{ dropdown: "border" }}
            >
              <div className="flex flex-col gap-2 p-1">
                <span id="delete-chat-title" className="text-sm">
                  Delete this chat?
                </span>
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
          <Popover position="top-start" trapFocus returnFocus>
            <Popover.Target>
              <IconButton icon={MdVpnKey} title="Add API keys" />
            </Popover.Target>
            <Popover.Dropdown
              aria-labelledby="agent-api-keys-title"
              classNames={{ dropdown: "border" }}
            >
              <div className="flex flex-col gap-1">
                <span id="agent-api-keys-title" className="sr-only">
                  API keys
                </span>
                {Object.entries(LLM_PROVIDERS).map(([id, { name, Icon }]) => (
                  <PasswordInput
                    key={id}
                    leftSection={<Icon />}
                    label={`${name} API key`}
                    placeholder={`Enter ${name} key`}
                    classNames={{
                      label: "sr-only",
                      wrapper: "p-1",
                      innerInput: "focus:outline outline-white p-0.5",
                    }}
                    value={getApiKey(id as keyof typeof LLM_PROVIDERS) ?? ""}
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
        <div role="alert" className="border-b p-2 text-xs">
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
      <AgentChat
        onApplyProposal={handleApplyProposal}
        onRejectProposal={handleRejectProposal}
        onReviseProposal={handleReviseProposal}
        onRegenerateProposal={handleRegenerateProposal}
        onUndoApplication={(applicationId) =>
          handleRestoreApplication(applicationId, "undo")
        }
        onRedoApplication={(applicationId) =>
          handleRestoreApplication(applicationId, "redo")
        }
        onOpenDeploymentPanel={() => {
          useSidebarTabStore.getState().setActiveTab("deployment");
          requestAnimationFrame(() =>
            document.getElementById("sidebar-tab-deployment")?.focus()
          );
        }}
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
