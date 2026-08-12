import { StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import {
  IData,
  INavigation,
  Project,
  ProjectFile,
  NavigationEntity,
  DataType,
  IStatement,
  OperationType,
  ProjectCheckpoint,
  ContextMenuItem,
} from "./types";
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { nanoid } from "nanoid";
import { SetStateAction } from "react";
import { Context } from "./execution/types";
import { produce } from "immer";
import { EntityPath } from "./types";
import {
  createProjectCheckpoint,
  restoreProjectFromCheckpoint,
} from "./checkpoints";
import { createIDbStorage } from "./idb";
import {
  AgentMessage,
  AgentProject,
  AgentRunTrace,
  AgentThread,
} from "./agent/types";
import type { AgentProposal } from "./agent/proposal";

/* Files store */

interface FileHistoryItem {
  content: ProjectFile["content"];
  focusId?: string;
}
const fileHistories = new Map<
  string,
  { past: FileHistoryItem[]; future: FileHistoryItem[] }
>();
const MAX_HISTORY = 50;

export const fileHistoryActions = {
  pushState: (fileId: string, content: ProjectFile["content"]) => {
    if (!fileHistories.has(fileId)) {
      fileHistories.set(fileId, { past: [], future: [] });
    }
    const history = fileHistories.get(fileId)!;
    const focusId = useNavigationStore.getState().navigation?.id;
    history.past.push({ content: structuredClone(content), focusId });
    if (history.past.length > MAX_HISTORY) history.past.shift();
    history.future = [];
  },
  canUndo: (fileId?: string): boolean => {
    if (!fileId) return false;
    return (fileHistories.get(fileId)?.past.length ?? 0) > 0;
  },
  canRedo: (fileId?: string): boolean => {
    if (!fileId) return false;
    return (fileHistories.get(fileId)?.future.length ?? 0) > 0;
  },
  clearHistory: (fileId: string) => {
    fileHistories.delete(fileId);
  },
  clearAllHistories: () => {
    fileHistories.clear();
  },
};

interface IProjectsStore {
  projects: Record<string, Project>;
  createProject: (
    init: Partial<Omit<Project, "id" | "createdAt" | "updatedAt">>
  ) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;
  getCurrentProject: () => Project | undefined;
}

interface ICurrentProjectStore {
  currentProjectId?: string;
  currentFileId?: string;
  setCurrentProjectId: (projectId?: string) => void;
  setCurrentFileId: (fileName?: string) => void;
  getCurrentFile: () => ProjectFile | undefined;
  addFile: (file: ProjectFile) => ProjectFile | undefined;
  updateFile: (fileId: string, updates: Partial<ProjectFile>) => void;
  deleteFile: (fileId: string) => void;
  getFile: (fileId?: string | null) => ProjectFile | undefined;
  undo: () => void;
  redo: () => void;
  updateStatementByPath: (
    fileId: string,
    path: EntityPath,
    newStatement: IStatement
  ) => void;
  restoreProjectFromCheckpoint: (checkpoint: ProjectCheckpoint) => void;
}

type ProjectStore = IProjectsStore & ICurrentProjectStore;

const createProjectsSlice: StateCreator<
  ProjectStore,
  [],
  [],
  IProjectsStore
> = (set, get) => ({
  projects: {},
  createProject: (initialProject) => {
    const createdAt = Date.now();
    const newProject: Project = {
      id: nanoid(),
      name: "New Project",
      version: "0.0.1",
      createdAt,
      files: [],
      deployment: { envVariables: [], platforms: [] },
      ...initialProject,
    };
    set((state) => ({
      projects: { ...state.projects, [newProject.id]: newProject },
    }));
    return newProject;
  },
  updateProject: (id, updates) => {
    set((state) => ({
      projects: {
        ...state.projects,
        [id]: { ...state.projects[id], ...updates, updatedAt: Date.now() },
      },
    }));
  },
  deleteProject: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.projects;
      return { projects: rest };
    });
    useCheckpointStore.getState().deleteProjectCheckpoints(id);
    useAgentStore.getState().deleteAgentProject(id);
  },
  getProject: (id) => get().projects[id],
  getCurrentProject: () => {
    const { currentProjectId, projects } = get();
    return currentProjectId ? projects[currentProjectId] : undefined;
  },
});

