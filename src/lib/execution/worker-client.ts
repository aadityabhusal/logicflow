import {
  Context,
  ExecutionResult,
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
};

function createExecutionWorkerClient() {
  let worker: Worker | undefined;
  let activeRun: PendingRun | undefined;
  let pendingRun: PendingRun | undefined;

  const getWorker = (): Worker => {
    if (!worker) {
      worker = new Worker(new URL("./execution.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (e: MessageEvent<ExecutionWorkerResponse>) => {
        const { runId, cancelled, workerContexts, results, error } = e.data;

        if (runId !== activeRun?.runId) return;
        const run = activeRun;
        activeRun = undefined;

        if (cancelled) run.reject(new Error("Execution cancelled"));
        else if (error) run.reject(new Error(error));
        else run.resolve({ results: new Map(results), workerContexts });

        const next = pendingRun;
        pendingRun = undefined;
        if (next) startRun(next);
      };
      worker.onerror = (e) => {
        activeRun?.reject(new Error(e.message || "Worker error"));
        activeRun = undefined;
        pendingRun?.reject(new Error("Execution cancelled"));
        pendingRun = undefined;
      };
    }
    return worker;
  };

  const startRun = (run: PendingRun) => {
    activeRun = run;
    worker?.postMessage({ type: "run", runId: run.runId, ...run.request });
  };

  return {
    run(request: Omit<ExecutionWorkerRunRequest, "type" | "runId">) {
      const runId = nanoid();
      getWorker();
      return new Promise<WorkerRunResult>((resolve, reject) => {
        const run: PendingRun = { runId, request, resolve, reject };
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
      pendingRun?.reject(new Error("Execution cancelled"));
      pendingRun = undefined;
      worker?.postMessage({ type: "cancel" });
    },
    reset() {
      pendingRun?.reject(new Error("Execution cancelled"));
      pendingRun = undefined;
      worker?.postMessage({ type: "cancel" });
      worker?.postMessage({ type: "reset" });
    },
  };
}

export const executionWorkerClient = createExecutionWorkerClient();

export function hydrateContexts(
  workerContexts: [string, WorkerContext][],
  rootContext: Context
): Map<string, Context> {
  const contexts = new Map<string, Context>();
  for (const [id, context] of workerContexts) {
    const { variables, narrowedTypes, ...rest } = context;
    contexts.set(id, {
      ...rootContext,
      ...rest,
      variables: new Map(variables),
      ...(narrowedTypes ? { narrowedTypes: new Map(narrowedTypes) } : {}),
    });
  }
  return contexts;
}
