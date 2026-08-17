import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentOperationUpdate, AgentProposal } from "./proposal";
import { getAgentEditableFingerprint, getAgentHistoryState } from "./proposal";
import type { Project } from "../types";
import { fileHistoryActions } from "../store";

const mocks = vi.hoisted(() => {
  const projectState = {
    projects: {} as Record<string, Project>,
    currentProjectId: "project-a" as string | undefined,
    currentFileId: "operation-a" as string | undefined,
  };
  const agentState = {
    apiKeys: {},
    selectedModel: "gpt-5.6-terra",
    thinkingLevel: "high",
    agentProjects: {} as Record<string, import("./types").AgentProject>,
    pendingProposals: {} as Record<string, AgentProposal>,
  };
  const setState = <T extends object>(state: T, update: unknown) => {
    const patch =
      typeof update === "function"
        ? (update as (value: T) => Partial<T>)(state)
        : update;
    Object.assign(state, patch);
  };
  return {
    projectState,
    agentState,
    commitAgentEdit: vi.fn(async () => undefined),
    clearHistory: vi.fn(),
    editorHistories: new Set<string>(),
    resetWorker: vi.fn(),
    removeAll: vi.fn(),
    setNavigation: vi.fn(),
    setState,
    livePackages: [] as string[],
    failPackageLoad: false,
  };
});

vi.mock("../idb", () => ({ commitAgentEdit: mocks.commitAgentEdit }));
vi.mock("../store", () => ({
  fileHistoryActions: {
    clearHistory: (id: string) => {
      mocks.clearHistory(id);
      mocks.editorHistories.delete(id);
    },
    pushState: (id: string) => mocks.editorHistories.add(id),
    canUndo: (id: string) => mocks.editorHistories.has(id),
  },
  useProjectStore: {
    getState: () => mocks.projectState,
    setState: (update: unknown) => mocks.setState(mocks.projectState, update),
  },
  useAgentStore: {
    getState: () => mocks.agentState,
    setState: (update: unknown) => mocks.setState(mocks.agentState, update),
  },
  useNavigationStore: {
    getState: () => ({ setNavigation: mocks.setNavigation }),
  },
}));
vi.mock("../execution/store", () => ({
  useExecutionResultsStore: {
    getState: () => ({ removeAll: mocks.removeAll }),
  },
}));
vi.mock("../execution/worker-client", () => ({
  executionWorkerClient: { reset: mocks.resetWorker },
}));
vi.mock("../operations/built-in", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../operations/built-in")>();
  return {
    ...actual,
    withSyncedPackageRegistry: async <T>(
      packages: { name: string }[],
      action: () => T | Promise<T>,
    ) => {
      if (mocks.failPackageLoad) throw new Error("package load failed");
      const previous = mocks.livePackages;
      mocks.livePackages = packages.map(({ name }) => name);
      try {
        return await action();
      } catch (error) {
        mocks.livePackages = previous;
        throw error;
      }
    },
  };
});

import {
  applyAgentProposal,
  canRedoAgentEdit,
  canUndoAgentEdit,
  getAgentApplicationStatus,
  redoAgentApplication,
  redoAgentEdit,
  undoAgentApplication,
  undoAgentEdit,
} from "./history";

function operationFile(
  statementId: string,
  id = "operation-a",
  name = id === "operation-a" ? "operationA" : id,
) {
  return {
    id,
    name,
    type: "operation" as const,
    createdAt: 1,
    content: {
      type: {
        kind: "operation" as const,
        parameters: [],
        result: { kind: "undefined" as const },
      },
      value: {
        name,
        parameters: [],
        statements: [
          {
            id: statementId,
            name: statementId.replace(/[^a-zA-Z0-9_$]/g, "_"),
            data: {
              id: `${statementId}-data`,
              type: { kind: "undefined" as const },
            },
            operations: [],
          },
        ],
        isAsync: false,
      },
    },
  } as unknown as Extract<Project["files"][number], { type: "operation" }>;
}