const createCurrentProjectSlice: StateCreator<
  ProjectStore,
  [],
  [],
  ICurrentProjectStore
> = (set, get) => ({
  setCurrentProjectId: (projectId) => {
    if (projectId === get().currentProjectId) return;
    fileHistoryActions.clearAllHistories();
    set({ currentProjectId: projectId, currentFileId: undefined });
  },
  setCurrentFileId: (fileName) => {
    if (fileName === get().currentFileId) return;
    const currentProject = get().getCurrentProject();
    const file = currentProject?.files.find((f) => f.name === fileName);
    if (file) set({ currentFileId: file.id });
  },
  addFile: (file: ProjectFile) => {
    const currentProject = get().getCurrentProject();
    if (!currentProject) return;
    const updatedProject = {
      ...currentProject,
      files: [...currentProject.files, file],
      updatedAt: Date.now(),
    };
    set((state) => ({
      projects: { ...state.projects, [currentProject.id]: updatedProject },
    }));
    return file;
  },
  updateFile: (fileId, updates) => {
    const currentProject = get().getCurrentProject();
    if (!currentProject) return;
    const updatedAt = Date.now();
    const updatedProject = {
      ...currentProject,
      files: currentProject.files.map((file) => {
        if (file.id !== fileId) return file;
        return { ...file, ...updates, updatedAt } as ProjectFile;
      }),
      updatedAt,
    };
    set((state) => ({
      projects: { ...state.projects, [currentProject.id]: updatedProject },
    }));
  },
  deleteFile: (fileId) => {
    const currentProject = get().getCurrentProject();
    if (!currentProject) return;
    fileHistoryActions.clearHistory(fileId);
    const updatedProject = {
      ...currentProject,
      files: currentProject.files.filter((file) => file.id !== fileId),
      updatedAt: Date.now(),
    };
    set((state) => ({
      projects: { ...state.projects, [currentProject.id]: updatedProject },
      currentFileId:
        state.currentFileId === fileId ? undefined : state.currentFileId,
    }));
  },
  getFile: (fileId) => {
    const currentProject = get().getCurrentProject();
    return currentProject?.files.find((file) => file.id === fileId);
  },
  getCurrentFile: () => {
    const { currentFileId } = get();
    return currentFileId ? get().getFile(currentFileId) : undefined;
  },

  undo: () => {
    const { getCurrentFile, updateFile } = get();
    const currentFile = getCurrentFile();
    if (!currentFile) return;
    const history = fileHistories.get(currentFile.id);
    if (!history || history.past.length === 0) return;
    const focusId = useNavigationStore.getState().navigation?.id;
    history.future.push({
      content: structuredClone(currentFile.content),
      focusId,
    });
    const lastItem = history.past.pop()!;
    updateFile(currentFile.id, {
      content: lastItem.content,
    } as Partial<ProjectFile>);
    useNavigationStore
      .getState()
      .setNavigation({ navigation: { id: lastItem.focusId } });
  },

  redo: () => {
    const { getCurrentFile, updateFile } = get();
    const currentFile = getCurrentFile();
    if (!currentFile) return;
    const history = fileHistories.get(currentFile.id);
    if (!history || history.future.length === 0) return;
    const currentFocusId = useNavigationStore.getState().navigation?.id;
    history.past.push({
      content: structuredClone(currentFile.content),
      focusId: currentFocusId,
    });
    const nextItem = history.future.pop()!;
    updateFile(currentFile.id, {
      content: nextItem.content,
    } as Partial<ProjectFile>);
    useNavigationStore
      .getState()
      .setNavigation({ navigation: { id: nextItem.focusId } });
  },

  updateStatementByPath: (fileId, path, newStatement) => {
    const currentProject = get().getCurrentProject();
    if (!currentProject || path.length < 1) return;

    const file = currentProject.files.find((f: ProjectFile) => f.id === fileId);
    if (!file || file.type !== "operation") return;

    fileHistoryActions.pushState(fileId, file.content);

    set(
      produce((state: ProjectStore) => {
        const project = state.projects[currentProject.id];
        const fileIndex = project.files.findIndex(
          (f: ProjectFile) => f.id === fileId
        );
        if (fileIndex === -1) return;

        const file = project.files[fileIndex];
        if (file.type !== "operation") return;

        let current: unknown = file.content.value;
        for (let i = 0; i < path.length - 1; i++) {
          current = (current as Record<string, unknown>)[path[i]];
        }
        (current as Record<string, unknown>)[path[path.length - 1]] =
          newStatement;
        const updatedAt = Date.now();
        (file as ProjectFile & { type: "operation" }).updatedAt = updatedAt;
        project.updatedAt = updatedAt;
      })
    );
  },

  restoreProjectFromCheckpoint: (checkpoint) => {
    const project = get().projects[checkpoint.projectId];
    if (!project) return;
    fileHistoryActions.clearAllHistories();
    const restored = restoreProjectFromCheckpoint(project, checkpoint);
    const currentFile = get().currentFileId
      ? restored.files.find((f) => f.id === get().currentFileId)
      : undefined;
    set((state) => ({
      projects: { ...state.projects, [restored.id]: restored },
      currentFileId: currentFile?.id,
    }));
  },
});

