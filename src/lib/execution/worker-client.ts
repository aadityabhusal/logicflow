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

  const terminateWorker = () => {
    activeRun?.reject(new Error("Execution cancelled"));
    activeRun = undefined;
    worker?.terminate();
    worker = undefined;
  };

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
      };
      worker.onerror = (e) => {
        activeRun?.reject(new Error(e.message || "Worker error"));
        activeRun = undefined;
      };
    }
    return worker;
  };

  return {
    run(request: Omit<ExecutionWorkerRunRequest, "type" | "runId">) {
      if (activeRun) terminateWorker();
      const runId = nanoid();
      const _worker = getWorker();
      return new Promise<WorkerRunResult>((resolve, reject) => {
        activeRun = { runId, request, resolve, reject };
        _worker.postMessage({ type: "run", runId, ...request });
      });
    },
    cancel() {
      if (activeRun) terminateWorker();
    },
    reset() {
      terminateWorker();
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
