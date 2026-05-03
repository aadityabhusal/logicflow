import { createWithEqualityFn } from "zustand/traditional";
import { Context, ExecutionResult, ReservedNames } from "./types";
import { shallow } from "zustand/shallow";
import { IData, InstanceDataType, EntityPath } from "../types";
import {
  createFileVariables,
  createData,
  createOperationFromFile,
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
import { builtInOperations } from "../operations/built-in";

export function createExecutionVariables() {
  const project = useProjectStore.getState().getCurrentProject();
  const variables = createFileVariables(project?.files);
  if (project?.deployment) {
    for (const envVar of project.deployment.envVariables) {
      variables.set(envVar.key, {
        data: createData({ value: envVar.value }),
        isEnv: true,
      });
    }
  }
  return variables;
}
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
  instances: Map<string, ReturnType<Context["getInstance"]>>;
  isExecuting: boolean;
  getContext: Context["getContext"];
  getContextOrAncestor: (entityId: string, path: EntityPath) => Context;
  setContext: Context["setContext"];
  setResult: Context["setResult"];
  getResult: Context["getResult"];
  getInstance: Context["getInstance"];
  setInstance: Context["setInstance"];
  setIsExecuting: (value: boolean) => void;
  removeResult: (entityId: string) => void;
  removeAll: () => void;
}

export const useExecutionResultsStore =
  createWithEqualityFn<ExecutionResultsState>(
    (set, get) => ({
      rootContext: {
        scopeId: "_root_",
        variables: createExecutionVariables(),
        yieldCounter: { calls: 0 },
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
      },
      contexts: new Map(),
      results: new Map(),
      instances: new Map(),
      isExecuting: false,
      setIsExecuting: (value) => set({ isExecuting: value }),
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
      getContext: (entityId) => {
        return get().contexts.get(entityId) ?? get().rootContext;
      },
      getContextOrAncestor: (entityId, path) => {
        const registered = get().contexts.get(entityId);
        if (registered) return registered;
        const file = useProjectStore.getState().getCurrentFile();
        const rootValue =
          file?.type === "operation" ? file.content.value : undefined;
        if (!rootValue) return get().rootContext;
        for (const id of resolveAncestorIds(path, rootValue)) {
          const ctx = get().contexts.get(id);
          if (ctx) return ctx;
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
          const newResults = new Map();
          const newInstances = new Map();
          for (const [key, value] of state.results) {
            if (value.shouldCacheResult) {
              newResults.set(key, value);
              if (value.data?.type.kind === "instance") {
                const instanceId = (value.data as IData<InstanceDataType>).value
                  .instanceId;
                newInstances.set(instanceId, state.instances.get(instanceId));
              }
            }
          }
          const newRootContext = {
            ...state.rootContext,
            yieldCounter: { calls: 0 },
            operationCache: new Map<string, IData>(),
            controlFlowState: {},
            variables: createExecutionVariables(),
            ...getTriggerExpectedType(),
          };
          return {
            contexts: new Map(),
            results: newResults,
            instances: newInstances,
            rootContext: newRootContext,
          };
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

export function getReservedNames(variables: Context["variables"]) {
  return builtInOperations
    .map((op) => ({ kind: "operation", name: op.name }))
    .concat(RESERVED_KEYWORDS.map((name) => ({ kind: "reserved", name })))
    .concat(Object.keys(DataTypes).map((name) => ({ kind: "data-type", name })))
    .concat(
      [...variables.keys()].map((name) => ({ kind: "variable", name }))
    ) as ReservedNames;
}
