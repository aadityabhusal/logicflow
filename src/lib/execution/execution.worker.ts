import {
  setOperationResults,
  executeStatement,
  executeStatementSync,
  executeOperation,
  executeOperationSync,
} from "./execution";
import { createExecutionVariables } from "../utils";
import {
  Context,
  WorkerContext,
  ExecutionWorkerRequest,
  ExecutionWorkerRunRequest,
  ExecutionWorkerResponse,
} from "./types";

function serializeContext(ctx: Context): WorkerContext {
  return {
    scopeId: ctx.scopeId,
    expectedType: ctx.expectedType,
    enforceExpectedType: ctx.enforceExpectedType,
    skipExecution: ctx.skipExecution,
    isSync: ctx.isSync,
    isIsolated: ctx.isIsolated,
    callDepth: ctx.callDepth,
    maxCallDepth: ctx.maxCallDepth,
    controlFlowState: ctx.controlFlowState,
    variables: [...ctx.variables],
    narrowedTypes: ctx.narrowedTypes ? [...ctx.narrowedTypes] : undefined,
  };
}

const persistentInstances = new Map<
  string,
  ReturnType<Context["getInstance"]>
>();

let activeAbortController: AbortController | undefined;

async function runExecution(req: ExecutionWorkerRunRequest) {
  const controller = new AbortController();
  activeAbortController = controller;

  try {
    const contexts = new Map<string, Context>();
    const results = new Map(req.cachedResults);

    const localContext: Context = {
      scopeId: "_root_",
      variables: createExecutionVariables(req.files, req.envVariables),
      expectedType: req.expectedType,
      enforceExpectedType: req.enforceExpectedType,
      operationCache: new Map(),
      controlFlowState: {},
      isCancelled: () => controller.signal.aborted,
      getResult: (id) => results.get(id),
      setResult: (id, result) => results.set(id, result),
      getContext: (id) => contexts.get(id) ?? localContext,
      setContext: (id, ctx) => {
        if (ctx.isIsolated && contexts.has(id)) return;
        contexts.set(id, ctx);
      },
      getInstance: (id) => persistentInstances.get(id),
      setInstance: (id, instance) => persistentInstances.set(id, instance),
      executeStatement,
      executeStatementSync,
      executeOperation,
      executeOperationSync,
    };

    await setOperationResults(req.operation, localContext);

    const workerContexts: [string, WorkerContext][] = [];
    for (const [id, ctx] of contexts) {
      if (ctx.isIsolated) continue;
      workerContexts.push([id, serializeContext(ctx)]);
    }

    const response: ExecutionWorkerResponse = {
      runId: req.runId,
      results: [...results].filter(
        ([id, result]) => result.shouldCacheResult || !id.includes(":")
      ),
      workerContexts,
    };

    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      runId: req.runId,
      results: [],
      workerContexts: [],
      ...(controller.signal.aborted
        ? { cancelled: true }
        : { error: error instanceof Error ? error.message : String(error) }),
    } as ExecutionWorkerResponse);
  } finally {
    if (activeAbortController === controller) activeAbortController = undefined;
  }
}

self.onmessage = (e: MessageEvent<ExecutionWorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "reset") {
    persistentInstances.clear();
  } else if (msg.type === "cancel") activeAbortController?.abort();
  else if (msg.type === "run") void runExecution(msg);
};
