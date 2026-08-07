import { nanoid } from "nanoid";
import type { ExecutionResult, ExecutionWorkerRunRequest } from "./types";
import {
  ExecutionCancelledError,
  executionWorkerClient,
  type ExecutionCancellationReason,
} from "./worker-client";

type WorkerRunResult = Awaited<ReturnType<typeof executionWorkerClient.run>>;

export type ExecutionLifecycleEvent = {
  projectId: string;
  executionId: string;
  operationId: string;
  applicationId?: string;
} & (
  | { status: "started" }
  | { status: "completed"; results: Map<string, ExecutionResult> }
  | { status: "failed"; error: string }
  | { status: "cancelled"; reason: ExecutionCancellationReason }
);

export type AgentExecutionOutcome = (
  | Extract<
      ExecutionLifecycleEvent,
      { status: "completed" | "failed" | "cancelled" }
    >
  | {
      projectId: string;
      applicationId: string;
      operationId?: string;
      status: "not_run";
    }
) & { redactionValues?: string[] };

type StartedExecution = Extract<ExecutionLifecycleEvent, { status: "started" }>;
type TerminalExecution = Exclude<ExecutionLifecycleEvent, StartedExecution>;

type Expectation = {
  projectId: string;
  operationId?: string;
  promise: Promise<AgentExecutionOutcome>;
  resolve: (outcome: AgentExecutionOutcome) => void;
  timeout?: ReturnType<typeof setTimeout>;
  redactionValues: string[];
};

export function createExecutionController(
  runWorker: typeof executionWorkerClient.run = executionWorkerClient.run
) {
  const listeners = new Set<(event: ExecutionLifecycleEvent) => void>();
  const expectations = new Map<string, Expectation>();
  const activeExecutions = new Map<string, StartedExecution>();

  const emit = (event: ExecutionLifecycleEvent) => {
    listeners.forEach((listener) => listener(event));
  };

  const finishRun = (event: TerminalExecution) => {
    if (!activeExecutions.delete(event.executionId)) return;
    emit(event);
    const expectation = event.applicationId
      ? expectations.get(event.applicationId)
      : undefined;
    expectation?.resolve({
      ...event,
      redactionValues: expectation.redactionValues,
    });
  };

  return {
    expectApplication({
      applicationId,
      projectId,
      operationId,
      redactionValues = [],
      timeout = 3_000,
    }: {
      applicationId: string;
      projectId: string;
      operationId?: string;
      redactionValues?: string[];
      timeout?: number;
    }) {
      let resolve!: (outcome: AgentExecutionOutcome) => void;
      const promise = new Promise<AgentExecutionOutcome>((done) => {
        resolve = done;
      });
      const expectation: Expectation = {
        projectId,
        operationId,
        promise,
        resolve,
        redactionValues,
      };
      expectations.set(applicationId, expectation);
      if (!operationId) {
        resolve({
          projectId,
          applicationId,
          status: "not_run",
          redactionValues,
        });
      } else {
        expectation.timeout = setTimeout(() => {
          expectation.timeout = undefined;
          resolve({
            projectId,
            applicationId,
            operationId,
            status: "not_run",
            redactionValues,
          });
        }, timeout);
      }
    },
    waitForApplication(applicationId: string) {
      const expectation = expectations.get(applicationId);
      if (!expectation)
        throw new Error("Execution feedback is unavailable for this Apply");
      return expectation.promise.finally(() =>
        expectations.delete(applicationId)
      );
    },
    run(
      request: Omit<ExecutionWorkerRunRequest, "type" | "runId">,
      metadata: { projectId: string; operationId: string }
    ): Promise<WorkerRunResult> {
      for (const activeExecution of [...activeExecutions.values()]) {
        finishRun({
          ...activeExecution,
          status: "cancelled",
          reason: "superseded",
        });
      }
      const executionId = nanoid();
      const matchedExpectation = [...expectations.entries()].find(
        ([, expectation]) =>
          expectation.timeout !== undefined &&
          expectation.projectId === metadata.projectId &&
          expectation.operationId === metadata.operationId
      );
      const applicationId = matchedExpectation?.[0];
      if (matchedExpectation) {
        clearTimeout(matchedExpectation[1].timeout);
        matchedExpectation[1].timeout = undefined;
      }
      const event = { ...metadata, executionId, applicationId };
      const started: StartedExecution = { ...event, status: "started" };
      activeExecutions.set(executionId, started);
      emit(started);

      return runWorker(request).then(
        (result) => {
          finishRun({ ...event, status: "completed", results: result.results });
          return result;
        },
        (error) => {
          finishRun(
            error instanceof ExecutionCancelledError
              ? {
                  ...event,
                  status: "cancelled",
                  reason: error.reason,
                }
              : {
                  ...event,
                  status: "failed",
                  error: error instanceof Error ? error.message : String(error),
                }
          );
          throw error;
        }
      );
    },
    subscribe(listener: (event: ExecutionLifecycleEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const executionController = createExecutionController();
