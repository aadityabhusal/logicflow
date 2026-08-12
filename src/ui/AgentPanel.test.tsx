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
    thinkingLevel: "medium",
    addMessage: vi.fn(),
    getApiKey: vi.fn((): string | undefined => "key"),
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
    deleteThreadTurn: vi.fn(),
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
        update: { explanation: string; enablePackages: []; changes: [] };
        proposedState?: unknown;
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
    updateProject: vi.fn(),
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
    getExplicitDeploymentIntent: vi.fn(),
    submitPrompt: "Update it",
    setActiveTab: vi.fn(),
    applyAgentProposal:
      vi.fn<() => Promise<{ id: string; afterSelectedFileId?: string }>>(),
    undoAgentApplication: vi.fn(async () => undefined),
    redoAgentApplication: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/store", () => ({
  fileHistoryActions: { pushState: vi.fn() },
  useAgentStore: Object.assign(() => mocks.agentState, {
    getState: () => mocks.agentState,
  }),
  useAgentPersistenceErrorStore: mocks.useAgentPersistenceErrorStore,
  useProjectStore: mocks.useProjectStore,
  useSidebarTabStore: {
    getState: () => ({ setActiveTab: mocks.setActiveTab }),
  },
}));
vi.mock("@/lib/data", () => ({
  AVAILABLE_MODELS: [{ id: "model-a", name: "Model A", provider: "openai" }],
  LLM_PROVIDERS: {
    openai: { name: "OpenAI", Icon: () => null },
    anthropic: { name: "Anthropic", Icon: () => null },
  },
}));
vi.mock("@/lib/agent/agent-service", () => ({
  generateOperationProposal: mocks.generateOperationProposal,
  getExplicitDeploymentIntent: mocks.getExplicitDeploymentIntent,
}));
vi.mock("@/lib/agent/history", () => ({
  applyAgentProposal: mocks.applyAgentProposal,
  undoAgentApplication: mocks.undoAgentApplication,
  redoAgentApplication: mocks.redoAgentApplication,
}));
vi.mock("@/lib/utils", () => ({
  createOperationFromFile: mocks.createOperationFromFile,
}));
vi.mock("./agent/AgentChat", () => ({
  AgentChat: ({
    onApplyProposal,
    onReviseProposal,
    onRegenerateProposal,
    onUndoApplication,
    onRedoApplication,
    onDeleteTurn,
    onOpenDeploymentPanel,
  }: {
    onApplyProposal: () => void;
    onReviseProposal: () => void;
    onRegenerateProposal: () => void;
    onUndoApplication: (applicationId: string) => void;
    onRedoApplication: (applicationId: string) => void;
    onDeleteTurn: (messageId: string) => void;
    onOpenDeploymentPanel: () => void;
  }) => (
    <>
      <button onClick={onApplyProposal}>Apply proposal</button>
      <button onClick={onReviseProposal}>Revise proposal</button>
      <button onClick={onRegenerateProposal}>Regenerate proposal</button>
      <button onClick={() => onUndoApplication("application-a")}>
        Undo turn
      </button>
      <button onClick={() => onRedoApplication("application-a")}>
        Redo turn
      </button>
      <button onClick={() => onDeleteTurn("message-a")}>Delete turn</button>
      <button onClick={onOpenDeploymentPanel}>Open Deployment panel</button>
    </>
  ),
}));
vi.mock("./agent/AgentInput", () => ({
  AgentInput: ({ onSubmit }: { onSubmit: (prompt: string) => void }) => (
    <button onClick={() => onSubmit(mocks.submitPrompt)}>Submit prompt</button>
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
  mocks.agentState.getApiKey.mockReturnValue("key");
  mocks.agentState.pendingProposals = {};
  mocks.persistenceState.error = undefined;
  mocks.applyAgentProposal.mockResolvedValue({
    id: "application-a",
    afterSelectedFileId: "operation-a",
  });
  mocks.getExplicitDeploymentIntent.mockReturnValue(undefined);
  mocks.submitPrompt = "Update it";
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
  it("keeps history out of the header and API key guidance concise", () => {
    renderPanel();

    expect(screen.queryByText(/may be sent to/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Undo agent edit" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Add API keys" })).toBeDefined();
  });

  it("handles history actions from chat turns", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Undo turn" }));
    await waitFor(() =>
      expect(mocks.undoAgentApplication).toHaveBeenCalledWith(
        "project-a",
        "application-a"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Redo turn" }));
    await waitFor(() =>
      expect(mocks.redoAgentApplication).toHaveBeenCalledWith(
        "project-a",
        "application-a"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete turn" }));
    expect(mocks.agentState.deleteThreadTurn).toHaveBeenCalledWith(
      "thread-a",
      "message-a"
    );
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
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Rename chat" })
    );
  });

  it("confirms before deleting the active chat", async () => {
    renderPanel();

    const deleteButton = screen.getByRole("button", { name: "Delete chat" });
    fireEvent.click(deleteButton);
    expect(await screen.findByText("Delete this chat?")).toBeDefined();
    expect(
      screen
        .getByRole("dialog", { hidden: true })
        .getAttribute("aria-labelledby")
    ).toBe("delete-chat-title");
    fireEvent.click(screen.getByText("Yes, delete."));

    expect(mocks.agentState.removeThread).toHaveBeenCalledWith("thread-a");
    expect(deleteButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("labels the API key dialog and provider inputs", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Add API keys" }));

    expect(screen.queryByLabelText("Gemini API key")).toBeNull();
    expect(await screen.findByLabelText("OpenAI API key")).toBeDefined();
    expect(screen.getByLabelText("Anthropic API key")).toBeDefined();
  });

  it("keeps empty API key inputs controlled", async () => {
    mocks.agentState.getApiKey.mockReturnValue(undefined);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Add API keys" }));

    expect(
      (await screen.findByLabelText("OpenAI API key")).getAttribute("value")
    ).toBe("");
  });

  it("shows and dismisses persistence errors", () => {
    mocks.persistenceState.error = "Agent chats could not be saved.";

    renderPanel();
    expect(screen.getByRole("alert").textContent).toContain(
      "Agent chats could not be saved."
    );
    fireEvent.click(screen.getByText("Dismiss"));

    expect(mocks.useAgentPersistenceErrorStore.setState).toHaveBeenCalledWith({
      error: undefined,
    });
  });
});

describe("AgentPanel proposal lifecycle", () => {
  it("opens the Deployment panel for deployment-only requests", async () => {
    mocks.submitPrompt = "Deploy this to Vercel";
    mocks.getExplicitDeploymentIntent.mockReturnValue({ afterChanges: false });
    renderPanel();

    fireEvent.click(screen.getByText("Submit prompt"));

    expect(mocks.generateOperationProposal).not.toHaveBeenCalled();
    expect(mocks.agentState.addMessage).toHaveBeenCalledWith(
      "thread-a",
      expect.objectContaining({
        deploymentAction: "open-deployment-panel",
      })
    );
    expect(mocks.setActiveTab).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Open Deployment panel"));
    expect(mocks.setActiveTab).toHaveBeenCalledWith("deployment");
  });

  it("defers the Deployment panel action for combined edit-and-deploy requests", async () => {
    mocks.submitPrompt = "Fix the handler and deploy to Supabase";
    mocks.getExplicitDeploymentIntent.mockReturnValue({ afterChanges: true });
    mocks.generateOperationProposal.mockResolvedValue({
      response: { explanation: "Proposal ready" },
      proposal: {
        id: "proposal-a",
        projectId: "project-a",
        fileId: "operation-a",
        baseFingerprint: "fingerprint",
        sourcePrompt: "Fix it and deploy",
        update: { explanation: "Fix it", enablePackages: [], changes: [] },
        diagnostics: [],
      },
    });
    renderPanel();

    fireEvent.click(screen.getByText("Submit prompt"));

    await waitFor(() =>
      expect(mocks.generateOperationProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: "Fix the handler and deploy to Supabase",
        })
      )
    );
    expect(mocks.agentState.setPendingProposal).toHaveBeenCalledWith(
      "thread-a",
      expect.not.objectContaining({ manualDeploymentAfterApply: true })
    );
  });

  it("does not offer deployment when a combined request produces no proposal", async () => {
    mocks.submitPrompt = "Fix the handler and deploy to Supabase";
    mocks.getExplicitDeploymentIntent.mockReturnValue({ afterChanges: true });
    mocks.generateOperationProposal.mockResolvedValue({
      response: { explanation: "No changes proposed" },
    });
    renderPanel();

    fireEvent.click(screen.getByText("Submit prompt"));

    await waitFor(() =>
      expect(mocks.agentState.addMessage).toHaveBeenCalledWith(
        "thread-a",
        expect.objectContaining({ content: "No changes proposed" })
      )
    );
    expect(mocks.agentState.addMessage).not.toHaveBeenCalledWith(
      "thread-a",
      expect.objectContaining({
        deploymentAction: "open-deployment-panel",
      })
    );
  });

  it("stores generated proposals without mutating the project", async () => {
    mocks.generateOperationProposal.mockResolvedValue({
      response: { explanation: "Review this proposal" },
      proposal: {
        id: "proposal-a",
        projectId: "project-a",
        fileId: "operation-a",
        baseFingerprint: "fingerprint",
        sourcePrompt: "Update it",
        update: { explanation: "Update it", enablePackages: [], changes: [] },
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
        update: { explanation: "Other", enablePackages: [], changes: [] },
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
      update: {
        explanation: "Update it",
        enablePackages: [] as [],
        changes: [] as [],
      },
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
    expect(mocks.generateOperationProposal).not.toHaveBeenCalled();
  });

  it("offers deployment immediately after applying a combined request", async () => {
    mocks.submitPrompt = "Fix it and deploy";
    mocks.getExplicitDeploymentIntent.mockReturnValue({ afterChanges: true });
    const proposal = {
      id: "proposal-a",
      projectId: "project-a",
      threadId: "thread-a",
      fileId: "operation-a",
      baseFingerprint: "fingerprint",
      sourcePrompt: "Fix it and deploy",
      update: {
        explanation: "Fix it",
        enablePackages: [] as [],
        changes: [] as [],
      },
      diagnostics: [],
    };
    mocks.generateOperationProposal.mockResolvedValue({
      response: { explanation: "Proposal ready" },
      proposal,
    });
    const view = renderPanel();

    fireEvent.click(screen.getByText("Submit prompt"));
    await waitFor(() =>
      expect(mocks.agentState.setPendingProposal).toHaveBeenCalled()
    );
    mocks.agentState.pendingProposals = { "thread-a": proposal };
    view.rerender(
      <MantineProvider>
        <AgentPanel />
      </MantineProvider>
    );
    fireEvent.click(screen.getByText("Apply proposal"));

    await waitFor(() =>
      expect(mocks.agentState.addMessage).toHaveBeenCalledWith(
        "thread-a",
        expect.objectContaining({ deploymentAction: "open-deployment-panel" })
      )
    );
    expect(mocks.applyAgentProposal).toHaveBeenCalledWith(proposal);
  });

  it("revises against the proposal anchor after navigation", async () => {
    const pendingProposal = {
      id: "proposal-a",
      projectId: "project-a",
      threadId: "thread-a",
      fileId: "operation-a",
      sourcePrompt: "Original request",
      update: {
        explanation: "Prior update",
        enablePackages: [] as [],
        changes: [] as [],
      },
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
        update: { explanation: "Revised", enablePackages: [], changes: [] },
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
          userPrompt: expect.stringContaining("Current proposal update"),
          initialProposal: pendingProposal,
        })
      )
    );
    expect(mocks.agentState.setPendingProposal).toHaveBeenCalledWith(
      "thread-a",
      expect.objectContaining({
        sourcePrompt: "Original request",
        update: expect.objectContaining({ explanation: "Revised" }),
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
        update: { explanation: "Original", enablePackages: [], changes: [] },
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
