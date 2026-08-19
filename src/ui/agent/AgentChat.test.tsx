import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  isAgentProposalStale: vi.fn(() => false),
  projectState: {
    currentProjectId: "project-a",
    getCurrentProject: vi.fn(() => ({
      id: "project-a",
      files: [
        { id: "anchor-file", name: "anchorOperation", type: "operation" },
        { id: "selected-file", name: "selectedOperation", type: "operation" },
      ],
    })),
    getCurrentFile: vi.fn(() => ({ id: "selected-file", type: "operation" })),
  },
  agentState: {
    agentProjects: {
      "project-a": {
        activeThreadId: "thread-a",
        history: {
          entries: [] as { id: string }[],
          cursor: 0,
          lastSequence: 0,
        },
        threads: [
          {
            id: "thread-a",
            messages: [
              {
                id: "message-a",
                role: "assistant",
                content: "Review this",
                deploymentAction: "open-deployment-panel",
                proposal: {
                  id: "proposal-a",
                  diagnostics: [],
                  applicationId: undefined as string | undefined,
                  review: {
                    operationName: "anchorOperation",
                    actions: [],
                    files: [],
                    packages: { enabled: [], disabled: [] },
                    parameters: { before: 0, after: 0 },
                    statements: { before: 0, after: 1 },
                    operationCalls: { before: 0, after: 0 },
                    returnType: { before: "undefined", after: "string" },
                    generatedSyntax: "valid",
                  },
                },
              },
            ],
          },
        ],
      },
    },
    activeRun: undefined,
    agentReady: true,
    pendingProposals: {
      "thread-a": {
        id: "proposal-a",
        fileId: "anchor-file",
      },
    } as Record<string, { id: string; fileId: string }>,
  },
}));

vi.mock("@/lib/store", () => ({
  useProjectStore: (selector: (state: typeof mocks.projectState) => unknown) =>
    selector(mocks.projectState),
  useAgentStore: () => mocks.agentState,
}));
vi.mock("@/lib/agent/proposal", () => ({
  isAgentProposalStale: mocks.isAgentProposalStale,
}));
vi.mock("@/lib/agent/history", () => ({
  getAgentApplicationStatus: (
    agentProject: (typeof mocks.agentState.agentProjects)["project-a"],
    applicationId: string,
  ) => {
    const index = agentProject.history.entries.findIndex(
      ({ id }) => id === applicationId,
    );
    if (index < 0) return "unavailable";
    return index < agentProject.history.cursor ? "applied" : "undone";
  },
}));

import { AgentChat } from "./AgentChat";

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
    })),
  );
});

afterAll(() => vi.unstubAllGlobals());

afterEach(() => {
  Object.assign(mocks.agentState, { activeRun: undefined });
});

beforeEach(() => {
  mocks.agentState.agentReady = true;
  mocks.agentState.activeRun = undefined;
  mocks.agentState.agentProjects["project-a"].history = {
    entries: [],
    cursor: 0,
    lastSequence: 0,
  };
  mocks.agentState.agentProjects["project-a"].threads[0].messages = [
    {
      id: "message-a",
      role: "assistant",
      content: "Review this",
      deploymentAction: "open-deployment-panel",
      proposal: {
        id: "proposal-a",
        diagnostics: [],
        applicationId: undefined,
        review: {
          operationName: "anchorOperation",
          actions: [],
          files: [],
          packages: { enabled: [], disabled: [] },
          parameters: { before: 0, after: 0 },
          statements: { before: 0, after: 1 },
          operationCalls: { before: 0, after: 0 },
          returnType: { before: "undefined", after: "string" },
          generatedSyntax: "valid",
        },
      },
    },
  ] as never;
  mocks.agentState.pendingProposals = {
    "thread-a": { id: "proposal-a", fileId: "anchor-file" },
  } as Record<string, { id: string; fileId: string }>;
});

describe("AgentChat request progress", () => {
  it("shows asynchronous work and streamed explanation", () => {
    Object.assign(mocks.agentState, {
      activeRun: {
        threadId: "thread-a",
        streamingContent: "I found the relevant operation.",
        traces: [
          {
            id: "trace-a",
            label: "Reading project context",
            status: "complete",
          },
          {
            id: "trace-b",
            label: "Preparing an implementation",
            status: "active",
          },
        ],
      },
    });

    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );

    const progress = screen.getByRole("status", { name: "Agent progress" });
    expect(progress.textContent).toContain("Reading project context");
    expect(progress.textContent).toContain("Preparing an implementation");
    expect(progress.textContent).not.toContain("Planning the requested change");
    expect(progress.textContent).toContain("I found the relevant operation.");
    expect(progress.textContent).not.toContain("Loading...");
  });
});

