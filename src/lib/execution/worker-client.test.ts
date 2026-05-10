import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateContexts } from "./worker-client";
import {
  Context,
  ExecutionResult,
  WorkerContext,
  ExecutionWorkerResponse,
} from "./types";
import { createExecutionVariables } from "../utils";
import { createData, createStatement } from "../utils";
import { ProjectFile } from "../types";

function createHydrationBaseContext(): Context {
  const variables = new Map();
  const results = new Map<string, ExecutionResult>();
  const contexts = new Map<string, Context>();
  const instances = new Map();

  const base: Context = {
    scopeId: "_root_",
    variables,
    controlFlowState: {},
    getResult: (id) => results.get(id),
    setResult: (id, result) => results.set(id, result),
    getContext: (id) => contexts.get(id) ?? base,
    setContext: (id, ctx) => contexts.set(id, ctx),
    getInstance: (id) => instances.get(id),
    setInstance: (id, instance) => instances.set(id, instance),
    executeStatement: async () => createData(),
    executeStatementSync: () => createData(),
    executeOperation: async () => createData(),
    executeOperationSync: () => createData(),
  };
  return base;
}

describe("hydrateContexts", () => {
  it("creates contexts with correct scopeIds from overrides", () => {
    const rootContext = createHydrationBaseContext();
    const overrides: [string, WorkerContext][] = [
      [
        "ctx-1",
        {
          scopeId: "scope-1",
          variables: [["x", { data: createData({ value: 42 }) }]],
          callDepth: 1,
          isIsolated: true,
        },
      ],
      [
        "ctx-2",
        {
          scopeId: "scope-2",
          variables: [],
          callDepth: 2,
          isIsolated: true,
        },
      ],
    ];

    const contexts = hydrateContexts(overrides, rootContext);

    expect(contexts.size).toBe(2);
    expect(contexts.get("ctx-1")?.scopeId).toBe("scope-1");
    expect(contexts.get("ctx-2")?.scopeId).toBe("scope-2");
  });

  it("inherits function properties from rootContext", () => {
    const rootContext = createHydrationBaseContext();
    const overrides: [string, WorkerContext][] = [
      [
        "ctx-1",
        {
          scopeId: "scope-1",
          variables: [],
        },
      ],
    ];

    const contexts = hydrateContexts(overrides, rootContext);
    const ctx = contexts.get("ctx-1")!;

    expect(typeof ctx.getResult).toBe("function");
    expect(typeof ctx.getContext).toBe("function");
    expect(typeof ctx.executeStatement).toBe("function");
    expect(typeof ctx.executeOperation).toBe("function");
  });

  it("hydrates variables as a Map with correct entries", () => {
    const rootContext = createHydrationBaseContext();
    const xData = createData({ value: 42 });
    const yData = createData({ value: "hello" });

    const overrides: [string, WorkerContext][] = [
      [
        "ctx-1",
        {
          scopeId: "scope-1",
          variables: [
            ["x", { data: xData, isEnv: true }],
            ["y", { data: yData, reference: { name: "yRef", id: "y-id" } }],
          ],
        },
      ],
    ];

    const contexts = hydrateContexts(overrides, rootContext);
    const ctx = contexts.get("ctx-1")!;

    expect(ctx.variables.size).toBe(2);
    expect(ctx.variables.get("x")?.data.value).toBe(42);
    expect(ctx.variables.get("x")?.isEnv).toBe(true);
    expect(ctx.variables.get("y")?.data.value).toBe("hello");
    expect(ctx.variables.get("y")?.reference?.name).toBe("yRef");
  });

  it("hydrates narrowedTypes when present", () => {
    const rootContext = createHydrationBaseContext();
    const narrowedData = createData({ value: 99 });

    const overrides: [string, WorkerContext][] = [
      [
        "ctx-1",
        {
          scopeId: "scope-1",
          variables: [],
          narrowedTypes: [["key", { data: narrowedData }]],
        },
      ],
    ];

    const contexts = hydrateContexts(overrides, rootContext);
    const ctx = contexts.get("ctx-1")!;

    expect(ctx.narrowedTypes).toBeDefined();
    expect(ctx.narrowedTypes!.size).toBe(1);
    expect(ctx.narrowedTypes!.get("key")?.data.value).toBe(99);
  });

  it("leaves narrowedTypes undefined when not present in override", () => {
    const rootContext = createHydrationBaseContext();
    const overrides: [string, WorkerContext][] = [
      [
        "ctx-1",
        {
          scopeId: "scope-1",
          variables: [],
        },
      ],
    ];

    const contexts = hydrateContexts(overrides, rootContext);
    const ctx = contexts.get("ctx-1")!;

    expect(ctx.narrowedTypes).toBeUndefined();
  });

  it("preserves skipExecution, expectedType, and enforceExpectedType", () => {
    const rootContext = createHydrationBaseContext();
    const overrides: [string, WorkerContext][] = [
      [
        "ctx-1",
        {
          scopeId: "scope-1",
          variables: [],
          skipExecution: { reason: "Unreachable branch", kind: "unreachable" },
          expectedType: { kind: "string" },
          enforceExpectedType: true,
        },
      ],
    ];

    const contexts = hydrateContexts(overrides, rootContext);
    const ctx = contexts.get("ctx-1")!;

    expect(ctx.skipExecution?.kind).toBe("unreachable");
    expect(ctx.skipExecution?.reason).toBe("Unreachable branch");
    expect(ctx.expectedType?.kind).toBe("string");
    expect(ctx.enforceExpectedType).toBe(true);
  });

  it("preserves callDepth and maxCallDepth", () => {
    const rootContext = createHydrationBaseContext();
    const overrides: [string, WorkerContext][] = [
      [
        "ctx-1",
        {
          scopeId: "scope-1",
          variables: [],
          callDepth: 5,
          maxCallDepth: 250,
        },
      ],
    ];

    const contexts = hydrateContexts(overrides, rootContext);
    const ctx = contexts.get("ctx-1")!;

    expect(ctx.callDepth).toBe(5);
    expect(ctx.maxCallDepth).toBe(250);
  });

  it("preserves controlFlowState", () => {
    const rootContext = createHydrationBaseContext();
    const returnedData = createData({ value: "done" });

    const overrides: [string, WorkerContext][] = [
      [
        "ctx-1",
        {
          scopeId: "scope-1",
          variables: [],
          controlFlowState: { returned: returnedData },
        },
      ],
    ];

    const contexts = hydrateContexts(overrides, rootContext);
    const ctx = contexts.get("ctx-1")!;

    expect(ctx.controlFlowState?.returned?.value).toBe("done");
  });

  it("returns an empty map for empty overrides", () => {
    const rootContext = createHydrationBaseContext();
    const contexts = hydrateContexts([], rootContext);

    expect(contexts.size).toBe(0);
  });
});

