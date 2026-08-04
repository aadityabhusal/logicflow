import { Button, Menu, PasswordInput, Popover } from "@mantine/core";
import { FaListUl, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { AgentChat } from "./agent/AgentChat";
import { AgentInput } from "./agent/AgentInput";
import {
  generateOperationChanges,
  applyChangesToOperation,
} from "@/lib/agent/agent-service";
import {
  useProjectStore,
  fileHistoryActions,
  useAgentStore,
  useAgentPersistenceErrorStore,
} from "@/lib/store";
import { AVAILABLE_MODELS, LLM_PROVIDERS } from "@/lib/data";
import { IconButton } from "./IconButton";
import { createFileFromOperation, createOperationFromFile } from "@/lib/utils";
import { MdVpnKey } from "react-icons/md";
import { type FocusEvent, useEffect, useRef, useState } from "react";
import { AgentTransportError } from "@/lib/agent/transport";

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
  } = useAgentStore();

  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const updateFile = useProjectStore((s) => s.updateFile);
  const abortController = useRef<AbortController>();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [editingThreadId, setEditingThreadId] = useState<string>();
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const persistenceError = useAgentPersistenceErrorStore((s) => s.error);
  const agentProject = currentProjectId
    ? agentProjects[currentProjectId]
    : undefined;
  const projectThreads = agentProject?.threads ?? [];
  const activeThread = projectThreads.find(
    (thread) => thread.id === agentProject?.activeThreadId
  );
  const activeThreadId = activeThread?.id;

  useEffect(() => {
    abortController.current?.abort();
  }, [currentProjectId]);

  useEffect(() => {
    if (agentReady && currentProjectId && !agentProject) {
      createThread(currentProjectId);
    }
  }, [agentProject, agentReady, createThread, currentProjectId]);

  useEffect(() => () => abortController.current?.abort(), []);

  useEffect(() => {
    if (editingThreadId) renameInputRef.current?.focus();
  }, [editingThreadId]);

  useEffect(() => {
    setEditingThreadId(undefined);
    setDeleteConfirmationOpen(false);
  }, [activeThreadId]);

  const handleSubmit = async (prompt: string) => {
    const currentOperation = createOperationFromFile(currentFile);
    if (
      !currentOperation ||
      !currentFile ||
      !currentProjectId ||
      !activeThreadId
    )
      return;
    const submittedProjectId = currentProjectId;
    const submittedFile = currentFile;
    const submittedProject = useProjectStore.getState().getCurrentProject();
    if (!submittedProject) return;

    const modelConfig = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
    if (!modelConfig) return;
    const apiKey = getApiKey(modelConfig.provider);
    if (!apiKey) return;

    addMessage(activeThreadId, { role: "user", content: prompt });
    const controller = new AbortController();
    abortController.current = controller;
    startRun(activeThreadId);

    try {
      const { response, mappingContext } = await generateOperationChanges({
        operation: currentOperation,
        project: submittedProject,
        userPrompt: prompt,
        model: `${modelConfig.provider}/${modelConfig.id}`,
        apiKey,
        abortSignal: controller.signal,
        onPartialExplanation: setStreamingContent,
      });

      if (controller.signal.aborted) return;
      const projectState = useProjectStore.getState();
      const liveFile = projectState.projects[submittedProjectId]?.files.find(
        (file) => file.id === submittedFile.id
      );
      if (
        projectState.currentProjectId !== submittedProjectId ||
        liveFile !== submittedFile
      ) {
        addMessage(activeThreadId, {
          role: "assistant",
          content:
            "Changes were not applied because the project or operation changed while the request was running.",
        });
        return;
      }

      addMessage(activeThreadId, {
        role: "assistant",
        content: response.explanation || "Changes applied successfully.",
        changes: response.changes,
      });

      if (response.changes.length > 0) {
        const lastContent = createFileFromOperation(currentOperation).content;
        fileHistoryActions.pushState(currentOperation.id, lastContent);
        const updatedOperation = applyChangesToOperation(
          currentOperation,
          response.changes,
          mappingContext
        );
        updateFile(
          currentOperation.id,
          createFileFromOperation(updatedOperation)
        );
      }
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
      <AgentChat />
      <AgentInput
        onSubmit={handleSubmit}
        onCancel={() => abortController.current?.abort()}
        isLoading={!!activeRun}
      />
    </div>
  );
}