export const useProjectStore = createWithEqualityFn(
  persist<ProjectStore>(
    (...a) => ({
      ...createProjectsSlice(...a),
      ...createCurrentProjectSlice(...a),
    }),
    {
      name: "projects",
      storage: createIDbStorage("projects"),
      partialize: (state) => ({ projects: state.projects }) as ProjectStore,
    }
  ),
  shallow
);

export const waitForHydration = () => {
  return new Promise<void>((resolve) => {
    if (useProjectStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsubscribe = useProjectStore.persist.onFinishHydration(() => {
      resolve();
      unsubscribe();
    });
  });
};

/* UI-related store */

type UiConfigStore = {
  sidebar: {
    width?: number;
    height?: number;
    lockedIds?: { [operationId: string]: string };
  };
  disableKeyboard?: boolean;
  enableMobileWrapping?: boolean;
  hideArgumentNames?: boolean;
  wrapResult?: boolean;
  examplesCollapsed?: boolean;
  foldedEntities?: Record<string, boolean>;
  setUiConfig: (
    change: SetStateAction<Partial<Omit<UiConfigStore, "setUiConfig">>>
  ) => void;
};
export const useUiConfigStore = createWithEqualityFn(
  persist<UiConfigStore>(
    (set) => ({
      sidebar: {
        width: 200,
        height: 150,
        lockedIds: {},
      },
      setUiConfig: (change) =>
        set((state) => (typeof change === "function" ? change(state) : change)),
    }),
    { name: "uiConfig", storage: createIDbStorage("uiConfig") }
  ),
  shallow
);

function replaceTabSearchParam(tab?: string) {
  const url = new URL(location.href);
  if (tab) url.searchParams.set("tab", tab);
  else url.searchParams.delete("tab");
  history.replaceState(history.state, "", url);
}

export const useSidebarTabStore = createWithEqualityFn<{
  activeTab?: string;
  setActiveTab: (change: SetStateAction<string | undefined>) => void;
}>(
  (set) => ({
    activeTab: "operations",
    setActiveTab: (val) =>
      set(({ activeTab }) => {
        const newActive = typeof val === "function" ? val(activeTab) : val;
        replaceTabSearchParam(newActive);
        return { activeTab: newActive };
      }),
  }),
  shallow
);

type NavigationStore = {
  navigation?: INavigation;
  navigationEntities?: NavigationEntity[];
  skipExecution?: Context["skipExecution"];
  type?: DataType;
  result?: IData;
  operation?: IData<OperationType>;
  setNavigation: (
    change: SetStateAction<Partial<Omit<NavigationStore, "setNavigation">>>
  ) => void;
};
export const useNavigationStore = createWithEqualityFn<NavigationStore>(
  (set) => ({
    setNavigation: (change) =>
      set((state) => (typeof change === "function" ? change(state) : change)),
  }),
  shallow
);

/* Agent store */

interface ApiKeys {
  openai?: string;
  anthropic?: string;
}

interface AgentStore {
  apiKeys: ApiKeys;
  selectedModel?: string;
  thinkingLevel: import("./agent/types").AgentThinkingLevel;
  agentProjects: Record<string, AgentProject>;
  agentReady: boolean;
  activeRun?: {
    threadId: string;
    streamingContent: string;
    traces: AgentRunTrace[];
  };
  pendingProposals: Record<string, AgentProposal>;

  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  getApiKey: (provider: keyof ApiKeys) => string | undefined;
  setSelectedModel: (model: string) => void;
  setThinkingLevel: (level: import("./agent/types").AgentThinkingLevel) => void;
  createThread: (projectId: string, title?: string) => AgentThread;
  renameThread: (threadId: string, title: string) => void;
  selectThread: (projectId: string, threadId: string) => void;
  removeThread: (threadId: string) => void;
  deleteThreadTurn: (threadId: string, messageId: string) => void;
  addMessage: (
    threadId: string,
    message: Omit<AgentMessage, "id" | "createdAt">
  ) => AgentMessage | undefined;
  setDraft: (threadId: string, content: string) => void;
  startRun: (threadId: string) => void;
  setRunTrace: (label: string) => void;
  setStreamingContent: (content: string) => void;
  finishRun: (threadId: string) => void;
  setPendingProposal: (threadId: string, proposal?: AgentProposal) => void;
  deleteAgentProject: (projectId: string) => void;
}

export const useAgentPersistenceErrorStore = createWithEqualityFn<{
  error?: string;
}>(() => ({}), shallow);

function createAgentThread(title = "New chat"): AgentThread {
  const now = Date.now();
  return {
    id: nanoid(),
    title,
    createdAt: now,
    updatedAt: now,
    draft: "",
    messages: [],
  };
}

function redactAgentSecrets<T>(value: T, apiKeys: ApiKeys): T {
  const keys = Object.values(apiKeys).filter(Boolean) as string[];
  if (keys.length === 0) return value;
  const redact = (item: unknown): unknown => {
    if (typeof item === "string") {
      return keys.reduce(
        (content, key) => content.replaceAll(key, "[REDACTED]"),
        item
      );
    }
    if (Array.isArray(item)) return item.map(redact);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [key, redact(child)])
      );
    }
    return item;
  };
  return redact(value) as T;
}

