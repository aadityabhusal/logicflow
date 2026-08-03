import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
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
    selectedModel: undefined,
    addMessage: vi.fn(),
    getApiKey: vi.fn(),
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
    activeRun: undefined,
  };
  const projectState = {
    currentProjectId: "project-a",
    getCurrentFile: vi.fn(),
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
  };
});

vi.mock("@/lib/store", () => ({
  fileHistoryActions: { pushState: vi.fn() },
  useAgentStore: () => mocks.agentState,
  useAgentPersistenceErrorStore: mocks.useAgentPersistenceErrorStore,
  useProjectStore: mocks.useProjectStore,
}));
vi.mock("@/lib/data", () => ({ AVAILABLE_MODELS: [], LLM_PROVIDERS: {} }));
vi.mock("@/lib/agent/agent-service", () => ({
  applyChangesToOperation: vi.fn(),
  generateOperationChanges: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  createFileFromOperation: vi.fn(),
  createOperationFromFile: vi.fn(),
}));
vi.mock("./agent/AgentChat", () => ({ AgentChat: () => null }));
vi.mock("./agent/AgentInput", () => ({ AgentInput: () => null }));

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
  mocks.persistenceState.error = undefined;
});

describe("AgentPanel thread header", () => {
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
