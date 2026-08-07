import { nanoid } from "nanoid";
import isEqual from "react-fast-compare";
import { commitAgentEdit } from "../idb";
import type { Project } from "../types";
import { withSyncedPackageRegistry } from "../operations/built-in";
import { getEnabledPackages } from "../packages/catalog";
import {
  fileHistoryActions,
  useAgentStore,
  useNavigationStore,
  useProjectStore,
} from "../store";
import { useExecutionResultsStore } from "../execution/store";
import { executionWorkerClient } from "../execution/worker-client";
import {
  getAgentHistoryState,
  isAgentProposalStale,
  type AgentHistoryState,
  type AgentProposal,
} from "./proposal";
import type {
  AgentEditHistoryEntry,
  AgentProject,
  ProjectAgentHistory,
} from "./types";

const MAX_AGENT_HISTORY = 50;
let agentEditPending = false;

async function runAgentEdit<T>(action: () => Promise<T>) {
  if (agentEditPending)
    throw new Error("Another agent edit is already in progress");
  agentEditPending = true;
  try {
    return await action();
  } finally {
    agentEditPending = false;
  }
}

function restoreAgentHistoryState(
  project: Project,
  snapshot: AgentHistoryState
) {
  const files: Project["files"] = project.files
    .filter((file) => file.type !== "operation")
    .map((file) => structuredClone(file));
  for (const { index, file } of [...snapshot.operationFiles].sort(
    (a, b) => a.index - b.index
  )) {
    files.splice(Math.min(index, files.length), 0, structuredClone(file));
  }
  return {
    ...project,
    files,
    dependencies: {
      ...structuredClone(project.dependencies),
      npm: structuredClone(snapshot.npmDependencies),
    },
    updatedAt: Date.now(),
  };
}

function getReconciledFileId(
  previousProject: Project,
  project: Project,
  selectedFileId?: string
) {
  if (!selectedFileId) return undefined;
  if (project.files.some((file) => file.id === selectedFileId)) {
    return selectedFileId;
  }
  const previousIndex = previousProject.files.findIndex(
    (file) => file.id === selectedFileId
  );
  if (previousIndex < 0) return undefined;
  return project.files[previousIndex]?.id ?? project.files.at(-1)?.id;
}

function updateFileSearchParam(fileName?: string) {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const url = new URL(location.href);
  if (fileName) url.searchParams.set("file", fileName);
  else url.searchParams.delete("file");
  history.replaceState(history.state, "", url);
}

function installProject(
  previousProject: Project,
  project: Project,
  selectedFileId?: string
) {
  const active = useProjectStore.getState().currentProjectId === project.id;
  useProjectStore.setState((state) => ({
    projects: { ...state.projects, [project.id]: project },
    currentFileId: active ? selectedFileId : state.currentFileId,
  }));
  if (active) {
    updateFileSearchParam(
      project.files.find((file) => file.id === selectedFileId)?.name
    );
  }
}

function reconcileProject(previousProject: Project, project: Project) {
  const previousOperations = new Map(
    previousProject.files
      .filter((file) => file.type === "operation")
      .map((file) => [file.id, file])
  );
  const operations = new Map(
    project.files
      .filter((file) => file.type === "operation")
      .map((file) => [file.id, file])
  );
  for (const id of new Set([
    ...previousOperations.keys(),
    ...operations.keys(),
  ])) {
    if (!isEqual(previousOperations.get(id), operations.get(id))) {
      fileHistoryActions.clearHistory(id);
    }
  }
  if (useProjectStore.getState().currentProjectId === project.id) {
    useNavigationStore.getState().setNavigation({
      navigation: undefined,
      navigationEntities: undefined,
      skipExecution: undefined,
      type: undefined,
      result: undefined,
      operation: undefined,
    });
    executionWorkerClient.reset();
    useExecutionResultsStore.getState().removeAll();
  }
}

function getHistory(agentProject: AgentProject): ProjectAgentHistory {
  return agentProject.history ?? { entries: [], cursor: 0, lastSequence: 0 };
}

function updateProposalApplication(
  agentProject: AgentProject,
  proposal: AgentProposal,
  applicationId: string,
  history: ProjectAgentHistory
) {
  return {
    ...agentProject,
    history,
    threads: agentProject.threads.map((thread) =>
      thread.id !== proposal.threadId
        ? thread
        : {
            ...thread,
            messages: thread.messages.map((message) =>
              message.proposal?.id === proposal.id
                ? {
                    ...message,
                    proposal: { ...message.proposal, applicationId },
                  }
                : message
            ),
          }
    ),
  };
}

async function commit(
  project: Project,
  agentProject: AgentProject,
  previousProject: Project,
  previousAgentProject: AgentProject,
  selectedFileId?: string,
  proposal?: AgentProposal
) {
  await withSyncedPackageRegistry(getEnabledPackages(project), async () => {
    const currentProjectState = useProjectStore.getState();
    const currentAgentState = useAgentStore.getState();
    if (
      currentProjectState.projects[project.id] !== previousProject ||
      currentAgentState.agentProjects[project.id] !== previousAgentProject
    ) {
      throw new Error(
        "The project or chat changed while packages were loading"
      );
    }
    const currentProjects = currentProjectState.projects;
    const currentAgentProjects = currentAgentState.agentProjects;
    await commitAgentEdit(
      { ...currentProjects, [project.id]: project },
      { ...currentAgentProjects, [project.id]: agentProject }
    );
    const latestProjectState = useProjectStore.getState();
    const latestAgentState = useAgentStore.getState();
    if (
      latestProjectState.projects !== currentProjects ||
      latestAgentState.agentProjects !== currentAgentProjects
    ) {
      await commitAgentEdit(
        latestProjectState.projects,
        latestAgentState.agentProjects
      );
      throw new Error(
        "The project or chat changed while the edit was being saved"
      );
    }
    installProject(previousProject, project, selectedFileId);
    useAgentStore.setState((state) => {
      const nextAgentProjects = {
        ...state.agentProjects,
        [project.id]: agentProject,
      };
      const threadId = proposal?.threadId;
      if (!threadId || state.pendingProposals[threadId] !== proposal) {
        return { agentProjects: nextAgentProjects };
      }
      const { [threadId]: _, ...pendingProposals } = state.pendingProposals;
      return { agentProjects: nextAgentProjects, pendingProposals };
    });
    reconcileProject(previousProject, project);
  });
}