function operationUpdate(
  statementId: string,
  marker: string,
): AgentOperationUpdate {
  return {
    explanation: `Change to ${marker}`,
    enablePackages: [],
    changes: [
      {
        kind: "replace_statement" as const,
        statementId,
        statement: {
          id: marker,
          name: marker.replace(/[^a-zA-Z0-9_$]/g, "_"),
          data: {
            id: `${marker}-data`,
            type: { kind: "undefined" as const },
            value: undefined,
          },
          operations: [],
        },
      },
    ],
  };
}

function setup() {
  const project: Project = {
    id: "project-a",
    name: "Project",
    version: "1.0.0",
    createdAt: 1,
    files: [
      {
        id: "docs",
        name: "docs",
        type: "documentation",
        createdAt: 1,
        content: "Keep",
      },
      operationFile("before"),
    ],
    dependencies: {
      npm: [{ name: "wretch", version: "1", exports: [], namespace: "kept" }],
    },
  };
  const proposal: AgentProposal = {
    id: "proposal-a",
    projectId: project.id,
    threadId: "thread-a",
    fileId: "operation-a",
    baseFingerprint: getAgentEditableFingerprint(project),
    sourcePrompt: "Change it",
    update: operationUpdate("before", "after"),
    proposedFile: operationFile("after") as Extract<
      Project["files"][number],
      { type: "operation" }
    >,
    proposedState: getAgentHistoryState({
      ...project,
      files: [project.files[0], operationFile("after")],
    }),
    diagnostics: [],
  };
  mocks.projectState.projects = { [project.id]: project };
  mocks.projectState.currentProjectId = project.id;
  mocks.projectState.currentFileId = "operation-a";
  mocks.agentState.agentProjects = {
    [project.id]: {
      projectId: project.id,
      activeThreadId: "thread-a",
      threads: [
        {
          id: "thread-a",
          title: "Chat",
          createdAt: 1,
          updatedAt: 1,
          draft: "",
          messages: [
            {
              id: "message-a",
              role: "assistant",
              content: "Review",
              createdAt: 1,
              proposal: { id: proposal.id, diagnostics: [] },
            },
          ],
        },
      ],
    },
  };
  mocks.agentState.pendingProposals = { "thread-a": proposal };
  return proposal;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.commitAgentEdit.mockResolvedValue(undefined);
  mocks.livePackages = [];
  mocks.failPackageLoad = false;
  mocks.editorHistories.clear();
});

