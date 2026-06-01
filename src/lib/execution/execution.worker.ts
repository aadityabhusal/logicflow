import {
  setOperationResults,
  executeStatement,
  executeStatementSync,
  executeOperation,
  executeOperationSync,
} from "./execution";
import { createLocalContext } from "../utils";
import {
  Context,
  ExecutionWorkerRequest,
  ExecutionWorkerRunRequest,
  ExecutionWorkerResponse,
} from "./types";
import {
  createExecutionVariables,
  syncPackageRegistry,
} from "../operations/built-in";
import { getAliasesFromPackages } from "../packages/catalog";
import { getDebugControl } from "../debugger/control-buffer";
import {
  createDebuggerController,
  publicResults,
  serializeContexts,
} from "../debugger/debugger-controller";

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
      setInstance: (id, instance) => persistentInstances.set(id, instance),
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

    let debuggerController: Context["debugger"] | undefined;
    if (req.debug) {
      const control = getDebugControl(req.debug.controlBuffer);
      debuggerController = createDebuggerController({
        runId: req.runId,
        control,
        results,
        getContexts,
        pauseOnExceptions: req.debug.pauseOnExceptions,
        entityFileMap: new Map(req.debug.entityFileIndex),
      });
      rootContext.debugger = debuggerController;
      localCtx.debugger = debuggerController;
      debuggerController.enterFrame({
        id: req.operation.id,
        kind: "root",
        operationId: req.operation.id,
        operationName: req.operation.value.name,
        scopeId: localCtx.scopeId,
        entityId: req.operation.id,
        fileId: req.operation.id,
        callDepth: 0,
      });
    }

    await setOperationResults(req.operation, localCtx);

    const response: ExecutionWorkerResponse = {
      type: "completed",
      runId: req.runId,
      results: publicResults(results),
      flowSteps: debuggerController?.getFlowSteps() ?? [],
      workerContexts: serializeContexts(
        [...getContexts()].filter(([, ctx]) => !ctx.isIsolated)
      ),
    };

    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      type: controller.signal.aborted ? "cancelled" : "error",
      runId: req.runId,
      ...(controller.signal.aborted
        ? {}
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