describe("AgentChat navigation and recovery", () => {
  it("explains that chat history is loading before hydration completes", () => {
    mocks.agentState.agentReady = false;

    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Loading agent chats",
    );
  });

  it("follows new messages when the reader is already at the bottom", () => {
    const view = render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );
    const conversation = screen.getByRole("log", {
      name: "Agent conversation",
    });
    Object.defineProperties(conversation, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    conversation.scrollTop = 700;
    fireEvent.scroll(conversation);

    mocks.agentState.agentProjects["project-a"].threads[0].messages.push({
      id: "message-b",
      role: "assistant",
      content: "A newer response",
    } as never);
    view.rerender(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );

    expect(conversation.scrollTop).toBe(1000);
  });

  it("preserves an older reading position and offers jump to latest", () => {
    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );
    const conversation = screen.getByRole("log", {
      name: "Agent conversation",
    });
    Object.defineProperties(conversation, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    conversation.scrollTop = 0;
    fireEvent.scroll(conversation);

    expect(
      screen.getByRole("button", { name: "Jump to latest" }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));

    expect(conversation.scrollTop).toBe(1000);
    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
  });

  it("renders recovery actions for retryable errors", () => {
    const onOpenApiKeys = vi.fn();
    const onRetry = vi.fn();
    mocks.agentState.agentProjects["project-a"].threads[0].messages = [
      {
        id: "error-a",
        role: "assistant",
        content: "Error: Provider rejected the API key",
        error: {
          requiresApiKey: true,
          retry: { prompt: "Try again", sourceFileId: "anchor-file" },
        },
      },
    ] as never;

    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={onOpenApiKeys}
          onRetry={onRetry}
          historyBusy={false}
        />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add API key" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry request" }));

    expect(onOpenApiKeys).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith({
      prompt: "Try again",
      sourceFileId: "anchor-file",
    });
  });
});

describe("AgentChat proposal navigation", () => {
  it("keeps an anchored proposal recoverable when another file is selected", () => {
    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );

    expect(mocks.isAgentProposalStale).toHaveBeenCalled();
    expect(
      screen.getByRole("log", { name: "Agent conversation" }),
    ).toBeDefined();
    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("shows a manual deployment action", () => {
    const onOpenDeploymentPanel = vi.fn();
    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={onOpenDeploymentPanel}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Deployment panel" }),
    );
    expect(onOpenDeploymentPanel).toHaveBeenCalledOnce();
  });

  it("routes inline history actions to the selected proposal turn", () => {
    const onUndoApplication = vi.fn();
    const message =
      mocks.agentState.agentProjects["project-a"].threads[0].messages[0];
    message.proposal.applicationId = "application-a";
    mocks.agentState.agentProjects["project-a"].threads[0].messages = [
      {
        id: "user-a",
        role: "user",
        content: "Update the operation",
      },
      message,
    ] as never;
    mocks.agentState.agentProjects["project-a"].history = {
      entries: [{ id: "application-a" }],
      cursor: 1,
      lastSequence: 1,
    };
    delete mocks.agentState.pendingProposals["thread-a"];

    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={onUndoApplication}
          onRedoApplication={vi.fn()}
          onDeleteTurn={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );

    expect(screen.getByRole("button", { name: "Delete turn" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Undo agent edit" }));
    expect(onUndoApplication).toHaveBeenCalledWith("application-a");
  });

  it("confirms and routes deleting a user turn", async () => {
    const onDeleteTurn = vi.fn();
    mocks.agentState.agentProjects["project-a"].threads[0].messages = [
      {
        id: "user-a",
        role: "user",
        content: "Remove this request",
      } as never,
    ] as never;

    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onUndoApplication={vi.fn()}
          onRedoApplication={vi.fn()}
          onDeleteTurn={onDeleteTurn}
          onOpenDeploymentPanel={vi.fn()}
          onOpenApiKeys={vi.fn()}
          onRetry={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete turn" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Yes, delete." }),
      ).toBeDefined(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, delete.", hidden: true }),
    );

    expect(onDeleteTurn).toHaveBeenCalledWith("user-a");
  });
});
