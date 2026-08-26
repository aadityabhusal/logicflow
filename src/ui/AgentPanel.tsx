import { Button, Menu, PasswordInput, Popover } from "@mantine/core";
import { FaListUl, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { AgentChat } from "./agent/AgentChat";
import { AgentInput } from "./agent/AgentInput";
import {
  generateOperationProposal,
  getExplicitDeploymentIntent,
} from "@/lib/agent/agent-service";
import {
  useProjectStore,
  useAgentRunStore,
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
import type { AgentRetry } from "@/lib/agent/types";
import type { AgentProposal } from "@/lib/agent/proposal";
import {
  applyAgentProposal,
  redoAgentApplication,
  undoAgentApplication,
} from "@/lib/agent/history";

export function AgentPanel() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const {
    selectedModel,
    thinkingLevel,
    addMessage,
    replaceMessage,
    getApiKey,
    setApiKey,
    agentReady,
    createThread,
    renameThread,
    selectThread,
    removeThread,
    deleteThreadTurn,
    setPendingProposal,
    setDraft,
  } = useAgentStore((state) => ({
    selectedModel: state.selectedModel,
    thinkingLevel: state.thinkingLevel,
    addMessage: state.addMessage,
    replaceMessage: state.replaceMessage,
    getApiKey: state.getApiKey,
    setApiKey: state.setApiKey,
    agentReady: state.agentReady,
    createThread: state.createThread,
    renameThread: state.renameThread,
    selectThread: state.selectThread,
    removeThread: state.removeThread,
    deleteThreadTurn: state.deleteThreadTurn,
    setPendingProposal: state.setPendingProposal,
    setDraft: state.setDraft,
  }));
  const { startRun, setRunTrace, setStreamingContent, finishRun } =
    useAgentRunStore((state) => ({
      startRun: state.startRun,
      setRunTrace: state.setRunTrace,
      setStreamingContent: state.setStreamingContent,
      finishRun: state.finishRun,
    }));
  const isRunning = useAgentRunStore((state) => !!state.activeRun);
  const abortController = useRef<AbortController>();
  const deploymentAfterApply = useRef(new Set<string>());
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const restoreRenameFocus = useRef(false);
  const [editingThreadId, setEditingThreadId] = useState<string>();
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [revisionProposalId, setRevisionProposalId] = useState<string>();
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const [submissionError, setSubmissionError] = useState<string>();
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const persistenceError = useAgentPersistenceErrorStore((s) => s.error);
  const agentProject = useAgentStore((state) =>
    currentProjectId ? state.agentProjects[currentProjectId] : undefined,
  );
  const projectThreads = agentProject?.threads ?? [];
  const activeThread = projectThreads.find(
    (thread) => thread.id === agentProject?.activeThreadId,
  );
  const activeThreadId = activeThread?.id;
  const pendingProposal = useAgentStore((state) =>
    activeThreadId ? state.pendingProposals[activeThreadId] : undefined,
  );

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
    [],
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
    setSubmissionError(undefined);
  }, [activeThreadId, currentProjectId]);

  const handleDeploymentAfterApply = (proposal: AgentProposal) => {
    if (proposal.threadId && deploymentAfterApply.current.has(proposal.id)) {
      deploymentAfterApply.current.delete(proposal.id);
      addMessage(proposal.threadId, {
        role: "assistant",
        content: "The update was applied successfully.",
        deploymentAction: "open-deployment-panel",
      });
    }
  };

  const handleSubmit = async (
    prompt: string,
    options?: {
      regenerate?: boolean;
      sourceFileId?: string;
      replaceResponseId?: string;
    },
  ) => {
    if (useAgentRunStore.getState().activeRun) return;
    const submittedProject = useProjectStore.getState().getCurrentProject();
    const deploymentIntent = !options?.regenerate
      ? getExplicitDeploymentIntent(prompt)
      : undefined;
    if (!submittedProject || !currentProjectId || !activeThreadId) {
      setSubmissionError("The agent chat is still loading. Please try again.");
      return;
    }
    if (deploymentIntent && !deploymentIntent.afterChanges) {
      if (!options?.regenerate && !options?.replaceResponseId) {
        addMessage(activeThreadId, { role: "user", content: prompt });
        setDraft(activeThreadId, "");
      }
      setSubmissionError(undefined);
      const response = {
        role: "assistant",
        content:
          "Open the Deployment panel to configure and deploy this project.",
        deploymentAction: "open-deployment-panel",
      } as const;
      if (options?.replaceResponseId) {
        replaceMessage(activeThreadId, options.replaceResponseId, response);
      } else {
        addMessage(activeThreadId, response);
      }
      return;
    }
    const sourceFileId = options?.sourceFileId ?? currentFile?.id;
    const sourceFile = submittedProject.files.find(
      (file) => file.id === sourceFileId && file.type === "operation",
    );
    const currentOperation = createOperationFromFile(sourceFile);
    if (!sourceFile) {
      setSubmissionError("Select an operation before sending a request.");
      return;
    }
    if (!currentOperation) {
      setSubmissionError(
        "The selected operation could not be loaded. Select another operation and try again.",
      );
      return;
    }

    const modelConfig = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
    if (!modelConfig) {
      setSubmissionError("Select an agent model before sending a request.");
      return;
    }
    const apiKey = getApiKey(modelConfig.provider);
    if (!apiKey) {
      setSubmissionError(
        `Add an API key for ${LLM_PROVIDERS[modelConfig.provider].name} before sending a request.`,
      );
      return;
    }

    setSubmissionError(undefined);
    if (!options?.regenerate && !options?.replaceResponseId) {
      addMessage(activeThreadId, { role: "user", content: prompt });
      setDraft(activeThreadId, "");
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
      ? `Original request:\n${revisedProposal.sourcePrompt}\n\nCurrent proposal update:\n${JSON.stringify(revisedProposal.update)}\n\nRequested revision:\n${prompt}`
      : prompt;
    let conversationMessages = activeThread?.messages ?? [];
    if (options?.replaceResponseId) {
      const responseIndex = conversationMessages.findIndex(
        ({ id }) => id === options.replaceResponseId,
      );
      if (responseIndex >= 0) {
        const requestIndex = conversationMessages
          .slice(0, responseIndex)
          .map(({ role }) => role)
          .lastIndexOf("user");
        conversationMessages = conversationMessages.slice(
          0,
          requestIndex >= 0 ? requestIndex : responseIndex,
        );
      }
    }
    const conversation = conversationMessages.map(({ role, content }) => ({
      role,
      content,
    }));
    const storeResponse = (message: Parameters<typeof addMessage>[1]) =>
      options?.replaceResponseId
        ? replaceMessage(activeThreadId, options.replaceResponseId, message)
        : addMessage(activeThreadId, message);
    const controller = new AbortController();
    abortController.current = controller;
    startRun(activeThreadId, options?.replaceResponseId);

    try {
      const { response, proposal } = await generateOperationProposal({
        operation: currentOperation,
        project: submittedProject,
        userPrompt: requestPrompt,
        model: `${modelConfig.provider}/${modelConfig.id}`,
        apiKey,
        thinkingLevel,
        ...(conversation.length ? { conversation } : {}),
        initialProposal: revisedProposal,
        abortSignal: controller.signal,
        onProgress: setRunTrace,
        onPartialExplanation: setStreamingContent,
      });

      if (controller.signal.aborted) return;
      const storedProposal = proposal
        ? {
            ...proposal,
            threadId: activeThreadId,
            sourcePrompt: options?.regenerate
              ? prompt
              : revisedProposal
                ? revisedProposal.sourcePrompt
                : prompt,
          }
        : undefined;
      storeResponse({
        role: "assistant",
        content:
          response.explanation ||
          (proposal ? "Update ready." : "No changes proposed."),
        proposal: storedProposal
          ? {
              id: storedProposal.id,
              review: storedProposal.review,
              diagnostics: storedProposal.diagnostics,
            }
          : undefined,
      });
      if (storedProposal) {
        if (
          deploymentIntent?.afterChanges ||
          (revisedProposal &&
            deploymentAfterApply.current.has(revisedProposal.id)) ||
          (options?.regenerate &&
            pendingProposal &&
            deploymentAfterApply.current.has(pendingProposal.id))
        ) {
          deploymentAfterApply.current.add(storedProposal.id);
        }
        setPendingProposal(activeThreadId, storedProposal);
        if (
          !storedProposal.diagnostics.some(
            (diagnostic) => diagnostic.severity === "error",
          )
        ) {
          try {
            await applyAgentProposal(storedProposal, controller.signal);
            handleDeploymentAfterApply(storedProposal);
          } catch (error) {
            if (controller.signal.aborted) return;
            addMessage(activeThreadId, {
              role: "assistant",
              content: `The update was generated but could not be applied automatically: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              error: {},
            });
          }
        }
      } else if (options?.regenerate) {
        if (pendingProposal) {
          deploymentAfterApply.current.delete(pendingProposal.id);
        }
        setPendingProposal(activeThreadId, undefined);
      }
      setRevisionProposalId(undefined);
    } catch (error) {
      const transportError =
        error instanceof AgentTransportError ? error : undefined;
      const retry: AgentRetry = {
        prompt,
        sourceFileId: sourceFile.id,
      };
      if (options?.regenerate) retry.regenerate = true;
      const errorMessage =
        transportError?.code === "cancelled"
          ? "Request cancelled."
          : `Error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;
      storeResponse({
        role: "assistant",
        content: errorMessage,
        error: {
          retry,
          requiresApiKey: transportError?.code === "unauthorized",
        },
      });
    } finally {
      if (abortController.current === controller) {
        abortController.current = undefined;
      }
      finishRun(activeThreadId);
    }
  };

  const handleRejectProposal = () => {
    if (activeThreadId) {
      if (pendingProposal) {
        deploymentAfterApply.current.delete(pendingProposal.id);
      }
      setPendingProposal(activeThreadId, undefined);
    }
    setRevisionProposalId(undefined);
    document.getElementById("agent-prompt-input")?.focus();
  };

  const handleHistoryAction = async (action: () => Promise<unknown>) => {
    if (historyBusy || isRunning) return;
    setHistoryBusy(true);
    setHistoryError(undefined);
    try {
      await action();
    } catch (error) {
      if (
        error instanceof Error &&
        /^Cannot (undo|redo) because the project changed after this agent edit$/.test(
          error.message,
        )
      )
        return;
      setHistoryError(
        error instanceof Error ? error.message : "Agent edit failed",
      );
    } finally {
      setHistoryBusy(false);
    }
  };

  const handleApplyProposal = () => {
    if (!pendingProposal) return;
    const proposal = pendingProposal;
    void handleHistoryAction(async () => {
      await applyAgentProposal(proposal);
      handleDeploymentAfterApply(proposal);
    });
  };

  const handleRestoreApplication = (
    applicationId: string,
    direction: "undo" | "redo",
  ) => {
    if (!currentProjectId) return;
    void handleHistoryAction(() =>
      direction === "undo"
        ? undoAgentApplication(currentProjectId, applicationId)
        : redoAgentApplication(currentProjectId, applicationId),
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
          file.id === pendingProposal.fileId && file.type === "operation",
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
      useAgentRunStore.getState().activeRun
    )
      return;
    const response = activeThread?.messages.find(
      (message) => message.proposal?.id === pendingProposal.id,
    );
    if (!response) return;
    void handleSubmit(pendingProposal.sourcePrompt, {
      regenerate: true,
      sourceFileId: pendingProposal.fileId,
      replaceResponseId: response.id,
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
              disabled={isRunning || historyBusy || !currentProjectId}
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
              disabled={!activeThread || isRunning || historyBusy}
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
                disabled={!activeThread || isRunning || historyBusy}
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
            disabled={
              isRunning || historyBusy || !currentProjectId || !agentProject
            }
          />
          <Popover
            position="top-start"
            trapFocus
            returnFocus
            opened={apiKeysOpen}
            onChange={setApiKeysOpen}
          >
            <Popover.Target>
              <IconButton
                icon={MdVpnKey}
                title="Add API keys"
                onClick={() => setApiKeysOpen((opened) => !opened)}
              />
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
                        e.target.value,
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
      {submissionError ? (
        <div
          role="alert"
          className="flex items-center gap-2 border-b p-2 text-xs"
        >
          <span className="min-w-0 flex-1">{submissionError}</span>
          {submissionError.startsWith("Add an API key") ? (
            <Button
              size="compact-xs"
              className="min-h-9 shrink-0"
              onClick={() => setApiKeysOpen(true)}
            >
              Add API key
            </Button>
          ) : null}
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
        onDeleteTurn={(messageId) => {
          if (activeThreadId) deleteThreadTurn(activeThreadId, messageId);
        }}
        onOpenDeploymentPanel={() => {
          useSidebarTabStore.getState().setActiveTab("deployment");
          requestAnimationFrame(() =>
            document.getElementById("sidebar-tab-deployment")?.focus(),
          );
        }}
        onOpenApiKeys={() => setApiKeysOpen(true)}
        onRetry={(messageId: string, retry: AgentRetry) =>
          void handleSubmit(retry.prompt, {
            regenerate: retry.regenerate,
            sourceFileId: retry.sourceFileId,
            replaceResponseId: messageId,
          })
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
        isLoading={isRunning}
        historyBusy={historyBusy}
      />
    </div>
  );
}
