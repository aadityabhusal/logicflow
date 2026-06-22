import { createWithEqualityFn } from "zustand/traditional";
import {
  Context,
  ExecutionResult,
  ContextInstanceType,
  ReservedNames,
} from "./types";
import { shallow } from "zustand/shallow";
import { IData, EntityPath } from "../types";
import {
  createOperationFromFile,
  disposeRuntimeInstance,
  resolveAncestorIds,
} from "../utils";
import { useProjectStore } from "../store";
import {
  executeOperation,
  executeOperationSync,
  executeStatement,
  executeStatementSync,
} from "./execution";
import { DataTypes, RESERVED_KEYWORDS } from "../data";
import {
  createExecutionVariables,
  getAllOperations,
} from "../operations/built-in";
import {
  getAliasesFromPackages,
  getEnabledPackages,
} from "../packages/catalog";

function getTriggerExpectedType() {
  const currentFile = useProjectStore.getState().getCurrentFile();
  if (!currentFile) {
    return { expectedType: undefined, enforceExpectedType: undefined };
  }
  const isTrigger = currentFile.type === "operation" && !!currentFile.trigger;
  if (!isTrigger) {
    return { expectedType: undefined, enforceExpectedType: undefined };
  }
  return {
    expectedType: createOperationFromFile(currentFile)?.type,
    enforceExpectedType: true,
  };
}

interface ExecutionResultsState {
  rootContext: Context;
  contexts: Map<string, Context>;
  results: Map<string, ExecutionResult>;
  instances: Map<string, ContextInstanceType | undefined>;
  isExecuting: boolean;
  runVersion: number;
  getContext: Context["getContext"];
  getContextOrAncestor: (entityId: string, path: EntityPath) => Context;
  setContext: Context["setContext"];
  setResult: Context["setResult"];
  getResult: Context["getResult"];
  getInstance: Context["getInstance"];
  setInstance: Context["setInstance"];
  setIsExecuting: (value: boolean) => void;
  clearCache: () => void;
  removeResult: (entityId: string) => void;
  removeAll: () => void;
}

export const useExecutionResultsStore =
  createWithEqualityFn<ExecutionResultsState>((set, get) => {
    const project = useProjectStore.getState().getCurrentProject();
    const rootContext: Context = {
      scopeId: "_root_",
      variables: new Map(),
      packageAliases: getAliasesFromPackages(getEnabledPackages(project)),
      operationCache: new Map<string, IData>(),
      controlFlowState: {},
      ...getTriggerExpectedType(),
      getResult: (id) => get().getResult(id),
      getInstance: (id) => get().getInstance(id),
      getContext: (id) => get().getContext(id),
      setContext: (id, context) => get().setContext(id, context),
      setResult: (id, result) => get().setResult(id, result),
      setInstance: (id, instance) => get().setInstance(id, instance),
      executeOperation: executeOperation,
      executeOperationSync: executeOperationSync,
      executeStatement: executeStatement,
      executeStatementSync: executeStatementSync,
    };
    rootContext.variables = createExecutionVariables(
      rootContext,
      project?.files,
      project?.deployment?.envVariables
    );

    return {
      rootContext,
      contexts: new Map(),
      results: new Map(),
      instances: new Map(),
      isExecuting: false,
      runVersion: 0,
      setIsExecuting: (value) => set({ isExecuting: value }),
      clearCache: () =>
        set((state) => {
          state.instances.forEach(disposeRuntimeInstance);
          const project = useProjectStore.getState().getCurrentProject();
          return {
            results: new Map(
              [...state.results].filter(([, res]) => !res.shouldCacheResult)
            ),
            instances: new Map(),
            rootContext: {
              ...state.rootContext,
              operationCache: new Map(),
              packageAliases: getAliasesFromPackages(
                getEnabledPackages(project)
              ),
            },
            runVersion: state.runVersion + 1,
          };
        }),
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
          const current = newInstances.get(entityId);
          if (current?.instance !== instance.instance) {
            disposeRuntimeInstance(current);
          }
          newInstances.set(entityId, instance);
          return { instances: newInstances };
        });
      },
      getContext: (entityId) => {
        const registered = get().contexts.get(entityId);
        if (registered) {
          const packageAliases = get().rootContext.packageAliases;
          return { ...registered, packageAliases };
        }
        return get().rootContext;
      },
      getContextOrAncestor: (entityId, path) => {
        const directCtx = get().getContext(entityId);
        if (directCtx !== get().rootContext) return directCtx;

        if (get().contexts.size === 0) return get().rootContext;
        const file = useProjectStore.getState().getCurrentFile();
        const rootValue =
          file?.type === "operation" ? file.content.value : undefined;
        if (!rootValue) return get().rootContext;

        for (const id of resolveAncestorIds(path, rootValue)) {
          const ctx = get().getContext(id);
          if (ctx !== get().rootContext) return ctx;
        }
        return get().rootContext;
      },
      setContext: (entityId, context) => {
        const contexts = get().contexts;
        if (context.isIsolated && contexts.has(entityId)) return;
        set((state) => {
          const newContexts = new Map(state.contexts);
          newContexts.set(entityId, context);
          return { contexts: newContexts };
        });
      },
      removeAll: () =>
        set((state) => {
          state.instances.forEach(disposeRuntimeInstance);
          const project = useProjectStore.getState().getCurrentProject();
          const rootContext: Context = {
            ...state.rootContext,
            variables: new Map(),
            operationCache: new Map<string, IData>(),
            controlFlowState: {},
            packageAliases: getAliasesFromPackages(getEnabledPackages(project)),
            ...getTriggerExpectedType(),
          };
          rootContext.variables = createExecutionVariables(
            rootContext,
            project?.files,
            project?.deployment?.envVariables
          );
          return {
            contexts: new Map(),
            results: new Map(),
            instances: new Map(),
            rootContext,
            runVersion: state.runVersion + 1,
          };
        }),
      removeResult: (entityId) => {
        set((state) => {
          const newResults = new Map(state.results);
          newResults.delete(entityId);
          const newInstances = new Map(state.instances);
          disposeRuntimeInstance(newInstances.get(entityId));
          newInstances.delete(entityId);
          return { results: newResults, instances: newInstances };
        });
      },
    };
  }, shallow);

export function getReservedNames(variables: Context["variables"]) {
  return getAllOperations()
    .map((op) => ({ kind: "operation", name: op.name }))
    .concat(RESERVED_KEYWORDS.map((name) => ({ kind: "reserved", name })))
    .concat(Object.keys(DataTypes).map((name) => ({ kind: "data-type", name })))
    .concat(
      [...variables.keys()].map((name) => ({ kind: "variable", name }))
    ) as ReservedNames;
}