async function applyProposal(proposal: AgentProposal) {
  const projectState = useProjectStore.getState();
  const project = projectState.projects[proposal.projectId];
  const agentState = useAgentStore.getState();
  const agentProject = agentState.agentProjects[proposal.projectId];
  if (
    !project ||
    !agentProject ||
    !proposal.threadId ||
    projectState.currentProjectId !== proposal.projectId ||
    agentProject.activeThreadId !== proposal.threadId
  ) {
    throw new Error("This proposal no longer belongs to the current project");
  }
  if (agentState.pendingProposals[proposal.threadId] !== proposal) {
    throw new Error("This proposal is no longer pending");
  }
  if (!agentProject.threads.some((thread) => thread.id === proposal.threadId)) {
    throw new Error("This proposal's chat no longer exists");
  }
  if (
    !proposal.proposedState ||
    proposal.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    throw new Error("This proposal has validation errors");
  }
  if (isAgentProposalStale(proposal, project)) {
    throw new Error("This proposal is stale because the project changed");
  }
  const before = getAgentHistoryState(project);
  const updatedAt = Date.now();
  const nextProject = restoreAgentHistoryState(project, proposal.proposedState);
  nextProject.updatedAt = updatedAt;
  const beforeSelectedFileId = projectState.currentFileId;
  const afterSelectedFileId = getReconciledFileId(
    project,
    nextProject,
    beforeSelectedFileId
  );
  const currentHistory = getHistory(agentProject);
  const entry: AgentEditHistoryEntry = {
    id: nanoid(),
    projectId: project.id,
    threadId: proposal.threadId,
    sequence: currentHistory.lastSequence + 1,
    createdAt: updatedAt,
    before,
    after: getAgentHistoryState(nextProject),
    beforeSelectedFileId,
    afterSelectedFileId,
  };
  const retainedEntries = currentHistory.entries.slice(
    0,
    currentHistory.cursor
  );
  const previousEntry = retainedEntries.at(-1);
  const connected = !previousEntry || isEqual(before, previousEntry.after);
  const entries = [...(connected ? retainedEntries : []), entry].slice(
    -MAX_AGENT_HISTORY
  );
  const history = {
    entries,
    cursor: entries.length,
    lastSequence: entry.sequence,
  };
  await commit(
    nextProject,
    updateProposalApplication(agentProject, proposal, entry.id, history),
    project,
    agentProject,
    afterSelectedFileId,
    proposal
  );
  return entry;
}

export function applyAgentProposal(proposal: AgentProposal) {
  return runAgentEdit(() => applyProposal(proposal));
}

async function restoreAgentEdit(projectId: string, direction: "undo" | "redo") {
  const project = useProjectStore.getState().projects[projectId];
  const agentProject = useAgentStore.getState().agentProjects[projectId];
  if (!project || !agentProject)
    throw new Error("Project history is unavailable");
  const history = getHistory(agentProject);
  const entry =
    direction === "undo"
      ? history.entries[history.cursor - 1]
      : history.entries[history.cursor];
  if (!entry) throw new Error(`There is no agent edit to ${direction}`);
  const expected = direction === "undo" ? entry.after : entry.before;
  if (!isEqual(getAgentHistoryState(project), expected)) {
    throw new Error(
      `Cannot ${direction} because the project changed after this agent edit`
    );
  }
  const snapshot = direction === "undo" ? entry.before : entry.after;
  const nextProject = restoreAgentHistoryState(project, snapshot);
  const nextAgentProject = {
    ...agentProject,
    history: {
      ...history,
      cursor: history.cursor + (direction === "undo" ? -1 : 1),
    },
  };
  const recordedSelection =
    direction === "undo"
      ? entry.beforeSelectedFileId
      : entry.afterSelectedFileId;
  const selectedFileId =
    recordedSelection &&
    nextProject.files.some((file) => file.id === recordedSelection)
      ? recordedSelection
      : getReconciledFileId(
          project,
          nextProject,
          useProjectStore.getState().currentFileId
        );
  await commit(
    nextProject,
    nextAgentProject,
    project,
    agentProject,
    selectedFileId
  );
  return entry;
}

export function undoAgentEdit(projectId: string) {
  return runAgentEdit(() => restoreAgentEdit(projectId, "undo"));
}

export function redoAgentEdit(projectId: string) {
  return runAgentEdit(() => restoreAgentEdit(projectId, "redo"));
}

export function canUndoAgentEdit(agentProject?: AgentProject) {
  return !!agentProject?.history?.cursor;
}

export function canRedoAgentEdit(agentProject?: AgentProject) {
  const history = agentProject?.history;
  return !!history && history.cursor < history.entries.length;
}