describe("createExecutionVariablesFromData", () => {
  it("returns an empty Map when given no files and no env vars", () => {
    const variables = createExecutionVariables([], []);
    expect(variables.size).toBe(0);
  });

  it("creates variables from operation files", () => {
    const file: ProjectFile = {
      id: "file-1",
      name: "myOp",
      type: "operation",
      content: {
        type: {
          kind: "operation",
          parameters: [{ name: "x", type: { kind: "number" } }],
          result: { kind: "number" },
        },
        value: {
          parameters: [createStatement({ data: createData() })],
          statements: [],
        },
      },
      createdAt: Date.now(),
    };

    const variables = createExecutionVariables([file], []);

    expect(variables.size).toBe(1);
    expect(variables.has("myOp")).toBe(true);
    expect(variables.get("myOp")?.data.type.kind).toBe("operation");
  });

  it("creates env variables marked with isEnv: true", () => {
    const envVars = [
      { key: "API_URL", value: "https://example.com" },
      { key: "SECRET", value: "abc123" },
    ];

    const variables = createExecutionVariables([], envVars);

    expect(variables.size).toBe(2);
    expect(variables.get("API_URL")?.data.value).toBe("https://example.com");
    expect(variables.get("API_URL")?.isEnv).toBe(true);
    expect(variables.get("SECRET")?.data.value).toBe("abc123");
    expect(variables.get("SECRET")?.isEnv).toBe(true);
  });

  it("combines file variables and env variables", () => {
    const file: ProjectFile = {
      id: "file-1",
      name: "myOp",
      type: "operation",
      content: {
        type: {
          kind: "operation",
          parameters: [],
          result: { kind: "string" },
        },
        value: {
          parameters: [],
          statements: [],
        },
      },
      createdAt: Date.now(),
    };

    const envVars = [{ key: "NODE_ENV", value: "production" }];

    const variables = createExecutionVariables([file], envVars);

    expect(variables.size).toBe(2);
    expect(variables.has("myOp")).toBe(true);
    expect(variables.has("NODE_ENV")).toBe(true);
    expect(variables.get("NODE_ENV")?.isEnv).toBe(true);
  });
});

