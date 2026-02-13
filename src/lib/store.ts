import { StateCreator } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  Context,
  IData,
  INavigation,
  Project,
  ProjectFile,
  NavigationEntity,
  DataType,
  ExecutionResult,
} from "./types";
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { openDB } from "idb";
import { nanoid } from "nanoid";
import { SetStateAction } from "react";
import { isDataOfType } from "./utils";

const IDbStore = openDB("logicflow", 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("projects")) {
      db.createObjectStore("projects");
    }
    if (!db.objectStoreNames.contains("uiConfig")) {
      db.createObjectStore("uiConfig");
    }
  },
});

const createIDbStorage = <T>(storeName: string) =>
  createJSONStorage<T>(
    () => ({
      getItem: async (key) =>
        (await IDbStore)
          .get(storeName, key)
          .then((data) => data || null)
          .catch((e) => (console.error(`IndexedDB getItem error:`, e), null)),
      setItem: async (key, value) =>
        (await IDbStore).put(storeName, value, key).catch((e) => {
          console.error(`IndexedDB setItem error:`, e);
        }),
      removeItem: async (key) =>
        (await IDbStore).delete(storeName, key).catch((e) => {
          console.error(`IndexedDB removeItem error:`, e);
        }),
    }),
    { reviver: jsonParseReviver, replacer: jsonStringifyReplacer }
  );

interface FileHistoryItem {
  content: ProjectFile["content"];
  focusId?: string;
}

export const fileHistories = new Map<
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

export interface IProjectsStore {
  projects: Record<string, Project>;
  createProject: (name: string, initialFiles?: ProjectFile[]) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  getProject: (id?: string) => Project | undefined;
  getCurrentProject: () => Project | undefined;
}

export interface ICurrentProjectStore {
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
}

type ProjectStore = IProjectsStore & ICurrentProjectStore;

const createProjectsSlice: StateCreator<
  ProjectStore,
  [],
  [],
  IProjectsStore
> = (set, get) => ({
  projects: {},
  createProject: (name, initialFiles = []) => {
    const createdAt = Date.now();
    const newProject: Project = {
      id: nanoid(),
      name,
      version: "0.0.1",
      createdAt,
      files: initialFiles,
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
  },
  getProject: (id) => (id ? get().projects[id] : undefined),
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
    useExecutionResultsStore.getState().removeAll();
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
    useExecutionResultsStore.getState().removeAll();
    updateFile(currentFile.id, {
      content: nextItem.content,
    } as Partial<ProjectFile>);
    useNavigationStore
      .getState()
      .setNavigation({ navigation: { id: nextItem.focusId } });
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
      partialize: (state) => ({ projects: state.projects } as ProjectStore),
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

type UiConfigStore = {
  sidebar: {
    activeTab?: string;
    width?: number;
    height?: number;
    lockedIds?: { [operationId: string]: string };
  };
  disableKeyboard?: boolean;
  setUiConfig: (
    change: SetStateAction<Partial<Omit<UiConfigStore, "setUiConfig">>>
  ) => void;
};
export const useUiConfigStore = createWithEqualityFn(
  persist<UiConfigStore>(
    (set) => ({
      sidebar: {
        activeTab: "operations",
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

interface ExecutionResultsState {
  results: Map<string, ExecutionResult>;
  instances: Map<string, unknown>;
  setResult: (entityId: string, result: Partial<ExecutionResult>) => void;
  getResult: (entityId: string) => ExecutionResult | undefined;
  getInstance: (entityId: string) => unknown;
  setInstance: (entityId: string, instance: unknown) => void;
  removeAll: () => void;
  removeResult: (entityId: string) => void;
}

export const useExecutionResultsStore =
  createWithEqualityFn<ExecutionResultsState>(
    (set, get) => ({
      results: new Map(),
      instances: new Map(),
      setResult: (entityId, result) => {
        set((state) => {
          const newResults = new Map(state.results);
          const current = newResults.get(entityId) || {};
          newResults.set(entityId, { ...current, ...result });
          return { results: newResults };
        });
      },
      getResult: (entityId) => {
        return get().results.get(entityId);
      },
      getInstance: (entityId) => {
        return get().instances.get(entityId);
      },
      setInstance: (entityId, instance) => {
        set((state) => {
          const newInstances = new Map(state.instances);
          newInstances.set(entityId, instance);
          return { instances: newInstances };
        });
      },
      removeAll: () =>
        set((state) => {
          const newResults = new Map();
          const newInstances = new Map();
          for (const [key, value] of state.results) {
            if (value.shouldCacheResult) {
              newResults.set(key, value);
              if (isDataOfType(value.data, "instance")) {
                const instanceId = value.data.value.instanceId;
                newInstances.set(instanceId, state.instances.get(instanceId));
              }
            }
          }
          return { results: newResults, instances: newInstances };
        }),
      removeResult: (entityId) => {
        set((state) => {
          const newResults = new Map(state.results);
          newResults.delete(entityId);
          const newInstances = new Map(state.instances);
          newInstances.delete(entityId);
          return { results: newResults, instances: newInstances };
        });
      },
    }),
    shallow
  );

type NavigationStore = {
  navigation?: INavigation;
  navigationEntities?: NavigationEntity[];
  skipExecution?: Context["skipExecution"];
  type?: DataType;
  result?: IData;
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

export function jsonParseReviver(_: string, value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "_map_" in value &&
    Array.isArray(value._map_)
  ) {
    return new Map(value._map_);
  }
  return value;
}

export function jsonStringifyReplacer(_: string, value: IData["value"]) {
  return value instanceof Map ? { _map_: Array.from(value.entries()) } : value;
}
