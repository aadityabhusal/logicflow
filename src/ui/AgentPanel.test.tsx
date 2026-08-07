import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => {
  const agentState = {
    apiKeys: { openai: "key" },
    selectedModel: "model-a",
    addMessage: vi.fn(),
    getApiKey: vi.fn(() => "key"),
    setApiKey: vi.fn(),
    agentProjects: {
      "project-a": {
        projectId: "project-a",
        activeThreadId: "thread-a",
        threads: [
          {
            id: "thread-a",
            title: "First chat",
            createdAt: 1,
            updatedAt: 1,
            draft: "",
            messages: [],
          },
        ],
      },
    },
    agentReady: true,
    createThread: vi.fn(),
    renameThread: vi.fn(),
    selectThread: vi.fn(),
    removeThread: vi.fn(),
    startRun: vi.fn(),
    setStreamingContent: vi.fn(),
    finishRun: vi.fn(),
    setPendingProposal: vi.fn(),
    setDraft: vi.fn(),
    pendingProposals: {} as Record<
      string,
      {
        id: string;
        projectId: string;
        threadId: string;
        fileId: string;
        sourcePrompt: string;
        draft: { name: string; parameters: []; statements: [] };
        proposedState?: unknown;
        repairAttempt?: number;
      }
    >,
    activeRun: undefined,
  };
  const projectState = {
    currentProjectId: "project-a",
    projects: {} as Record<
      string,
      { id: string; files: { id: string; type: string }[] }
    >,
    getCurrentFile: vi.fn(() => ({ id: "operation-a", type: "operation" })),
    getCurrentProject: vi.fn(() => ({
      id: "project-a",
      files: [{ id: "operation-a", type: "operation" }],
    })),
    updateFile: vi.fn(),
  };
  const useProjectStore = Object.assign(
    vi.fn((selector: (state: typeof projectState) => unknown) =>
      selector(projectState)
    ),
    { getState: () => projectState }
  );
  const persistenceState = { error: undefined as string | undefined };
  const useAgentPersistenceErrorStore = Object.assign(
    vi.fn((selector: (state: typeof persistenceState) => unknown) =>
      selector(persistenceState)
    ),
    { setState: vi.fn() }
  );
  return {
    agentState,
    projectState,
    persistenceState,
    useAgentPersistenceErrorStore,
    useProjectStore,
    createOperationFromFile: vi.fn((file?: { id: string }) =>
      file ? { id: file.id } : undefined
    ),
    generateOperationProposal: vi.fn(),
    generateExecutionFeedbackResponse: vi.fn(),
    applyAgentProposal:
      vi.fn<() => Promise<{ id: string; afterSelectedFileId?: string }>>(),
    waitForApplication:
      vi.fn<
        () => Promise<
          import("@/lib/execution/controller").AgentExecutionOutcome
        >
      >(),
    undoAgentEdit: vi.fn(async () => undefined),
    redoAgentEdit: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/store", () => ({
  fileHistoryActions: { pushState: vi.fn() },
  useAgentStore: Object.assign(() => mocks.agentState, {
    getState: () => mocks.agentState,
  }),
  useAgentPersistenceErrorStore: mocks.useAgentPersistenceErrorStore,
  useProjectStore: mocks.useProjectStore,
}));
vi.mock("@/lib/data", () => ({
  AVAILABLE_MODELS: [{ id: "model-a", name: "Model A", provider: "openai" }],
  LLM_PROVIDERS: {},
}));
vi.mock("@/lib/agent/agent-service", () => ({
  generateOperationProposal: mocks.generateOperationProposal,
  generateExecutionFeedbackResponse: mocks.generateExecutionFeedbackResponse,
}));
vi.mock("@/lib/agent/history", () => ({
  applyAgentProposal: mocks.applyAgentProposal,
  undoAgentEdit: mocks.undoAgentEdit,
  redoAgentEdit: mocks.redoAgentEdit,
  canUndoAgentEdit: vi.fn(() => false),
  canRedoAgentEdit: vi.fn(() => false),
}));
vi.mock("@/lib/execution/controller", () => ({
  executionController: {
    waitForApplication: mocks.waitForApplication,
  },
}));
vi.mock("@/lib/utils", () => ({
  createOperationFromFile: mocks.createOperationFromFile,
}));
vi.mock("./agent/AgentChat", () => ({
  AgentChat: ({
    onApplyProposal,
    onReviseProposal,
    onRegenerateProposal,
  }: {
    onApplyProposal: () => void;
    onReviseProposal: () => void;
    onRegenerateProposal: () => void;
  }) => (
    <>
      <button onClick={onApplyProposal}>Apply proposal</button>
      <button onClick={onReviseProposal}>Revise proposal</button>
      <button onClick={onRegenerateProposal}>Regenerate proposal</button>
    </>
  ),
}));
vi.mock("./agent/AgentInput", () => ({
  AgentInput: ({ onSubmit }: { onSubmit: (prompt: string) => void }) => (
    <button onClick={() => onSubmit("Update it")}>Submit prompt</button>
  ),
}));

import { AgentPanel } from "./AgentPanel";

beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
});

