import { describe, expect, it, vi } from "vitest";
import { createExecutionController } from "./controller";
import type { ExecutionResult } from "./types";

const request = {} as Parameters<
  ReturnType<typeof createExecutionController>["run"]
>[0];

describe("execution controller", () => {
  it("correlates a completed run with its application", async () => {
    const results = new Map();
    const runWorker = vi.fn(async () => ({ results, workerContexts: [] }));
    const controller = createExecutionController(runWorker);
    const events: string[] = [];
    controller.subscribe(({ status }) => events.push(status));
    controller.expectApplication({
      applicationId: "application-a",
      projectId: "project-a",
      operationId: "operation-a",
      redactionValues: ["secret-a"],
    });

    await controller.run(request, {
      projectId: "project-a",
      operationId: "operation-a",
    });
    const outcome = await controller.waitForApplication("application-a");

    expect(outcome).toMatchObject({
      applicationId: "application-a",
      operationId: "operation-a",
      status: "completed",
      results,
      redactionValues: ["secret-a"],
    });
    expect(events).toEqual(["started", "completed"]);
  });

  it("reports not_run when no matching run starts", async () => {
    vi.useFakeTimers();
    const controller = createExecutionController(vi.fn());
    controller.expectApplication({
      applicationId: "application-a",
      projectId: "project-a",
      operationId: "operation-a",
      timeout: 10,
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(
      controller.waitForApplication("application-a")
    ).resolves.toMatchObject({ status: "not_run" });
    vi.useRealTimers();
  });

  it("does not report a claimed long-running execution as not_run", async () => {
    vi.useFakeTimers();
    let finish!: (value: {
      results: Map<string, ExecutionResult>;
      workerContexts: [];
    }) => void;
    const worker = new Promise<{
      results: Map<string, ExecutionResult>;
      workerContexts: [];
    }>((resolve) => {
      finish = resolve;
    });
    const controller = createExecutionController(vi.fn(() => worker));
    controller.expectApplication({
      applicationId: "application-a",
      projectId: "project-a",
      operationId: "operation-a",
      timeout: 10,
    });
    const run = controller.run(request, {
      projectId: "project-a",
      operationId: "operation-a",
    });

    await vi.advanceTimersByTimeAsync(20);
    finish({ results: new Map(), workerContexts: [] });
    await run;

    await expect(
      controller.waitForApplication("application-a")
    ).resolves.toMatchObject({ status: "completed" });
    vi.useRealTimers();
  });

  it("cancels a correlated run when a newer run supersedes it", async () => {
    let finishFirst!: (value: {
      results: Map<string, ExecutionResult>;
      workerContexts: [];
    }) => void;
    const first = new Promise<{
      results: Map<string, ExecutionResult>;
      workerContexts: [];
    }>((resolve) => {
      finishFirst = resolve;
    });
    const runWorker = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ results: new Map(), workerContexts: [] });
    const controller = createExecutionController(runWorker);
    controller.expectApplication({
      applicationId: "application-a",
      projectId: "project-a",
      operationId: "operation-a",
    });
    const firstRun = controller.run(request, {
      projectId: "project-a",
      operationId: "operation-a",
    });

    await controller.run(request, {
      projectId: "project-a",
      operationId: "operation-b",
    });

    await expect(
      controller.waitForApplication("application-a")
    ).resolves.toMatchObject({ status: "cancelled", reason: "superseded" });
    finishFirst({ results: new Map(), workerContexts: [] });
    await firstRun;
  });

  it("keeps executions started by lifecycle listeners observable", async () => {
    let finishFirst!: (value: {
      results: Map<string, ExecutionResult>;
      workerContexts: [];
    }) => void;
    const first = new Promise<{
      results: Map<string, ExecutionResult>;
      workerContexts: [];
    }>((resolve) => {
      finishFirst = resolve;
    });
    const runWorker = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue({ results: new Map(), workerContexts: [] });
    const controller = createExecutionController(runWorker);
    controller.expectApplication({
      applicationId: "application-c",
      projectId: "project-a",
      operationId: "operation-c",
    });
    let listenerRun: ReturnType<typeof controller.run> | undefined;
    controller.subscribe((event) => {
      if (event.status === "cancelled" && !listenerRun) {
        listenerRun = controller.run(request, {
          projectId: "project-a",
          operationId: "operation-c",
        });
      }
    });
    const firstRun = controller.run(request, {
      projectId: "project-a",
      operationId: "operation-a",
    });

    await controller.run(request, {
      projectId: "project-a",
      operationId: "operation-b",
    });
    await listenerRun;

    await expect(
      controller.waitForApplication("application-c")
    ).resolves.toMatchObject({ status: "completed" });
    finishFirst({ results: new Map(), workerContexts: [] });
    await firstRun;
  });
});