describe("runExecutionInWorker", () => {
  let workers: MockWorker[];
  let workerCount: number;
  let executionWorkerClient: {
    run: (request: ReturnType<typeof makeRequest>) => Promise<{
      results: Map<string, ExecutionResult>;
      workerContexts: [string, WorkerContext][];
    }>;
    cancel: () => void;
    reset: () => void;
  };

  class MockWorker {
    onmessage?: (e: MessageEvent<ExecutionWorkerResponse>) => void;
    onerror?: (e: ErrorEvent) => void;
    messages: unknown[] = [];
    terminated = false;

    constructor() {
      workerCount++;
      workers.push(this);
    }

    postMessage(message: unknown) {
      this.messages.push(message);
    }

    terminate() {
      this.terminated = true;
    }
  }

  const makeRequest = () => ({
    operation: createData({
      type: {
        kind: "operation" as const,
        parameters: [],
        result: { kind: "undefined" as const },
      },
      value: { parameters: [], statements: [] },
    }),
    files: [] as ProjectFile[],
    envVariables: [],
    cachedResults: [],
  });

  const respondToWorker = (
    w: MockWorker,
    runId: string,
    overrides: Partial<ExecutionWorkerResponse> = {}
  ) => {
    w.onmessage?.({
      data: {
        runId,
        results: [],
        workerContexts: [],
        ...overrides,
      },
    } as unknown as MessageEvent<ExecutionWorkerResponse>);
  };

  beforeEach(async () => {
    workers = [];
    workerCount = 0;

    vi.stubGlobal("Worker", MockWorker);

    const mod = await import("./worker-client");
    executionWorkerClient = mod.executionWorkerClient;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("posts a run message to a new worker", async () => {
    const request = makeRequest();
    const promise = executionWorkerClient.run(request);
    await Promise.resolve();

    expect(workerCount).toBe(1);
    expect(workers[0].messages).toHaveLength(1);
    expect(workers[0].messages[0]).toEqual(
      expect.objectContaining({ type: "run" })
    );

    void promise.catch(() => undefined);
  });

  it("resolves with results and workerContexts on successful completion", async () => {
    const request = makeRequest();
    const promise = executionWorkerClient.run(request);
    await Promise.resolve();

    const firstRunId = (workers[0].messages[0] as { runId: string }).runId;
    respondToWorker(workers[0], firstRunId, {
      results: [],
      workerContexts: [["ctx-a", { scopeId: "a", variables: [] }]],
    });

    const result = await promise;
    expect(result.results).toBeInstanceOf(Map);
    expect(result.workerContexts).toHaveLength(1);
    expect(result.workerContexts[0][0]).toBe("ctx-a");
  });

  it("reuses the worker after a run completes", async () => {
    const first = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    const worker = workers[0];
    const firstRunId = (worker.messages[0] as { runId: string }).runId;
    respondToWorker(worker, firstRunId);
    await first;

    const second = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    expect(workerCount).toBe(1);
    expect(worker.terminated).toBe(false);
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1]).toEqual(
      expect.objectContaining({ type: "run" })
    );

    void second.catch(() => undefined);
  });

  it("terminates the active worker and starts a new run when called while active", async () => {
    const first = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    const firstWorker = workers[0];
    expect(workerCount).toBe(1);
    expect(firstWorker.messages).toHaveLength(1);

    const second = executionWorkerClient.run(makeRequest());
    await Promise.resolve();
    await Promise.resolve();

    expect(firstWorker.terminated).toBe(true);
    await expect(first).rejects.toThrow("Execution cancelled");

    expect(workerCount).toBe(2);
    const secondWorker = workers[1];
    expect(secondWorker.terminated).toBe(false);
    expect(secondWorker.messages).toHaveLength(1);
    expect(secondWorker.messages[0]).toEqual(
      expect.objectContaining({ type: "run" })
    );

    void second.catch(() => undefined);
  });

  it("cancel terminates the worker and rejects the active promise", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    executionWorkerClient.cancel();

    expect(workers[0].terminated).toBe(true);
    await expect(promise).rejects.toThrow("Execution cancelled");
  });

  it("cancel keeps an idle worker alive", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    const worker = workers[0];
    const firstRunId = (worker.messages[0] as { runId: string }).runId;
    respondToWorker(worker, firstRunId);
    await promise;

    executionWorkerClient.cancel();

    expect(workerCount).toBe(1);
    expect(worker.terminated).toBe(false);
  });

  it("reset terminates the worker and rejects the active promise", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    executionWorkerClient.reset();

    expect(workers[0].terminated).toBe(true);
    await expect(promise).rejects.toThrow("Execution cancelled");
  });

  it("callbacks arriving after terminate are ignored", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    const firstRunId = (workers[0].messages[0] as { runId: string }).runId;
    executionWorkerClient.cancel();

    respondToWorker(workers[0], firstRunId, { results: [] });

    await expect(promise).rejects.toThrow("Execution cancelled");
  });

  it("rejects when the worker completes with an error", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    const firstRunId = (workers[0].messages[0] as { runId: string }).runId;
    respondToWorker(workers[0], firstRunId, { error: "Something broke" });

    await expect(promise).rejects.toThrow("Something broke");
  });

  it("rejects when cancelled by the worker", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    const firstRunId = (workers[0].messages[0] as { runId: string }).runId;
    respondToWorker(workers[0], firstRunId, { cancelled: true });

    await expect(promise).rejects.toThrow("Execution cancelled");
  });
});