afterAll(() => vi.unstubAllGlobals());

function renderPanel() {
  return render(
    <MantineProvider>
      <AgentPanel />
    </MantineProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.agentState.agentProjects["project-a"].activeThreadId = "thread-a";
  mocks.agentState.pendingProposals = {};
  mocks.persistenceState.error = undefined;
  mocks.applyAgentProposal.mockResolvedValue({
    id: "application-a",
    afterSelectedFileId: "operation-a",
  });
  mocks.waitForApplication.mockResolvedValue({
    projectId: "project-a",
    applicationId: "application-a",
    status: "not_run",
  });
  mocks.generateExecutionFeedbackResponse.mockResolvedValue({
    explanation: "The operation did not run.",
  });
  mocks.projectState.getCurrentFile.mockReturnValue({
    id: "operation-a",
    type: "operation",
  });
  const project = {
    id: "project-a",
    files: [{ id: "operation-a", type: "operation" }],
  };
  mocks.projectState.projects = { "project-a": project };
  mocks.projectState.getCurrentProject.mockReturnValue(project);
});

describe("AgentPanel thread header", () => {
  it("discloses provider sharing of sanitized execution feedback", () => {
    renderPanel();

    expect(
      screen.getByText(
        "Sanitized execution feedback may be sent to the selected model provider."
      )
    ).toBeDefined();
  });

  it("renames the active chat inline", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Rename chat" }));
    const input = screen.getByDisplayValue("First chat");
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "Renamed chat" } });
    fireEvent.blur(input);

    expect(mocks.agentState.renameThread).toHaveBeenCalledWith(
      "thread-a",
      "Renamed chat"
    );
  });

  it("cancels an inline rename with Escape", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Rename chat" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Chat name" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("textbox", { name: "Chat name" })).toBeNull();
    expect(mocks.agentState.renameThread).not.toHaveBeenCalled();
  });

  it("confirms before deleting the active chat", async () => {
    renderPanel();

    const deleteButton = screen.getByRole("button", { name: "Delete chat" });
    fireEvent.click(deleteButton);
    expect(await screen.findByText("Delete this chat?")).toBeDefined();
    fireEvent.click(screen.getByText("Yes, delete."));

    expect(mocks.agentState.removeThread).toHaveBeenCalledWith("thread-a");
    expect(deleteButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows and dismisses persistence errors", () => {
    mocks.persistenceState.error = "Agent chats could not be saved.";

    renderPanel();
    fireEvent.click(screen.getByText("Dismiss"));

    expect(mocks.useAgentPersistenceErrorStore.setState).toHaveBeenCalledWith({
      error: undefined,
    });
  });
});

