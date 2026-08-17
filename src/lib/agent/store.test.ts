import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("idb", () => ({
  openDB: () =>
    Promise.resolve({
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    }),
}));

import { useAgentStore } from "../store";

const initialState = useAgentStore.getInitialState();

beforeEach(() => {
  vi.restoreAllMocks();
  useAgentStore.setState(initialState, true);
});

describe("agent store", () => {
  it("keeps agent data scoped to its project", () => {
    const first = useAgentStore.getState().createThread("project-a");
    const second = useAgentStore.getState().createThread("project-b");

    useAgentStore.getState().addMessage(first.id, {
      role: "user",
      content: "Project A",
    });

    const projects = useAgentStore.getState().agentProjects;
    expect(projects["project-a"].threads[0].messages).toHaveLength(1);
    expect(projects["project-b"].threads[0].messages).toHaveLength(0);
    expect(projects["project-b"].activeThreadId).toBe(second.id);
  });

  it("preserves project edit history when creating a later chat", () => {
    const first = useAgentStore.getState().createThread("project-a");
    const history = { entries: [], cursor: 0, lastSequence: 0 };
    const project = useAgentStore.getState().agentProjects["project-a"];
    useAgentStore.setState({
      agentProjects: {
        ...useAgentStore.getState().agentProjects,
        "project-a": { ...project, history },
      },
    });

    const second = useAgentStore.getState().createThread("project-a");
    useAgentStore.getState().selectThread("project-a", first.id);

    expect(useAgentStore.getState().agentProjects["project-a"].history).toBe(
      history
    );
    expect(
      useAgentStore.getState().agentProjects["project-a"].threads
    ).toHaveLength(2);
    expect(
      useAgentStore.getState().agentProjects["project-a"].activeThreadId
    ).toBe(first.id);
    expect(second.id).not.toBe(first.id);
  });

  it("persists preferences, API keys, and project documents", () => {
    const thread = useAgentStore.getState().createThread("project-a");
    useAgentStore.getState().setApiKey("openai", "session-secret");
    useAgentStore.getState().setSelectedModel("claude-opus-5");
    useAgentStore.getState().setThinkingLevel("high");
    useAgentStore.getState().startRun(thread.id);
    useAgentStore.getState().setPendingProposal(thread.id, {
      id: "proposal-a",
      projectId: "project-a",
      threadId: thread.id,
    } as never);

    const partialize = useAgentStore.persist.getOptions().partialize!;
    expect(partialize(useAgentStore.getState())).toEqual({
      apiKeys: { openai: "session-secret" },
      selectedModel: "claude-opus-5",
      thinkingLevel: "high",
      agentProjects: useAgentStore.getState().agentProjects,
    });
  });

  it("keeps asynchronous request traces transient and marks previous steps complete", () => {
    const thread = useAgentStore.getState().createThread("project-a");

    useAgentStore.getState().startRun(thread.id);
    expect(useAgentStore.getState().activeRun?.traces).toEqual([]);
    useAgentStore.getState().setRunTrace("Reading project context");

    expect(useAgentStore.getState().activeRun?.traces).toEqual([
      {
        id: expect.any(String),
        label: "Reading project context",
        status: "active",
      },
    ]);
    useAgentStore.getState().setRunTrace("Preparing an implementation");
    expect(useAgentStore.getState().activeRun?.traces).toEqual([
      {
        id: expect.any(String),
        label: "Reading project context",
        status: "complete",
      },
      {
        id: expect.any(String),
        label: "Preparing an implementation",
        status: "active",
      },
    ]);
    expect(
      useAgentStore.persist.getOptions().partialize!(useAgentStore.getState())
    ).not.toHaveProperty("activeRun");
  });

  it("keeps proposals transient and clears them with their thread", () => {
    const thread = useAgentStore.getState().createThread("project-a");
    const second = useAgentStore.getState().createThread("project-a");
    useAgentStore.getState().setPendingProposal(thread.id, {
      id: "proposal-a",
      projectId: "project-a",
      threadId: thread.id,
    } as never);
    useAgentStore.getState().setPendingProposal(second.id, {
      id: "proposal-b",
      projectId: "project-a",
      threadId: second.id,
    } as never);

    useAgentStore.getState().removeThread(thread.id);

    expect(
      useAgentStore.getState().pendingProposals[thread.id]
    ).toBeUndefined();
    expect(useAgentStore.getState().pendingProposals[second.id]?.id).toBe(
      "proposal-b"
    );
  });

  it("deletes one request and its response without removing later turns", () => {
    const thread = useAgentStore.getState().createThread("project-a");
    const first = useAgentStore.getState().addMessage(thread.id, {
      role: "user",
      content: "First request",
    });
    useAgentStore.getState().addMessage(thread.id, {
      role: "assistant",
      content: "First response",
      proposal: { id: "proposal-a", diagnostics: [] },
    });
    const later = useAgentStore.getState().addMessage(thread.id, {
      role: "user",
      content: "Later request",
    });
    const laterResponse = useAgentStore.getState().addMessage(thread.id, {
      role: "assistant",
      content: "Later response",
    });
    useAgentStore.getState().setPendingProposal(thread.id, {
      id: "proposal-a",
      projectId: "project-a",
      threadId: thread.id,
    } as never);

    useAgentStore.getState().deleteThreadTurn(thread.id, first!.id);

    const messages =
      useAgentStore.getState().agentProjects["project-a"].threads[0].messages;
    expect(messages.map(({ id }) => id)).toEqual([
      later!.id,
      laterResponse!.id,
    ]);
    expect(messages.map(({ content }) => content)).toEqual([
      "Later request",
      "Later response",
    ]);
    expect(
      useAgentStore.getState().pendingProposals[thread.id]
    ).toBeUndefined();
  });

  it("redacts known API keys from messages and drafts", () => {
    const thread = useAgentStore.getState().createThread("project-a");
    useAgentStore.getState().setApiKey("openai", "session-secret");

    useAgentStore.getState().setDraft(thread.id, "Use session-secret");
    useAgentStore.getState().addMessage(thread.id, {
      role: "user",
      content: "Do not save session-secret",
    });

    const persistedThread =
      useAgentStore.getState().agentProjects["project-a"].threads[0];
    expect(persistedThread.draft).toBe("Use [REDACTED]");
    expect(persistedThread.messages[0].content).toBe("Do not save [REDACTED]");
  });

  it("creates a replacement when the last thread is deleted", () => {
    const thread = useAgentStore.getState().createThread("project-a");

    useAgentStore.getState().removeThread(thread.id);

    const project = useAgentStore.getState().agentProjects["project-a"];
    expect(project.threads).toHaveLength(1);
    expect(project.threads[0].id).not.toBe(thread.id);
    expect(project.activeThreadId).toBe(project.threads[0].id);
  });

  it("removes all agent data when its project is deleted", () => {
    useAgentStore.getState().createThread("project-a");

    useAgentStore.getState().deleteAgentProject("project-a");

    expect(useAgentStore.getState().agentProjects["project-a"]).toBeUndefined();
  });

  it("reapplies project deletion after pending hydration", () => {
    const thread = useAgentStore.getState().createThread("project-a");
    const project = useAgentStore.getState().agentProjects["project-a"];
    let finishHydration!: Parameters<
      typeof useAgentStore.persist.onFinishHydration
    >[0];
    const unsubscribe = vi.fn();
    vi.spyOn(useAgentStore.persist, "hasHydrated").mockReturnValue(false);
    vi.spyOn(useAgentStore.persist, "onFinishHydration").mockImplementation(
      (listener) => {
        finishHydration = listener;
        return unsubscribe;
      }
    );

    useAgentStore.getState().deleteAgentProject("project-a");
    useAgentStore.setState({
      agentProjects: { "project-a": { ...project, activeThreadId: thread.id } },
    });
    finishHydration(useAgentStore.getState());

    expect(useAgentStore.getState().agentProjects["project-a"]).toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
