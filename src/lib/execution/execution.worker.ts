import {
  setOperationResults,
  executeStatement,
  executeStatementSync,
  executeOperation,
  executeOperationSync,
} from "./execution";
import { installDevProxyFetch } from "../dev-proxy-fetch";
import { createLocalContext, disposeRuntimeInstance } from "../utils";
import {
  Context,
  WorkerContext,
  ExecutionWorkerRequest,
  ExecutionWorkerRunRequest,
  ExecutionWorkerResponse,
  ContextInstanceType,
} from "./types";
import {
  createExecutionVariables,
  syncPackageRegistry,
} from "../operations/built-in";
import { getAliasesFromPackages } from "../packages/catalog";
import { walkData } from "../walk";
import type { IData, OperationType } from "../types";
import {
  collectFileInstanceIds,
  getFileAsset,
  isFileInstanceData,
} from "../file-assets";

installDevProxyFetch();

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

const persistentInstances = new Map<string, ContextInstanceType | undefined>();

function setPersistentInstance(
  id: string,
  instance: NonNullable<ContextInstanceType | undefined>
) {
  const current = persistentInstances.get(id);
  if (current?.instance !== instance.instance) disposeRuntimeInstance(current);
  persistentInstances.set(id, instance);
}

function clearPersistentInstances(req?: ExecutionWorkerRunRequest) {
  const retainedIds = new Set(req ? collectFileInstanceIds(req.files) : []);
  const walkOptions = { nestedOperations: true, operationCalls: true };
  req?.cachedResults.forEach(([, result]) => {
    if (result.data) {
      walkData(
        result.data,
        { onInstance: (data) => retainedIds.add(data.value.instanceId) },
        walkOptions
      );
    }
  });
  for (const [id, instance] of persistentInstances) {
    if (retainedIds.has(id)) continue;
    disposeRuntimeInstance(instance);
    persistentInstances.delete(id);
  }
}

let activeAbortController: AbortController | undefined;

async function hydrateFileInstances(
  operation: IData<OperationType>,
  files: ExecutionWorkerRunRequest["files"]
) {
  const fileInstanceIds = new Set<string>();
  const collectFileIds = (data: IData) => {
    if (isFileInstanceData(data)) fileInstanceIds.add(data.value.instanceId);
  };
  const walkOptions = { nestedOperations: true, operationCalls: true };
  walkData(operation, { onInstance: collectFileIds }, walkOptions);
  collectFileInstanceIds(files).forEach((id) => fileInstanceIds.add(id));
  await Promise.all(
    [...fileInstanceIds].map(async (id) => {
      if (persistentInstances.has(id)) return;
      const file = (await getFileAsset(id))?.file;
      if (file) {
        setPersistentInstance(id, {
          instance: file,
          type: { kind: "instance", className: "File", constructorArgs: [] },
        });
      }
    })
  );
}

async function runExecution(req: ExecutionWorkerRunRequest) {
  const controller = new AbortController();
  activeAbortController = controller;

  try {
    await syncPackageRegistry(req.packages);
    clearPersistentInstances(req);
    await hydrateFileInstances(req.operation, req.files);

    const results = new Map(req.cachedResults);
    const rootContext = {} as Context;
    Object.assign<Context, Context>(rootContext, {
      scopeId: "_root_",
      variables: new Map(),
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
      setInstance: setPersistentInstance,
      executeStatement,
      executeStatementSync,
      executeOperation,
      executeOperationSync,
    });
    rootContext.variables = createExecutionVariables(
      rootContext,
      req.files,
      req.envVariables
    );
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
    clearPersistentInstances();
  } else if (msg.type === "cancel") activeAbortController?.abort();
  else if (msg.type === "run") void runExecution(msg);
};