describe("AgentPanel proposal lifecycle", () => {
  it("stores generated proposals without mutating the project", async () => {
    mocks.generateOperationProposal.mockResolvedValue({
      response: { explanation: "Review this proposal" },
      proposal: {
        id: "proposal-a",
        projectId: "project-a",
        fileId: "operation-a",
        baseFingerprint: "fingerprint",
        sourcePrompt: "Update it",
        draft: { name: "operation", parameters: [], statements: [] },
        diagnostics: [],
      },
    });
    renderPanel();

    fireEvent.click(screen.getByText("Submit prompt"));

    await waitFor(() =>
      expect(mocks.agentState.setPendingProposal).toHaveBeenCalledWith(
        "thread-a",
        expect.objectContaining({
          id: "proposal-a",
          threadId: "thread-a",
        })
      )
    );
    expect(mocks.projectState.updateFile).not.toHaveBeenCalled();
  });

  it("does not revise or regenerate when the proposal anchor is missing", () => {
    mocks.agentState.pendingProposals = {
      "thread-a": {
        id: "proposal-a",
        projectId: "project-a",
        threadId: "thread-a",
        fileId: "another-operation",
        sourcePrompt: "Secret prior request",
        draft: { name: "other", parameters: [], statements: [] },
      },
    };
    renderPanel();

    fireEvent.click(screen.getByText("Revise proposal"));
    fireEvent.click(screen.getByText("Regenerate proposal"));

    expect(mocks.agentState.setDraft).not.toHaveBeenCalled();
    expect(mocks.generateOperationProposal).not.toHaveBeenCalled();
  });

  it("applies the active proposal while another file is selected", async () => {
    const proposal = {
      id: "proposal-a",
      projectId: "project-a",
      threadId: "thread-a",
      fileId: "operation-a",
      sourcePrompt: "Update it",
      draft: { name: "operation", parameters: [] as [], statements: [] as [] },
    };
    mocks.agentState.pendingProposals = { "thread-a": proposal };
    mocks.projectState.getCurrentFile.mockReturnValue({
      id: "operation-b",
      type: "operation",
    });
    mocks.projectState.getCurrentProject.mockReturnValue({
      id: "project-a",
      files: [
        { id: "operation-a", type: "operation" },
        { id: "operation-b", type: "operation" },
      ],
    });
    renderPanel();

    fireEvent.click(screen.getByText("Apply proposal"));

    await waitFor(() =>
      expect(mocks.applyAgentProposal).toHaveBeenCalledWith(proposal)
    );
    await waitFor(() =>
      expect(mocks.generateExecutionFeedbackResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: expect.objectContaining({ status: "not_run" }),
        })
      )
    );
  });

  it("requests a bounded repair after failed execution feedback", async () => {
    const proposal = {
      id: "proposal-a",
      projectId: "project-a",
      threadId: "thread-a",
      fileId: "operation-a",
      sourcePrompt: "Update it",
      draft: { name: "operation", parameters: [] as [], statements: [] as [] },
    };
    mocks.agentState.pendingProposals = { "thread-a": proposal };
    mocks.waitForApplication.mockResolvedValue({
      projectId: "project-a",
      applicationId: "application-a",
      executionId: "execution-a",
      operationId: "operation-a",
      status: "failed",
      error: "Runtime failed",
    });
    mocks.generateOperationProposal.mockResolvedValue({
      response: { explanation: "Repair ready" },
      proposal: undefined,
    });
    renderPanel();

    fireEvent.click(screen.getByText("Apply proposal"));

    await waitFor(() =>
      expect(mocks.generateOperationProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining("sanitized execution feedback"),
        })
      )
    );
    expect(mocks.applyAgentProposal).toHaveBeenCalledOnce();
  });

  it("stops repair proposals after two attempts", async () => {
    mocks.agentState.pendingProposals = {
      "thread-a": {
        id: "proposal-a",
        projectId: "project-a",
        threadId: "thread-a",
        fileId: "operation-a",
        sourcePrompt: "Repair it",
        repairAttempt: 2,
        draft: { name: "operation", parameters: [], statements: [] },
      },
    };
    mocks.waitForApplication.mockResolvedValue({
      projectId: "project-a",
      applicationId: "application-a",
      executionId: "execution-a",
      operationId: "operation-a",
      status: "failed",
      error: "Still failing",
    });
    renderPanel();

    fireEvent.click(screen.getByText("Apply proposal"));

    await waitFor(() =>
      expect(mocks.generateExecutionFeedbackResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: expect.objectContaining({ status: "failed" }),
        })
      )
    );
    expect(mocks.generateOperationProposal).not.toHaveBeenCalled();
    expect(mocks.applyAgentProposal).toHaveBeenCalledOnce();
  });

  it("revises against the proposal anchor after navigation", async () => {
    const pendingProposal = {
      id: "proposal-a",
      projectId: "project-a",
      threadId: "thread-a",
      fileId: "operation-a",
      sourcePrompt: "Original request",
      repairAttempt: 1,
      draft: { name: "anchor", parameters: [] as [], statements: [] as [] },
      proposedState: {
        operationFiles: [{ index: 1, file: { id: "created-operation" } }],
        npmDependencies: [{ name: "wretch" }],
      },
    };
    mocks.agentState.pendingProposals = {
      "thread-a": {
        ...pendingProposal,
      },
    };
    mocks.projectState.getCurrentFile.mockReturnValue({
      id: "operation-b",
      type: "operation",
    });
    mocks.projectState.getCurrentProject.mockReturnValue({
      id: "project-a",
      files: [
        { id: "operation-a", type: "operation" },
        { id: "operation-b", type: "operation" },
      ],
    });
    mocks.generateOperationProposal.mockResolvedValue({
      response: { explanation: "Revised" },
      proposal: {
        id: "proposal-b",
        projectId: "project-a",
        fileId: "operation-a",
        sourcePrompt: "unused",
        draft: { name: "anchor", parameters: [], statements: [] },
        diagnostics: [],
      },
    });
    renderPanel();

    fireEvent.click(screen.getByText("Revise proposal"));
    fireEvent.click(screen.getByText("Submit prompt"));

    await waitFor(() =>
      expect(mocks.generateOperationProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: { id: "operation-a" },
          userPrompt: expect.stringContaining("Original request"),
          initialProposal: pendingProposal,
        })
      )
    );
    expect(mocks.agentState.setPendingProposal).toHaveBeenCalledWith(
      "thread-a",
      expect.objectContaining({
        sourcePrompt: "Original request",
        repairAttempt: 1,
      })
    );
  });

  it("regenerates against the proposal anchor after navigation", async () => {
    mocks.agentState.pendingProposals = {
      "thread-a": {
        id: "proposal-a",
        projectId: "project-a",
        threadId: "thread-a",
        fileId: "operation-a",
        sourcePrompt: "Original request",
        draft: { name: "anchor", parameters: [], statements: [] },
      },
    };
    mocks.projectState.getCurrentFile.mockReturnValue({
      id: "operation-b",
      type: "operation",
    });
    mocks.projectState.getCurrentProject.mockReturnValue({
      id: "project-a",
      files: [
        { id: "operation-a", type: "operation" },
        { id: "operation-b", type: "operation" },
      ],
    });
    mocks.generateOperationProposal.mockResolvedValue({
      response: { explanation: "Regenerated" },
    });
    renderPanel();

    fireEvent.click(screen.getByText("Regenerate proposal"));

    await waitFor(() =>
      expect(mocks.generateOperationProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: { id: "operation-a" },
          userPrompt: "Original request",
        })
      )
    );
  });
});
