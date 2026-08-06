import { nanoid } from "nanoid";
import isEqual from "react-fast-compare";
import { commitAgentEdit } from "../idb";
import type { Project, ProjectFile } from "../types";
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
  const operations = new Map(
    snapshot.operationFiles.map(({ file }) => [file.id, file])
  );
  return {
    ...project,
    files: project.files.map((file) =>
      file.type === "operation"
        ? structuredClone(operations.get(file.id) ?? file)
        : file
    ),
    dependencies: {
      ...project.dependencies,
      npm: structuredClone(snapshot.npmDependencies),
    },
    updatedAt: Date.now(),
  };
}

function reconcileProject(previousProject: Project, project: Project) {
  const projectStore = useProjectStore.getState();
  for (const file of project.files) {
    if (
      file.type === "operation" &&
      !isEqual(
        previousProject.files.find((previous) => previous.id === file.id),
        file
      )
    ) {
      fileHistoryActions.clearHistory(file.id);
    }
  }
  useProjectStore.setState((state) => ({
    projects: { ...state.projects, [project.id]: project },
    currentFileId:
      state.currentProjectId !== project.id
        ? state.currentFileId
        : project.files.some((file) => file.id === state.currentFileId)
          ? state.currentFileId
          : undefined,
  }));
  if (projectStore.currentProjectId === project.id) {
    useNavigationStore.getState().setNavigation({
      navigation: undefined,
      navigationEntities: undefined,
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
    threads: agentProject.threads.map((thread) => ({
      ...thread,
      messages: thread.messages.map((message) =>
        message.proposal?.id === proposal.id
          ? {
              ...message,
              proposal: { ...message.proposal, applicationId },
            }
          : message
      ),
    })),
  };
}

async function commit(
  project: Project,
  agentProject: AgentProject,
  proposal?: AgentProposal
) {
  const currentProjects = useProjectStore.getState().projects;
  const currentAgentProjects = useAgentStore.getState().agentProjects;
  const previousProject = currentProjects[project.id];
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
  reconcileProject(previousProject, project);
  useAgentStore.setState((state) => {
    const nextAgentProjects = {
      ...state.agentProjects,
      [project.id]: agentProject,
    };
    const threadId = proposal?.threadId;
    if (!threadId || state.pendingProposals[threadId]?.id !== proposal.id) {
      return { agentProjects: nextAgentProjects };
    }
    const { [threadId]: _, ...pendingProposals } = state.pendingProposals;
    return { agentProjects: nextAgentProjects, pendingProposals };
  });
}

async function applyProposal(proposal: AgentProposal) {
  const projectState = useProjectStore.getState();
  const project = projectState.projects[proposal.projectId];
  const agentProject =
    useAgentStore.getState().agentProjects[proposal.projectId];
  if (
    !project ||
    !agentProject ||
    !proposal.threadId ||
    projectState.currentProjectId !== proposal.projectId ||
    projectState.currentFileId !== proposal.fileId
  ) {
    throw new Error("This proposal no longer belongs to the current project");
  }
  if (!agentProject.threads.some((thread) => thread.id === proposal.threadId)) {
    throw new Error("This proposal's chat no longer exists");
  }
  if (
    !proposal.proposedFile ||
    proposal.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    throw new Error("This proposal has validation errors");
  }
  if (isAgentProposalStale(proposal, project)) {
    throw new Error("This proposal is stale because the project changed");
  }
  const currentFile = project.files.find(
    (file) => file.id === proposal.fileId && file.type === "operation"
  );
  if (
    !currentFile ||
    proposal.proposedFile.id !== currentFile.id ||
    proposal.proposedFile.name !== currentFile.name
  ) {
    throw new Error("The selected operation no longer matches this proposal");
  }

  const before = getAgentHistoryState(project);
  const updatedAt = Date.now();
  const proposedFile: Extract<ProjectFile, { type: "operation" }> = {
    ...structuredClone(proposal.proposedFile),
    updatedAt,
  };
  const nextProject = {
    ...project,
    files: project.files.map((file) =>
      file.id === currentFile.id ? proposedFile : file
    ),
    updatedAt,
  };
  const currentHistory = getHistory(agentProject);
  const entry: AgentEditHistoryEntry = {
    id: nanoid(),
    projectId: project.id,
    threadId: proposal.threadId,
    sequence: currentHistory.lastSequence + 1,
    createdAt: updatedAt,
    before,
    after: getAgentHistoryState(nextProject),
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
  await commit(nextProject, nextAgentProject);
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