describe("agent edit history", () => {
  it("atomically applies a proposal and records durable history", async () => {
    const proposal = setup();

    const entry = await applyAgentProposal(proposal);

    expect(mocks.commitAgentEdit).toHaveBeenCalledOnce();
    expect(mocks.commitAgentEdit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      {
        apiKeys: {},
        selectedModel: "gpt-5.6-terra",
        thinkingLevel: "high",
      },
    );
    expect(mocks.projectState.projects["project-a"].files[0]).toMatchObject({
      id: "docs",
      content: "Keep",
    });
    expect(
      mocks.agentState.agentProjects["project-a"].history?.entries,
    ).toHaveLength(1);
    expect(
      mocks.agentState.agentProjects["project-a"].threads[0].messages[0]
        .proposal?.applicationId,
    ).toBe(entry.id);
    expect(mocks.agentState.pendingProposals["thread-a"]).toBeUndefined();
    expect(mocks.clearHistory).toHaveBeenCalledWith("operation-a");
    expect(mocks.resetWorker).toHaveBeenCalledOnce();
    expect(mocks.removeAll).toHaveBeenCalledOnce();
  });

  it("leaves memory and the proposal unchanged when persistence fails", async () => {
    const proposal = setup();
    const originalProject = mocks.projectState.projects["project-a"];
    mocks.commitAgentEdit.mockRejectedValueOnce(new Error("storage failed"));

    await expect(applyAgentProposal(proposal)).rejects.toThrow(
      "storage failed",
    );

    expect(mocks.projectState.projects["project-a"]).toBe(originalProject);
    expect(mocks.agentState.pendingProposals["thread-a"]).toBe(proposal);
    expect(mocks.resetWorker).not.toHaveBeenCalled();
  });

  it("compensates instead of overwriting an edit made while saving", async () => {
    const proposal = setup();
    let finishCommit!: () => void;
    mocks.commitAgentEdit
      .mockImplementationOnce(
        () =>
          new Promise<undefined>((resolve) => {
            finishCommit = () => resolve(undefined);
          }),
      )
      .mockResolvedValueOnce(undefined);

    const application = applyAgentProposal(proposal);
    await vi.waitFor(() => expect(finishCommit).toBeTypeOf("function"));
    const current = mocks.projectState.projects["project-a"];
    mocks.projectState.projects = {
      ...mocks.projectState.projects,
      "project-a": { ...current, description: "Concurrent edit" },
    };
    finishCommit();

    await expect(application).rejects.toThrow(
      "changed while the edit was being saved",
    );
    expect(mocks.commitAgentEdit).toHaveBeenCalledTimes(2);
    expect(mocks.projectState.projects["project-a"].description).toBe(
      "Concurrent edit",
    );
    expect(mocks.agentState.pendingProposals["thread-a"]).toBe(proposal);
  });

  it("compensates when proposal ownership changes while saving", async () => {
    const proposal = setup();
    let finishCommit!: () => void;
    mocks.commitAgentEdit
      .mockImplementationOnce(
        () =>
          new Promise<undefined>((resolve) => {
            finishCommit = () => resolve(undefined);
          }),
      )
      .mockResolvedValueOnce(undefined);

    const application = applyAgentProposal(proposal);
    await vi.waitFor(() => expect(finishCommit).toBeTypeOf("function"));
    const replacement = { ...proposal, id: "proposal-b" };
    mocks.agentState.pendingProposals = { "thread-a": replacement };
    finishCommit();

    await expect(application).rejects.toThrow(
      "changed while the edit was being saved",
    );
    expect(mocks.commitAgentEdit).toHaveBeenCalledTimes(2);
    expect(mocks.agentState.pendingProposals["thread-a"]).toBe(replacement);
  });

  it("preserves a preference changed while saving", async () => {
    const proposal = setup();
    let finishCommit!: () => void;
    mocks.commitAgentEdit
      .mockImplementationOnce(
        () =>
          new Promise<undefined>((resolve) => {
            finishCommit = () => resolve(undefined);
          }),
      )
      .mockResolvedValueOnce(undefined);

    const application = applyAgentProposal(proposal);
    await vi.waitFor(() => expect(finishCommit).toBeTypeOf("function"));
    mocks.agentState.selectedModel = "claude-opus-5";
    finishCommit();

    await expect(application).rejects.toThrow(
      "changed while the edit was being saved",
    );
    expect(mocks.commitAgentEdit).toHaveBeenLastCalledWith(
      mocks.projectState.projects,
      mocks.agentState.agentProjects,
      expect.objectContaining({ selectedModel: "claude-opus-5" }),
    );
  });

  it("undoes and redoes only when the current state matches history", async () => {
    await applyAgentProposal(setup());
    const agentProject = mocks.agentState.agentProjects["project-a"];
    expect(canUndoAgentEdit(agentProject)).toBe(true);

    await undoAgentEdit("project-a");
    expect(canRedoAgentEdit(mocks.agentState.agentProjects["project-a"])).toBe(
      true,
    );

    await redoAgentEdit("project-a");
    const operation = mocks.projectState.projects["project-a"].files[1];
    expect(
      operation.type === "operation" &&
        operation.content.value.statements[0].name,
    ).toBe("after");

    await undoAgentEdit("project-a");
    const current = mocks.projectState.projects["project-a"];
    mocks.projectState.projects["project-a"] = {
      ...current,
      files: [
        ...current.files,
        {
          id: "extra",
          name: "extra",
          type: "operation",
          createdAt: 1,
        } as never,
      ],
    };
    await expect(redoAgentEdit("project-a")).rejects.toThrow("project changed");
  });

  it("rewinds to an older application and replays through a selected turn", async () => {
    const baseProposal = setup();
    const first = await applyAgentProposal(baseProposal);
    const current = mocks.projectState.projects["project-a"];
    const secondProposal = {
      ...baseProposal,
      id: "proposal-b",
      baseFingerprint: getAgentEditableFingerprint(current),
      update: operationUpdate("before", "latest"),
      proposedFile: operationFile("latest"),
      proposedState: getAgentHistoryState({
        ...current,
        files: current.files.map((file) =>
          file.id === "operation-a" ? operationFile("latest") : file,
        ),
      }),
    } as AgentProposal;
    mocks.projectState.projects["project-a"] = current;
    mocks.agentState.pendingProposals["thread-a"] = secondProposal;
    const message =
      mocks.agentState.agentProjects["project-a"].threads[0].messages[0];
    message.proposal = { id: secondProposal.id, diagnostics: [] };
    const second = await applyAgentProposal(secondProposal);

    await undoAgentApplication("project-a", first.id);

    let agentProject = mocks.agentState.agentProjects["project-a"];
    const currentProject = mocks.projectState.projects["project-a"];
    expect(agentProject.history?.cursor).toBe(0);
    expect(
      getAgentApplicationStatus(agentProject, first.id, currentProject),
    ).toBe("undone");
    expect(
      getAgentApplicationStatus(agentProject, second.id, currentProject),
    ).toBe("undone");
    expect(
      (
        mocks.projectState.projects["project-a"].files[1] as ReturnType<
          typeof operationFile
        >
      ).content.value.statements[0].name,
    ).toBe("before");

    await redoAgentApplication("project-a", second.id);

    agentProject = mocks.agentState.agentProjects["project-a"];
    expect(agentProject.history?.cursor).toBe(2);
    expect(
      getAgentApplicationStatus(
        agentProject,
        first.id,
        mocks.projectState.projects["project-a"],
      ),
    ).toBe("applied");
    expect(
      getAgentApplicationStatus(
        agentProject,
        second.id,
        mocks.projectState.projects["project-a"],
      ),
    ).toBe("applied");
    expect(
      (
        mocks.projectState.projects["project-a"].files[1] as ReturnType<
          typeof operationFile
        >
      ).content.value.statements[0].name,
    ).toBe("latest");
  });

  it("rejects stale or conflicting application actions", async () => {
    const entry = await applyAgentProposal(setup());
    await expect(redoAgentApplication("project-a", entry.id)).rejects.toThrow(
      "already applied",
    );

    const current = mocks.projectState.projects["project-a"];
    mocks.projectState.projects["project-a"] = {
      ...current,
      files: current.files.map((file) =>
        file.id === "operation-a" ? operationFile("manual") : file,
      ),
    };
    expect(
      getAgentApplicationStatus(
        mocks.agentState.agentProjects["project-a"],
        entry.id,
        mocks.projectState.projects["project-a"],
      ),
    ).toBe("unavailable");
    await expect(undoAgentApplication("project-a", entry.id)).rejects.toThrow(
      "project changed",
    );
    await expect(undoAgentApplication("project-a", "missing")).rejects.toThrow(
      "no longer in history",
    );
  });

  it("invalidates redo without reusing sequence numbers", async () => {
    await applyAgentProposal(setup());
    await undoAgentEdit("project-a");
    const current = mocks.projectState.projects["project-a"];
    const nextProposal = {
      ...mocks.agentState.pendingProposals["thread-a"],
      id: "proposal-b",
      projectId: current.id,
      threadId: "thread-a",
      fileId: "operation-a",
      sourcePrompt: "Change again",
      update: operationUpdate("before", "different"),
      baseFingerprint: getAgentEditableFingerprint(current),
      proposedFile: operationFile("different"),
      proposedState: getAgentHistoryState({
        ...current,
        files: current.files.map((file) =>
          file.id === "operation-a" ? operationFile("different") : file,
        ),
      }),
      diagnostics: [],
    } as AgentProposal;
    mocks.agentState.pendingProposals["thread-a"] = nextProposal;

    const entry = await applyAgentProposal(nextProposal);

    expect(entry.sequence).toBe(2);
    expect(mocks.agentState.agentProjects["project-a"].history).toMatchObject({
      cursor: 1,
      lastSequence: 2,
    });
    expect(
      mocks.agentState.agentProjects["project-a"].history?.entries,
    ).toHaveLength(1);
  });

  it("starts a new history chain after a conflicting manual edit", async () => {
    await applyAgentProposal(setup());
    const current = mocks.projectState.projects["project-a"];
    const manuallyEdited = {
      ...current,
      files: current.files.map((file) =>
        file.id === "operation-a" ? operationFile("manual") : file,
      ),
    };
    mocks.projectState.projects["project-a"] = manuallyEdited;
    const proposal = {
      id: "proposal-b",
      projectId: manuallyEdited.id,
      threadId: "thread-a",
      fileId: "operation-a",
      baseFingerprint: getAgentEditableFingerprint(manuallyEdited),
      sourcePrompt: "Change it again",
      update: operationUpdate("manual", "second"),
      proposedFile: operationFile("second"),
      proposedState: getAgentHistoryState({
        ...manuallyEdited,
        files: manuallyEdited.files.map((file) =>
          file.id === "operation-a" ? operationFile("second") : file,
        ),
      }),
      diagnostics: [],
    } as AgentProposal;
    mocks.agentState.pendingProposals["thread-a"] = proposal;

    const entry = await applyAgentProposal(proposal);

    expect(entry.sequence).toBe(2);
    expect(
      mocks.agentState.agentProjects["project-a"].history?.entries,
    ).toEqual([entry]);
  });

  it("requires the exact pending proposal identity", async () => {
    const proposal = setup();
    mocks.agentState.pendingProposals["thread-a"] = { ...proposal };

    await expect(applyAgentProposal(proposal)).rejects.toThrow(
      "no longer pending",
    );
    expect(mocks.commitAgentEdit).not.toHaveBeenCalled();
  });

  it("rejects a corrupted native update before Apply", async () => {
    const proposal = setup();
    proposal.update = { unexpected: true } as never;

    await expect(applyAgentProposal(proposal)).rejects.toThrow(
      "failed final validation",
    );
    expect(mocks.commitAgentEdit).not.toHaveBeenCalled();
  });

  it("rebuilds the candidate and updates only the selected operation", async () => {
    const proposal = setup();
    const project = mocks.projectState.projects["project-a"];
    project.files.push(operationFile("other", "operation-b"));
    proposal.baseFingerprint = getAgentEditableFingerprint(project);
    proposal.proposedState = getAgentHistoryState({
      ...project,
      files: project.files.map((file) =>
        file.id === "operation-b"
          ? operationFile("tampered", "operation-b")
          : file,
      ),
    });

    await applyAgentProposal(proposal);

    const operations = mocks.projectState.projects["project-a"].files.filter(
      (file) => file.type === "operation",
    );
    expect(operations[0].content.value.statements[0].name).toBe("after");
    expect(operations[1].content.value.statements[0].name).toBe("other");
  });

  it("applies while a different file is selected", async () => {
    const proposal = setup();
    mocks.projectState.currentFileId = "docs";

    await applyAgentProposal(proposal);

    expect(mocks.projectState.currentFileId).toBe("docs");
  });

  it("retains 50 entries while sequence numbers remain monotonic", async () => {
    const baseProposal = setup();
    for (let sequence = 1; sequence <= 51; sequence++) {
      const project = mocks.projectState.projects["project-a"];
      const proposal = {
        ...baseProposal,
        id: `proposal-${sequence}`,
        baseFingerprint: getAgentEditableFingerprint(project),
        update: operationUpdate("before", `state-${sequence}`),
        proposedFile: operationFile(`state-${sequence}`),
        proposedState: getAgentHistoryState({
          ...project,
          files: project.files.map((file) =>
            file.id === "operation-a"
              ? operationFile(`state-${sequence}`)
              : file,
          ),
        }),
      } as AgentProposal;
      mocks.agentState.pendingProposals["thread-a"] = proposal;
      await applyAgentProposal(proposal);
    }

    const history = mocks.agentState.agentProjects["project-a"].history!;
    expect(history.entries).toHaveLength(50);
    expect(history.entries[0].sequence).toBe(2);
    expect(history.lastSequence).toBe(51);
  });

  it("attributes interleaved edits to their proposal threads", async () => {
    const firstProposal = setup();
    await applyAgentProposal(firstProposal);
    const project = mocks.projectState.projects["project-a"];
    const agentProject = mocks.agentState.agentProjects["project-a"];
    agentProject.threads.push({
      id: "thread-b",
      title: "Other",
      createdAt: 2,
      updatedAt: 2,
      draft: "",
      messages: [],
    });
    agentProject.activeThreadId = "thread-b";
    const proposal = {
      ...firstProposal,
      id: "proposal-b",
      threadId: "thread-b",
      baseFingerprint: getAgentEditableFingerprint(project),
      update: operationUpdate("before", "thread-b"),
      proposedState: getAgentHistoryState({
        ...project,
        files: project.files.map((file) =>
          file.id === "operation-a" ? operationFile("thread-b") : file,
        ),
      }),
      diagnostics: [],
    } as AgentProposal;
    mocks.agentState.pendingProposals["thread-b"] = proposal;

    await applyAgentProposal(proposal);

    expect(
      mocks.agentState.agentProjects["project-a"].history?.entries.map(
        ({ threadId }) => threadId,
      ),
    ).toEqual(["thread-a", "thread-b"]);
  });

  it("does not persist when target packages fail to load", async () => {
    const proposal = setup();
    proposal.update.enablePackages = ["rowguard"];
    mocks.failPackageLoad = true;

    await expect(applyAgentProposal(proposal)).rejects.toThrow(
      "package load failed",
    );
    expect(mocks.commitAgentEdit).not.toHaveBeenCalled();
    expect(mocks.agentState.pendingProposals["thread-a"]).toBe(proposal);
  });

  it("rolls the live package registry back when persistence fails", async () => {
    const proposal = setup();
    proposal.update.enablePackages = ["rowguard"];
    mocks.livePackages = ["faker"];
    mocks.commitAgentEdit.mockRejectedValueOnce(new Error("storage failed"));

    await expect(applyAgentProposal(proposal)).rejects.toThrow(
      "storage failed",
    );

    expect(mocks.livePackages).toEqual(["faker"]);
    expect(
      mocks.projectState.projects["project-a"].dependencies?.npm?.[0].name,
    ).toBe("wretch");
  });

  it("keeps undo and redo cursors unchanged when package sync fails", async () => {
    await applyAgentProposal(setup());
    mocks.failPackageLoad = true;

    await expect(undoAgentEdit("project-a")).rejects.toThrow(
      "package load failed",
    );
    expect(mocks.agentState.agentProjects["project-a"].history?.cursor).toBe(1);

    mocks.failPackageLoad = false;
    await undoAgentEdit("project-a");
    mocks.failPackageLoad = true;
    await expect(redoAgentEdit("project-a")).rejects.toThrow(
      "package load failed",
    );
    expect(mocks.agentState.agentProjects["project-a"].history?.cursor).toBe(0);
  });

  it("clears the selected operation history but preserves unaffected ones", async () => {
    const proposal = setup();
    const project = mocks.projectState.projects["project-a"];
    project.files.push(operationFile("keep", "operation-keep", "keep"));
    proposal.baseFingerprint = getAgentEditableFingerprint(project);
    for (const id of ["operation-a", "operation-keep"]) {
      fileHistoryActions.pushState(id, {} as never);
    }

    await applyAgentProposal(proposal);

    expect(mocks.clearHistory).toHaveBeenCalledWith("operation-a");
    expect(mocks.clearHistory).not.toHaveBeenCalledWith("operation-keep");
    expect(fileHistoryActions.canUndo("operation-keep")).toBe(true);
  });
});