export const useAgentStore = createWithEqualityFn(
  persist<AgentStore>(
    (set, get) => {
      const saveProject = (project: AgentProject) =>
        set((state) => ({
          agentProjects: {
            ...state.agentProjects,
            [project.projectId]: project,
          },
        }));
      const findProjectByThread = (threadId: string) =>
        Object.values(get().agentProjects).find((project) =>
          project.threads.some((thread) => thread.id === threadId)
        );

      return {
        apiKeys: {},
        selectedModel: "gpt-5.6-sol",
        thinkingLevel: "medium",
        agentProjects: {},
        agentReady: false,
        pendingProposals: {},
        setApiKey: (provider, key) => {
          set((state) => ({ apiKeys: { ...state.apiKeys, [provider]: key } }));
        },
        getApiKey: (provider) => get().apiKeys[provider],
        setSelectedModel: (model) => set({ selectedModel: model }),
        setThinkingLevel: (thinkingLevel) => set({ thinkingLevel }),
        createThread: (projectId, title) => {
          const thread = createAgentThread(title);
          const current = get().agentProjects[projectId];
          saveProject({
            projectId,
            activeThreadId: thread.id,
            threads: [...(current?.threads ?? []), thread],
            history: current?.history,
          });
          return thread;
        },
        renameThread: (threadId, title) => {
          const trimmedTitle = title.trim();
          const project = findProjectByThread(threadId);
          if (!project || !trimmedTitle) return;
          saveProject({
            ...project,
            threads: project.threads.map((thread) =>
              thread.id === threadId
                ? { ...thread, title: trimmedTitle, updatedAt: Date.now() }
                : thread
            ),
          });
        },
        selectThread: (projectId, threadId) => {
          const project = get().agentProjects[projectId];
          if (!project?.threads.some((thread) => thread.id === threadId))
            return;
          saveProject({ ...project, activeThreadId: threadId });
        },
        removeThread: (threadId) => {
          const project = findProjectByThread(threadId);
          if (!project) return;
          const remaining = project.threads.filter(
            (thread) => thread.id !== threadId
          );
          if (remaining.length === 0) remaining.push(createAgentThread());
          saveProject({
            ...project,
            activeThreadId: remaining[0].id,
            threads: remaining,
          });
          set((state) => {
            const { [threadId]: _, ...pendingProposals } =
              state.pendingProposals;
            return { pendingProposals };
          });
        },
        deleteThreadTurn: (threadId, messageId) => {
          const project = findProjectByThread(threadId);
          const thread = project?.threads.find(({ id }) => id === threadId);
          if (!project || !thread) return;
          const messageIndex = thread.messages.findIndex(
            ({ id }) => id === messageId
          );
          if (
            messageIndex < 0 ||
            thread.messages[messageIndex]?.role !== "user"
          )
            return;
          const nextUserIndex = thread.messages.findIndex(
            (message, index) => index > messageIndex && message.role === "user"
          );
          const endIndex =
            nextUserIndex < 0 ? thread.messages.length : nextUserIndex;
          const removedMessages = thread.messages.slice(messageIndex, endIndex);
          const nextProject = {
            ...project,
            threads: project.threads.map((currentThread) =>
              currentThread.id !== threadId
                ? currentThread
                : {
                    ...currentThread,
                    messages: [
                      ...currentThread.messages.slice(0, messageIndex),
                      ...currentThread.messages.slice(endIndex),
                    ],
                  }
            ),
          };
          set((state) => {
            const pendingProposal = state.pendingProposals[threadId];
            const removesPendingProposal =
              !!pendingProposal &&
              removedMessages.some(
                (message) => message.proposal?.id === pendingProposal.id
              );
            if (!removesPendingProposal) {
              return {
                agentProjects: {
                  ...state.agentProjects,
                  [project.projectId]: nextProject,
                },
              };
            }
            const { [threadId]: _, ...pendingProposals } =
              state.pendingProposals;
            return {
              agentProjects: {
                ...state.agentProjects,
                [project.projectId]: nextProject,
              },
              pendingProposals,
            };
          });
        },
        addMessage: (threadId, message) => {
          const project = findProjectByThread(threadId);
          if (!project) return;
          const created: AgentMessage = {
            ...redactAgentSecrets(message, get().apiKeys),
            id: nanoid(),
            createdAt: Date.now(),
          };
          saveProject({
            ...project,
            threads: project.threads.map((thread) =>
              thread.id === threadId
                ? { ...thread, messages: [...thread.messages, created] }
                : thread
            ),
          });
          return created;
        },
        setDraft: (threadId, content) => {
          const project = findProjectByThread(threadId);
          if (!project) return;
          const draft = redactAgentSecrets(content, get().apiKeys);
          saveProject({
            ...project,
            threads: project.threads.map((thread) =>
              thread.id === threadId ? { ...thread, draft } : thread
            ),
          });
        },
        startRun: (threadId) =>
          set({
            activeRun: {
              threadId,
              streamingContent: "",
              traces: [
                {
                  id: nanoid(),
                  label: "Preparing request",
                  status: "active",
                },
              ],
            },
          }),
        setRunTrace: (label) =>
          set((state) => {
            if (!state.activeRun) return state;
            const current = state.activeRun.traces.at(-1);
            if (current?.label === label) return state;
            return {
              activeRun: {
                ...state.activeRun,
                traces: [
                  ...state.activeRun.traces.map((trace) => ({
                    ...trace,
                    status: "complete" as const,
                  })),
                  { id: nanoid(), label, status: "active" as const },
                ],
              },
            };
          }),
        setStreamingContent: (content) =>
          set((state) =>
            state.activeRun
              ? { activeRun: { ...state.activeRun, streamingContent: content } }
              : state
          ),
        finishRun: (threadId) =>
          set((state) =>
            state.activeRun?.threadId === threadId
              ? { activeRun: undefined }
              : state
          ),
        setPendingProposal: (threadId, proposal) =>
          set((state) => {
            if (proposal) {
              return {
                pendingProposals: {
                  ...state.pendingProposals,
                  [threadId]: proposal,
                },
              };
            }
            const { [threadId]: _, ...pendingProposals } =
              state.pendingProposals;
            return { pendingProposals };
          }),
        deleteAgentProject: (projectId) => {
          const remove = () =>
            set((state) => {
              const { [projectId]: _, ...agentProjects } = state.agentProjects;
              return {
                agentProjects,
                pendingProposals: Object.fromEntries(
                  Object.entries(state.pendingProposals).filter(
                    ([, proposal]) => proposal.projectId !== projectId
                  )
                ),
              };
            });
          remove();
          if (!useAgentStore.persist.hasHydrated()) {
            const unsubscribe = useAgentStore.persist.onFinishHydration(() => {
              remove();
              unsubscribe();
            });
          }
        },
      };
    },
    {
      name: "agent",
      storage: createIDbStorage("agentProjects", () =>
        useAgentPersistenceErrorStore.setState({
          error:
            "Agent chats could not be saved. Recent changes may be lost on reload.",
        })
      ),
      partialize: (state) =>
        ({
          apiKeys: state.apiKeys,
          selectedModel: state.selectedModel,
          thinkingLevel: state.thinkingLevel,
          agentProjects: state.agentProjects,
        }) as AgentStore,
      onRehydrateStorage: () => () =>
        useAgentStore.setState({ agentReady: true }),
    }
  ),
  shallow
);

