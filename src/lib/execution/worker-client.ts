import {
  Context,
  ExecutionResult,
  ExecutionWorkerPausedResponse,
  ExecutionWorkerResponse,
  ExecutionWorkerRunRequest,
  WorkerContext,
} from "./types";
import { nanoid } from "nanoid";

type WorkerRunResult = {
  results: Map<string, ExecutionResult>;
  workerContexts: [string, WorkerContext][];
};

type PendingRun = {
  runId: string;
  request: Omit<ExecutionWorkerRunRequest, "type" | "runId">;
  resolve: (result: WorkerRunResult) => void;
  reject: (error: Error) => void;
  onPaused?: (event: ExecutionWorkerPausedResponse) => void;
};

function createExecutionWorkerClient() {
  let worker: Worker | undefined;
  let activeRun: PendingRun | undefined;
  let pendingRun: PendingRun | undefined;

  const startRun = (run: PendingRun) => {
    activeRun = run;
    worker?.postMessage({ type: "run", runId: run.runId, ...run.request });
  };

  const getWorker = (): Worker => {
    if (!worker) {
      worker = new Worker(new URL("./execution.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (e: MessageEvent<ExecutionWorkerResponse>) => {
        const { runId } = e.data;

        if (runId !== activeRun?.runId) return;
        const run = activeRun;

        if (e.data.type === "debug-paused") {
          run.onPaused?.(e.data);
          return;
        }

        activeRun = undefined;

        if (e.data.type === "cancelled") {
          run.reject(new Error("Execution cancelled"));
        } else if (e.data.type === "error") {
          run.reject(new Error(e.data.error));
        } else {
          run.resolve({
            results: new Map(e.data.results),
            workerContexts: e.data.workerContexts,
          });
        }

        const next = pendingRun;
        pendingRun = undefined;
        if (next) startRun(next);
      };
      worker.onerror = (e) => {
        const details = [e.message, e.filename, e.lineno && `line ${e.lineno}`]
          .filter(Boolean)
          .join(" ");
        activeRun?.reject(new Error(details || "Worker error"));
        activeRun = undefined;
        pendingRun?.reject(new Error("Execution cancelled"));
        pendingRun = undefined;
        worker?.terminate();
        worker = undefined;
      };
      worker.onmessageerror = () => {
        activeRun?.reject(new Error("Worker message could not be cloned"));
        activeRun = undefined;
        pendingRun?.reject(new Error("Execution cancelled"));
        pendingRun = undefined;
        worker?.terminate();
        worker = undefined;
      };
    }
    return worker;
  };

  return {
    run(
      request: Omit<ExecutionWorkerRunRequest, "type" | "runId">,
      options?: { onPaused?: (event: ExecutionWorkerPausedResponse) => void }
    ) {
      const runId = nanoid();
      getWorker();
      return new Promise<WorkerRunResult>((resolve, reject) => {
        const run: PendingRun = {
          runId,
          request,
          resolve,
          reject,
          onPaused: options?.onPaused,
        };
        if (!activeRun) {
          startRun(run);
          return;
        }
        pendingRun?.reject(new Error("Execution cancelled"));
        pendingRun = run;
        worker?.postMessage({ type: "cancel" });
      });
    },
    cancel() {
      if (!activeRun && !pendingRun) return;
      pendingRun?.reject(new Error("Execution cancelled"));
      pendingRun = undefined;
      worker?.postMessage({ type: "cancel" });
    },
    reset() {
      activeRun?.reject(new Error("Execution cancelled"));
      activeRun = undefined;
      pendingRun?.reject(new Error("Execution cancelled"));
      pendingRun = undefined;
      worker?.terminate();
      worker = undefined;
    },
  };
}

export const executionWorkerClient = createExecutionWorkerClient();

export function hydrateContexts(
  workerContexts: [string, WorkerContext][],
  rootContext: Context,
  options?: { isPartial?: boolean }
): Map<string, Context> {
  const contexts = new Map<string, Context>();
  for (const [id, context] of workerContexts) {
    const { variables, narrowedTypes, ...rest } = context;
    contexts.set(id, {
      ...rootContext,
      ...rest,
      isPartial: options?.isPartial,
      variables: new Map(variables),
      ...(narrowedTypes ? { narrowedTypes: new Map(narrowedTypes) } : {}),
    });
  }
  return contexts;
}
