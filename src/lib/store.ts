import { StateCreator } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  Context,
  IData,
  INavigation,
  IStatement,
  Project,
  ProjectFile,
  NavigationEntity,
} from "./types";
import { preferenceOptions } from "./data";
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { openDB } from "idb";
import { nanoid } from "nanoid";

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
    const focusId = uiConfigStore.getState().navigation?.id;
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
  updateProject: (
    id: string,
    updates: Partial<Project>,
    navigationEntities?: NavigationEntity[]
  ) => void;
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
  updateProject: (id, updates, navigationEntities) => {
    set((state) => ({
      projects: {
        ...state.projects,
        [id]: { ...state.projects[id], ...updates, updatedAt: Date.now() },
      },
    }));
    if (navigationEntities) {
      uiConfigStore.getState().setUiConfig({ navigationEntities });
    }
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
    const focusId = uiConfigStore.getState().navigation?.id;
    history.future.push({
      content: structuredClone(currentFile.content),
      focusId,
    });
    const lastItem = history.past.pop()!;
    updateFile(currentFile.id, {
      content: lastItem.content,
    } as Partial<ProjectFile>);
    uiConfigStore
      .getState()
      .setUiConfig({ navigation: { id: lastItem.focusId } });
  },

  redo: () => {
    const { getCurrentFile, updateFile } = get();
    const currentFile = getCurrentFile();
    if (!currentFile) return;
    const history = fileHistories.get(currentFile.id);
    if (!history || history.future.length === 0) return;
    const currentFocusId = uiConfigStore.getState().navigation?.id;
    history.past.push({
      content: structuredClone(currentFile.content),
      focusId: currentFocusId,
    });
    const nextItem = history.future.pop()!;
    updateFile(currentFile.id, {
      content: nextItem.content,
    } as Partial<ProjectFile>);
    uiConfigStore
      .getState()
      .setUiConfig({ navigation: { id: nextItem.focusId } });
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

type SetUIConfig = Partial<Omit<IUiConfig, "setUiConfig">>;
export type IUiConfig = Partial<{
  [key in (typeof preferenceOptions)[number]["id"]]: boolean;
}> & {
  hideSidebar?: boolean;
  result?: IStatement["data"];
  skipExecution?: Context["skipExecution"];
  showDetailsPanel?: boolean;
  detailsPanelSize?: { width?: number; height?: number };
  // TODO: Don't persist navigation entities in local storage
  navigationEntities?: NavigationEntity[];
  navigation?: INavigation;
  setUiConfig: (
    change: SetUIConfig | ((change: SetUIConfig) => SetUIConfig)
  ) => void;
};

export const uiConfigStore = createWithEqualityFn(
  persist<IUiConfig>(
    (set) => ({
      showDetailsPanel: true,
      setUiConfig: (change) =>
        set((state) => (typeof change === "function" ? change(state) : change)),
    }),
    { name: "uiConfig", storage: createIDbStorage("uiConfig") }
  ),
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
