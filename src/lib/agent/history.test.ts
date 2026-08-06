import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProposal } from "./proposal";
import { getAgentEditableFingerprint } from "./proposal";
import type { Project } from "../types";

const mocks = vi.hoisted(() => {
  const projectState = {
    projects: {} as Record<string, Project>,
    currentProjectId: "project-a" as string | undefined,
    currentFileId: "operation-a" as string | undefined,
  };
  const agentState = {
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
    resetWorker: vi.fn(),
    removeAll: vi.fn(),
    setNavigation: vi.fn(),
    setState,
  };
});

vi.mock("../idb", () => ({ commitAgentEdit: mocks.commitAgentEdit }));
vi.mock("../store", () => ({
  fileHistoryActions: { clearHistory: mocks.clearHistory },
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

import {
  applyAgentProposal,
  canRedoAgentEdit,
  canUndoAgentEdit,
  redoAgentEdit,
  undoAgentEdit,
} from "./history";

function operationFile(statementId: string) {
  return {
    id: "operation-a",
    name: "operationA",
    type: "operation" as const,
    createdAt: 1,
    content: {
      type: {
        kind: "operation" as const,
        parameters: [],
        result: { kind: "undefined" as const },
      },
      value: {
        name: "operationA",
        parameters: [],
        statements: [{ id: statementId }],
        isAsync: false,
      },
    },
  } as unknown as Project["files"][number];
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
});

describe("agent edit history", () => {
  it("atomically applies a proposal and records durable history", async () => {
    const proposal = setup();

    const entry = await applyAgentProposal(proposal);

    expect(mocks.commitAgentEdit).toHaveBeenCalledOnce();
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
      diagnostics: [],
    } as AgentProposal;
    mocks.agentState.pendingProposals["thread-a"] = proposal;

    const entry = await applyAgentProposal(proposal);

    expect(entry.sequence).toBe(2);
    expect(
      mocks.agentState.agentProjects["project-a"].history?.entries
    ).toEqual([entry]);
  });
});
