import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProposal } from "./proposal";
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
    expectApplication: vi.fn(),
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
vi.mock("../execution/controller", () => ({
  executionController: { expectApplication: mocks.expectApplication },
}));
vi.mock("../operations/built-in", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../operations/built-in")>();
  return {
    ...actual,
    withSyncedPackageRegistry: async <T>(
      packages: { name: string }[],
      action: () => T | Promise<T>
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
  name = id === "operation-a" ? "operationA" : id
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
        statements: [{ id: statementId }],
        isAsync: false,
      },
    },
  } as unknown as Extract<Project["files"][number], { type: "operation" }>;
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
      npm: [{ name: "pkg", version: "1", exports: [], namespace: "kept" }],
    },
  };
  const proposal: AgentProposal = {
    id: "proposal-a",
    projectId: project.id,
    threadId: "thread-a",
    fileId: "operation-a",
    baseFingerprint: getAgentEditableFingerprint(project),
    sourcePrompt: "Change it",
    draft: { name: "operationA", parameters: [], statements: [] },
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
    expect(mocks.expectApplication).toHaveBeenCalledWith({
      applicationId: entry.id,
      projectId: "project-a",
      operationId: "operation-a",
      redactionValues: [],
    });
    expect(mocks.projectState.projects["project-a"].files[0]).toMatchObject({
      id: "docs",
      content: "Keep",
    });
    expect(
      mocks.agentState.agentProjects["project-a"].history?.entries
    ).toHaveLength(1);
    expect(
      mocks.agentState.agentProjects["project-a"].threads[0].messages[0]
        .proposal?.applicationId
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
      "storage failed"
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
          })
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
      "changed while the edit was being saved"
    );
    expect(mocks.commitAgentEdit).toHaveBeenCalledTimes(2);
    expect(mocks.projectState.projects["project-a"].description).toBe(
      "Concurrent edit"
    );
    expect(mocks.agentState.pendingProposals["thread-a"]).toBe(proposal);
  });

  it("undoes and redoes only when the current state matches history", async () => {
    await applyAgentProposal(setup());
    const agentProject = mocks.agentState.agentProjects["project-a"];
    expect(canUndoAgentEdit(agentProject)).toBe(true);

    await undoAgentEdit("project-a");
    expect(canRedoAgentEdit(mocks.agentState.agentProjects["project-a"])).toBe(
      true
    );

    await redoAgentEdit("project-a");
    const operation = mocks.projectState.projects["project-a"].files[1];
    expect(
      operation.type === "operation" && operation.content.value.statements[0].id
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
      proposedFile: operationFile("latest"),
      proposedState: getAgentHistoryState({
        ...current,
        files: current.files.map((file) =>
          file.id === "operation-a" ? operationFile("latest") : file
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
    expect(agentProject.history?.cursor).toBe(0);
    expect(getAgentApplicationStatus(agentProject, first.id)).toBe("undone");
    expect(getAgentApplicationStatus(agentProject, second.id)).toBe("undone");
    expect(
      (
        mocks.projectState.projects["project-a"].files[1] as ReturnType<
          typeof operationFile
        >
      ).content.value.statements[0].id
    ).toBe("before");

    await redoAgentApplication("project-a", second.id);

    agentProject = mocks.agentState.agentProjects["project-a"];
    expect(agentProject.history?.cursor).toBe(2);
    expect(getAgentApplicationStatus(agentProject, first.id)).toBe("applied");
    expect(getAgentApplicationStatus(agentProject, second.id)).toBe("applied");
    expect(
      (
        mocks.projectState.projects["project-a"].files[1] as ReturnType<
          typeof operationFile
        >
      ).content.value.statements[0].id
    ).toBe("latest");
  });

  it("rejects stale or conflicting application actions", async () => {
    const entry = await applyAgentProposal(setup());
    await expect(redoAgentApplication("project-a", entry.id)).rejects.toThrow(
      "already applied"
    );

    const current = mocks.projectState.projects["project-a"];
    mocks.projectState.projects["project-a"] = {
      ...current,
      files: current.files.map((file) =>
        file.id === "operation-a" ? operationFile("manual") : file
      ),
    };
    await expect(undoAgentApplication("project-a", entry.id)).rejects.toThrow(
      "project changed"
    );
    await expect(undoAgentApplication("project-a", "missing")).rejects.toThrow(
      "no longer in history"
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
      draft: { name: "operationA", parameters: [], statements: [] },
      baseFingerprint: getAgentEditableFingerprint(current),
      proposedFile: operationFile("different"),
      proposedState: getAgentHistoryState({
        ...current,
        files: current.files.map((file) =>
          file.id === "operation-a" ? operationFile("different") : file
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
      mocks.agentState.agentProjects["project-a"].history?.entries
    ).toHaveLength(1);
  });

  it("starts a new history chain after a conflicting manual edit", async () => {
    await applyAgentProposal(setup());
    const current = mocks.projectState.projects["project-a"];
    const manuallyEdited = {
      ...current,
      files: current.files.map((file) =>
        file.id === "operation-a" ? operationFile("manual") : file
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
      draft: { name: "operationA", parameters: [], statements: [] },
      proposedFile: operationFile("second"),
      proposedState: getAgentHistoryState({
        ...manuallyEdited,
        files: manuallyEdited.files.map((file) =>
          file.id === "operation-a" ? operationFile("second") : file
        ),
      }),
      diagnostics: [],
    } as AgentProposal;
    mocks.agentState.pendingProposals["thread-a"] = proposal;

    const entry = await applyAgentProposal(proposal);

    expect(entry.sequence).toBe(2);
    expect(
      mocks.agentState.agentProjects["project-a"].history?.entries
    ).toEqual([entry]);
  });

  it("applies multi-file create, update, delete, and package changes", async () => {
    const proposal = setup();
    const project = mocks.projectState.projects["project-a"];
    const deleted = operationFile("deleted", "operation-delete");
    const jsonFile = {
      id: "json",
      name: "data",
      type: "json" as const,
      createdAt: 1,
      content: { keep: true },
    };
    project.files = [
      project.files[0],
      operationFile("before"),
      jsonFile,
      deleted,
    ];
    project.dependencies = {
      npm: [{ name: "faker", version: "1", exports: [], namespace: "F" }],
      logicflow: [
        { projectId: "shared", version: "2", exports: [], namespace: "S" },
      ],
    };
    proposal.baseFingerprint = getAgentEditableFingerprint(project);
    proposal.proposedState = {
      operationFiles: [
        { index: 0, file: operationFile("created", "operation-created") },
        { index: 3, file: operationFile("updated", "operation-a", "renamed") },
      ],
      npmDependencies: [
        { name: "rowguard", version: "9", exports: [], namespace: "Rg" },
      ],
    };
    mocks.projectState.currentFileId = "docs";

    await applyAgentProposal(proposal);

    const applied = mocks.projectState.projects["project-a"];
    expect(applied.files.map(({ id }) => id)).toEqual([
      "operation-created",
      "docs",
      "json",
      "operation-a",
    ]);
    expect(applied.files[3].name).toBe("renamed");
    expect(applied.dependencies).toEqual({
      npm: [{ name: "rowguard", version: "9", exports: [], namespace: "Rg" }],
      logicflow: [
        { projectId: "shared", version: "2", exports: [], namespace: "S" },
      ],
    });
    expect(mocks.projectState.currentFileId).toBe("docs");
    expect(mocks.livePackages).toEqual(["rowguard"]);

    mocks.projectState.projects["project-a"] = structuredClone(applied);
    mocks.agentState.agentProjects["project-a"] = structuredClone(
      mocks.agentState.agentProjects["project-a"]
    );
    await undoAgentEdit("project-a");
    expect(
      mocks.projectState.projects["project-a"].files.map(({ id }) => id)
    ).toEqual(["docs", "operation-a", "json", "operation-delete"]);
    expect(mocks.projectState.projects["project-a"].dependencies).toEqual(
      project.dependencies
    );

    mocks.projectState.projects["project-a"] = structuredClone(
      mocks.projectState.projects["project-a"]
    );
    mocks.agentState.agentProjects["project-a"] = structuredClone(
      mocks.agentState.agentProjects["project-a"]
    );
    await redoAgentEdit("project-a");
    expect(
      mocks.projectState.projects["project-a"].files.map(({ id }) => id)
    ).toEqual(["operation-created", "docs", "json", "operation-a"]);
  });

  it("requires the exact pending proposal identity", async () => {
    const proposal = setup();
    mocks.agentState.pendingProposals["thread-a"] = { ...proposal };

    await expect(applyAgentProposal(proposal)).rejects.toThrow(
      "no longer pending"
    );
    expect(mocks.commitAgentEdit).not.toHaveBeenCalled();
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
        proposedFile: operationFile(`state-${sequence}`),
        proposedState: getAgentHistoryState({
          ...project,
          files: project.files.map((file) =>
            file.id === "operation-a"
              ? operationFile(`state-${sequence}`)
              : file
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
      proposedState: getAgentHistoryState({
        ...project,
        files: project.files.map((file) =>
          file.id === "operation-a" ? operationFile("thread-b") : file
        ),
      }),
      diagnostics: [],
    } as AgentProposal;
    mocks.agentState.pendingProposals["thread-b"] = proposal;

    await applyAgentProposal(proposal);

    expect(
      mocks.agentState.agentProjects["project-a"].history?.entries.map(
        ({ threadId }) => threadId
      )
    ).toEqual(["thread-a", "thread-b"]);
  });

  it("does not persist when target packages fail to load", async () => {
    const proposal = setup();
    proposal.proposedState!.npmDependencies = [
      { name: "rowguard", version: "1", exports: [] },
    ];
    mocks.failPackageLoad = true;

    await expect(applyAgentProposal(proposal)).rejects.toThrow(
      "package load failed"
    );
    expect(mocks.commitAgentEdit).not.toHaveBeenCalled();
    expect(mocks.agentState.pendingProposals["thread-a"]).toBe(proposal);
  });

  it("rolls the live package registry back when persistence fails", async () => {
    const proposal = setup();
    proposal.proposedState!.npmDependencies = [
      { name: "rowguard", version: "1", exports: [] },
    ];
    mocks.livePackages = ["faker"];
    mocks.commitAgentEdit.mockRejectedValueOnce(new Error("storage failed"));

    await expect(applyAgentProposal(proposal)).rejects.toThrow(
      "storage failed"
    );

    expect(mocks.livePackages).toEqual(["faker"]);
    expect(
      mocks.projectState.projects["project-a"].dependencies?.npm?.[0].name
    ).toBe("pkg");
  });

  it("keeps undo and redo cursors unchanged when package sync fails", async () => {
    await applyAgentProposal(setup());
    mocks.failPackageLoad = true;

    await expect(undoAgentEdit("project-a")).rejects.toThrow(
      "package load failed"
    );
    expect(mocks.agentState.agentProjects["project-a"].history?.cursor).toBe(1);

    mocks.failPackageLoad = false;
    await undoAgentEdit("project-a");
    mocks.failPackageLoad = true;
    await expect(redoAgentEdit("project-a")).rejects.toThrow(
      "package load failed"
    );
    expect(mocks.agentState.agentProjects["project-a"].history?.cursor).toBe(0);
  });

  it("clears changed, created, and deleted histories but preserves unaffected ones", async () => {
    const proposal = setup();
    const project = mocks.projectState.projects["project-a"];
    project.files.push(
      operationFile("delete", "operation-delete"),
      operationFile("keep", "operation-keep")
    );
    proposal.baseFingerprint = getAgentEditableFingerprint(project);
    proposal.proposedState = {
      operationFiles: [
        { index: 1, file: operationFile("changed") },
        { index: 2, file: operationFile("created", "operation-create") },
        { index: 3, file: operationFile("keep", "operation-keep") },
      ],
      npmDependencies: structuredClone(project.dependencies!.npm!),
    };
    for (const id of [
      "operation-a",
      "operation-delete",
      "operation-create",
      "operation-keep",
    ]) {
      fileHistoryActions.pushState(id, {} as never);
    }

    await applyAgentProposal(proposal);

    expect(new Set(mocks.clearHistory.mock.calls.flat())).toEqual(
      new Set(["operation-a", "operation-delete", "operation-create"])
    );
    expect(fileHistoryActions.canUndo("operation-keep")).toBe(true);
  });

  it("selects the next file after deletion and reconciles the URL", async () => {
    const proposal = setup();
    const project = mocks.projectState.projects["project-a"];
    project.files.push(operationFile("next", "operation-next", "next"));
    proposal.baseFingerprint = getAgentEditableFingerprint(project);
    proposal.proposedState = {
      operationFiles: [
        { index: 1, file: operationFile("next", "operation-next", "next") },
      ],
      npmDependencies: structuredClone(project.dependencies!.npm!),
    };
    mocks.projectState.currentFileId = "operation-a";
    history.replaceState(
      {},
      "",
      "/project/project-a?file=operationA&tab=agent&keep=1"
    );

    await applyAgentProposal(proposal);

    expect(mocks.projectState.currentFileId).toBe("operation-next");
    expect(new URL(location.href).searchParams.get("file")).toBe("next");
    expect(new URL(location.href).searchParams.get("tab")).toBe("agent");
    expect(new URL(location.href).searchParams.get("keep")).toBe("1");

    await undoAgentEdit("project-a");
    expect(mocks.projectState.currentFileId).toBe("operation-a");
    expect(new URL(location.href).searchParams.get("file")).toBe("operationA");
    await redoAgentEdit("project-a");
    expect(mocks.projectState.currentFileId).toBe("operation-next");
  });
});
