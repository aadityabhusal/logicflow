import {
  setOperationResults,
  executeStatement,
  executeStatementSync,
  executeOperation,
  executeOperationSync,
} from "./execution";
import { createExecutionVariables, createLocalContext } from "../utils";
import {
  Context,
  WorkerContext,
  ExecutionWorkerRequest,
  ExecutionWorkerRunRequest,
  ExecutionWorkerResponse,
} from "./types";
import { syncPackageRegistry } from "../operations/built-in";
import { getAliasesFromPackages } from "../packages/catalog";

function serializeContext(ctx: Context): WorkerContext {
  return {
    scopeId: ctx.scopeId,
    packageAliases: ctx.packageAliases,
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
    await syncPackageRegistry(req.packages);

    const results = new Map(req.cachedResults);
    const rootContext = {} as Context;
    Object.assign<Context, Context>(rootContext, {
      scopeId: "_root_",
      variables: createExecutionVariables(req.files, req.envVariables),
      packageAliases: getAliasesFromPackages(req.packages),
      expectedType: req.expectedType,
      enforceExpectedType: req.enforceExpectedType,
      operationCache: new Map(),
      controlFlowState: {},
      isCancelled: () => controller.signal.aborted,
      getResult: (id) => results.get(id),
      setResult: (id, result) => results.set(id, result),
      getContext: () => rootContext,
      setContext: () => undefined,
      getInstance: (id) => persistentInstances.get(id),
      setInstance: (id, instance) => persistentInstances.set(id, instance),
      executeStatement,
      executeStatementSync,
      executeOperation,
      executeOperationSync,
    });
    const { context: localCtx, getContexts } = createLocalContext(rootContext);

    await setOperationResults(req.operation, localCtx);

    const workerContexts: [string, WorkerContext][] = [];
    for (const [id, ctx] of getContexts()) {
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
