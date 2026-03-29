import { createWithEqualityFn } from "zustand/traditional";
import { Context, ExecutionResult, ReservedNames } from "./types";
import { shallow } from "zustand/shallow";
import { IData, InstanceDataType } from "../types";
import { createFileVariables } from "../utils";
import { useProjectStore } from "../store";
import {
  executeOperation,
  executeOperationSync,
  executeStatement,
  executeStatementSync,
} from "./execution";
import { DataTypes, RESERVED_KEYWORDS } from "../data";
import { builtInOperations } from "../operations/built-in";

export interface ExecutionResultsState {
  rootContext: Context;
  contexts: Map<string, Context>;
  results: Map<string, ExecutionResult>;
  instances: Map<string, unknown>;
  getContext: (entityId: string) => Context;
  setContext: (entityId: string, context: Context) => void;
  setResult: (entityId: string, result: Partial<ExecutionResult>) => void;
  getResult: (entityId: string) => ExecutionResult | undefined;
  getInstance: (entityId: string) => unknown;
  setInstance: (entityId: string, instance: unknown) => void;
  removeResult: (entityId: string) => void;
  removeAll: () => void;
}

export const useExecutionResultsStore =
  createWithEqualityFn<ExecutionResultsState>(
    (set, get) => ({
      rootContext: {
        scopeId: "_root_",
        variables: createFileVariables(
          useProjectStore.getState().getCurrentProject()?.files,
          useProjectStore.getState().currentFileId
        ),
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
      setContext: (entityId, context) => {
        if (context.isIsolated) return;
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
            variables: createFileVariables(
              useProjectStore.getState().getCurrentProject()?.files,
              useProjectStore.getState().currentFileId
            ),
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