/* Checkpoint store */

interface CheckpointStore {
  checkpoints: Record<string, ProjectCheckpoint[]>;
  createCheckpoint: (project: Project, name?: string) => void;
  deleteCheckpoint: (projectId: string, checkpointId: string) => void;
  deleteProjectCheckpoints: (projectId: string) => void;
}

export const useCheckpointStore = createWithEqualityFn(
  persist<CheckpointStore>(
    (set) => ({
      checkpoints: {},
      createCheckpoint: (project, name) => {
        const checkpoint = createProjectCheckpoint(project, name);
        set((state) => {
          const projectCheckpoints = state.checkpoints[project.id] ?? [];
          return {
            checkpoints: {
              ...state.checkpoints,
              [project.id]: [checkpoint, ...projectCheckpoints],
            },
          };
        });
      },
      deleteCheckpoint: (projectId, checkpointId) => {
        set((state) => {
          const checkpoints = state.checkpoints[projectId];
          if (!checkpoints) return state;
          const filtered = checkpoints.filter((c) => c.id !== checkpointId);
          return {
            checkpoints: { ...state.checkpoints, [projectId]: filtered },
          };
        });
      },
      deleteProjectCheckpoints: (projectId) => {
        set((state) => {
          const { [projectId]: _, ...rest } = state.checkpoints;
          return { checkpoints: rest };
        });
      },
    }),
    { name: "checkpoints", storage: createIDbStorage("checkpoints") }
  ),
  shallow
);

type ContextMenuStore = {
  menu?: { items: ContextMenuItem[]; position: { x: number; y: number } };
  highlightedEntityId?: string;
  openMenu: (
    payload: ContextMenuStore["menu"] & { highlightedEntityId?: string }
  ) => void;
  closeMenu: () => void;
};

export const useContextMenuStore = createWithEqualityFn<ContextMenuStore>(
  (set) => ({
    openMenu: (payload) =>
      set({
        menu: { items: payload.items, position: payload.position },
        highlightedEntityId: payload.highlightedEntityId,
      }),
    closeMenu: () => set({ menu: undefined, highlightedEntityId: undefined }),
  }),
  shallow
);
