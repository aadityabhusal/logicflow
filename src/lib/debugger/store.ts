import { nanoid } from "nanoid";
import { SetStateAction } from "react";
import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { createIDbStorage } from "@/lib/store";
import { setDebugBreakpoints } from "./control-buffer";
import {
  DebugBreakpoint,
  DebugFrame,
  DebugLocation,
  DebuggerStatus,
  DebugWatch,
} from "./types";

type BreakpointInput = Omit<DebugBreakpoint, "id" | "enabled"> & {
  enabled?: boolean;
};

type RuntimeState = {
  status: DebuggerStatus;
  currentLocation?: DebugLocation;
  callStack: DebugFrame[];
  selectedFrameId?: string;
  activeControl?: Int32Array;
  activeEntityIds?: string[];
  error?: string;
};

type DebuggerStore = RuntimeState & {
  breakpoints: DebugBreakpoint[];
  watches: DebugWatch[];
  pauseOnExceptions: boolean;
  setPauseOnExceptions: (enabled: boolean) => void;
  setRuntimeState: (change: SetStateAction<Partial<RuntimeState>>) => void;
  resetRuntime: (status?: DebuggerStatus) => void;
  toggleBreakpoint: (input: BreakpointInput) => void;
  removeBreakpoint: (id: string) => void;
  getBreakpoint: (
    projectId: string | undefined,
    fileId: string | undefined,
    entityId: string | undefined
  ) => DebugBreakpoint | undefined;
  setSelectedFrame: (frameId?: string) => void;
  addWatch: (watch: Omit<DebugWatch, "id" | "enabled">) => void;
  updateWatch: (watch: DebugWatch) => void;
  removeWatch: (id: string) => void;
};

const initialRuntime: RuntimeState = {
  status: "idle",
  currentLocation: undefined,
  callStack: [],
  selectedFrameId: undefined,
  activeControl: undefined,
  activeEntityIds: undefined,
  error: undefined,
};

function syncActiveBreakpoints(state: DebuggerStore) {
  if (!state.activeControl || !state.activeEntityIds) return;
  setDebugBreakpoints(
    state.activeControl,
    state.breakpoints.filter((bp) => bp.enabled).map((bp) => bp.entityId),
    state.activeEntityIds
  );
}

export const useDebuggerStore = createWithEqualityFn<DebuggerStore>()(
  persist(
    (set, get) => ({
      ...initialRuntime,
      breakpoints: [],
      watches: [],
      pauseOnExceptions: true,
      setPauseOnExceptions: (enabled) => set({ pauseOnExceptions: enabled }),
      setRuntimeState: (change) =>
        set((state) => {
          const runtimeChange =
            typeof change === "function" ? change(state) : change;
          syncActiveBreakpoints({ ...state, ...runtimeChange });
          return runtimeChange;
        }),
      resetRuntime: (status = "idle") => set({ ...initialRuntime, status }),
      toggleBreakpoint: (input) => {
        set((state) => {
          const existing = state.breakpoints.find(
            (bp) =>
              bp.projectId === input.projectId &&
              bp.fileId === input.fileId &&
              bp.entityId === input.entityId
          );
          const breakpoints = existing
            ? state.breakpoints.filter((bp) => bp.id !== existing.id)
            : [...state.breakpoints, { id: nanoid(), enabled: true, ...input }];
          syncActiveBreakpoints({ ...state, breakpoints });
          return { breakpoints };
        });
      },
      removeBreakpoint: (id) =>
        set((state) => {
          const breakpoints = state.breakpoints.filter((bp) => bp.id !== id);
          syncActiveBreakpoints({ ...state, breakpoints });
          return { breakpoints };
        }),
      getBreakpoint: (projectId, fileId, entityId) => {
        if (!projectId || !fileId || !entityId) return undefined;
        return get().breakpoints.find(
          (bp) =>
            bp.projectId === projectId &&
            bp.fileId === fileId &&
            bp.entityId === entityId
        );
      },
      setSelectedFrame: (frameId) => set({ selectedFrameId: frameId }),
      addWatch: (watch) =>
        set((state) => ({
          watches: [
            ...state.watches,
            { ...watch, id: nanoid(), enabled: true },
          ],
        })),
      updateWatch: (watch) =>
        set((state) => ({
          watches: state.watches.map((item) =>
            item.id === watch.id ? watch : item
          ),
        })),
      removeWatch: (id) =>
        set((state) => ({
          watches: state.watches.filter((watch) => watch.id !== id),
        })),
    }),
    {
      name: "debugger",
      storage: createIDbStorage("debugger"),
      partialize: (state) => ({
        breakpoints: state.breakpoints,
        watches: state.watches,
        pauseOnExceptions: state.pauseOnExceptions,
      }),
    }
  ),
  shallow
);
