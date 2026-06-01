import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateContexts } from "./worker-client";
import {
  Context,
  ExecutionResult,
  WorkerContext,
  ExecutionWorkerResponse,
} from "./types";
import { createData, createStatement } from "../utils";
import { ProjectFile } from "../types";
import { createExecutionVariables } from "../operations/built-in";
import { DebugFlowStep } from "../debugger/types";

function createHydrationBaseContext(): Context {
  const variables = new Map();
  const results = new Map<string, ExecutionResult>();
  const contexts = new Map<string, Context>();
  const instances = new Map();

  const base: Context = {
    scopeId: "_root_",
    variables,
    packageAliases: {},
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
          packageAliases: {},
          variables: [["x", { data: createData({ value: 42 }) }]],
          callDepth: 1,
          isIsolated: true,
        },
      ],
      [
        "ctx-2",
        {
          scopeId: "scope-2",
          packageAliases: {},
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
          packageAliases: {},
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

  it("marks hydrated contexts as partial when requested", () => {
    const rootContext = createHydrationBaseContext();
    const contexts = hydrateContexts(
      [["ctx-1", { scopeId: "scope-1", packageAliases: {}, variables: [] }]],
      rootContext,
      { isPartial: true }
    );

    expect(contexts.get("ctx-1")?.isPartial).toBe(true);
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
          packageAliases: {},
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
          packageAliases: {},
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
          packageAliases: {},
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
          packageAliases: {},
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
          packageAliases: {},
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
          packageAliases: {},
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
  it("includes built-in variables when given no files and no env vars", () => {
    const context = createHydrationBaseContext();
    const variables = createExecutionVariables(context, [], []);
    expect(variables.has("length")).toBe(true);
  });

  it("excludes non-referenceable built-ins from variables", () => {
    const context = createHydrationBaseContext();
    const variables = createExecutionVariables(context, [], []);

    expect(variables.has("call")).toBe(false);
    expect(variables.has("await")).toBe(false);
    expect(variables.has("and")).toBe(false);
    expect(variables.has("or")).toBe(false);
    expect(variables.has("thenElse")).toBe(false);
    expect(variables.has("getFullYear")).toBe(false);
    expect(variables.has("json")).toBe(false);
    expect(variables.has("getUrl")).toBe(false);
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

    const context = createHydrationBaseContext();
    const variables = createExecutionVariables(context, [file], []);

    expect(variables.has("myOp")).toBe(true);
    expect(variables.get("myOp")?.data.type.kind).toBe("operation");
  });

  it("lets operation files shadow built-in variables", () => {
    const file: ProjectFile = {
      id: "file-1",
      name: "length",
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

    const context = createHydrationBaseContext();
    const variables = createExecutionVariables(context, [file], []);

    expect(variables.get("length")?.data.id).toBe("file-1");
  });

  it("creates env variables marked with isEnv: true", () => {
    const envVars = [
      { key: "API_URL", value: "https://example.com" },
      { key: "SECRET", value: "abc123" },
    ];

    const context = createHydrationBaseContext();
    const variables = createExecutionVariables(context, [], envVars);

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

    const context = createHydrationBaseContext();
    const variables = createExecutionVariables(context, [file], envVars);

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
      flowSteps: DebugFlowStep[];
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
    overrides: Partial<ExecutionWorkerResponse> & { cancelled?: boolean } = {}
  ) => {
    const data = overrides.cancelled
      ? { type: "cancelled" as const, runId }
      : "error" in overrides && overrides.error
        ? { type: "error" as const, runId, error: overrides.error }
        : {
            type: "completed" as const,
            runId,
            results: [],
            workerContexts: [],
            flowSteps: [],
            ...overrides,
          };
    w.onmessage?.({ data } as MessageEvent<ExecutionWorkerResponse>);
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
      workerContexts: [
        ["ctx-a", { scopeId: "a", packageAliases: {}, variables: [] }],
      ],
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

  it("cancel sends a cancel message but keeps the worker alive", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();
    const worker = workers[0];
    const firstRunId = (worker.messages[0] as { runId: string }).runId;

    executionWorkerClient.cancel();

    expect(worker.terminated).toBe(false);
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1]).toEqual({ type: "cancel" });

    respondToWorker(worker, firstRunId, { cancelled: true });
    await expect(promise).rejects.toThrow("Execution cancelled");
  });

  it("cancel keeps an idle worker alive and sends nothing", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    const worker = workers[0];
    const firstRunId = (worker.messages[0] as { runId: string }).runId;
    respondToWorker(worker, firstRunId);
    await promise;

    const msgCount = worker.messages.length;
    executionWorkerClient.cancel();

    expect(workerCount).toBe(1);
    expect(worker.terminated).toBe(false);
    expect(worker.messages).toHaveLength(msgCount);
  });

  it(
    "run while active queues the latest pending and sends cancel",
    { timeout: 10000 },
    async () => {
      const first = executionWorkerClient.run(makeRequest());
      await Promise.resolve();
      await Promise.resolve();

      const worker = workers[0];
      const firstRunId = (worker.messages[0] as { runId: string }).runId;
      expect(worker.messages).toHaveLength(1);

      const second = executionWorkerClient.run(makeRequest());
      await Promise.resolve();
      await Promise.resolve();

      const third = executionWorkerClient.run(makeRequest());
      await Promise.resolve();
      await Promise.resolve();

      await expect(second).rejects.toThrow("Execution cancelled");

      expect(worker.terminated).toBe(false);
      expect(workerCount).toBe(1);

      const typeCancel = { type: "cancel" };
      expect(worker.messages[1]).toEqual(typeCancel);
      expect(worker.messages[2]).toEqual(typeCancel);

      respondToWorker(worker, firstRunId, { cancelled: true });
      await expect(first).rejects.toThrow("Execution cancelled");

      expect(worker.messages).toHaveLength(4);
      expect(worker.messages[3]).toEqual(
        expect.objectContaining({ type: "run" })
      );

      void third.catch(() => undefined);
    }
  );

  it("auto-starts pending run when active run completes successfully", async () => {
    const first = executionWorkerClient.run(makeRequest());
    await Promise.resolve();
    await Promise.resolve();

    const worker = workers[0];
    const firstRunId = (worker.messages[0] as { runId: string }).runId;

    const second = executionWorkerClient.run(makeRequest());
    await Promise.resolve();
    await Promise.resolve();

    respondToWorker(worker, firstRunId, {
      results: [],
      workerContexts: [
        ["ctx", { scopeId: "a", packageAliases: {}, variables: [] }],
      ],
    });
    await first;

    expect(worker.messages).toHaveLength(3);
    expect(worker.messages[2]).toEqual(
      expect.objectContaining({ type: "run" })
    );

    const secondRunId = (worker.messages[2] as { runId: string }).runId;
    respondToWorker(worker, secondRunId);
    await second;

    expect(worker.terminated).toBe(false);
    expect(workerCount).toBe(1);
  });

  it("auto-starts pending run when active run errors", async () => {
    const first = executionWorkerClient.run(makeRequest());
    await Promise.resolve();
    await Promise.resolve();

    const worker = workers[0];
    const firstRunId = (worker.messages[0] as { runId: string }).runId;

    const second = executionWorkerClient.run(makeRequest());
    await Promise.resolve();
    await Promise.resolve();

    respondToWorker(worker, firstRunId, { error: "Something broke" });
    await expect(first).rejects.toThrow("Something broke");

    expect(worker.messages).toHaveLength(3);
    expect(worker.messages[2]).toEqual(
      expect.objectContaining({ type: "run" })
    );

    void second.catch(() => undefined);
  });

  it("reset terminates the worker and rejects both active and pending", async () => {
    const first = executionWorkerClient.run(makeRequest());
    await Promise.resolve();
    await Promise.resolve();

    const second = executionWorkerClient.run(makeRequest());
    await Promise.resolve();
    await Promise.resolve();

    executionWorkerClient.reset();

    expect(workers[0].terminated).toBe(true);
    await expect(first).rejects.toThrow("Execution cancelled");
    await expect(second).rejects.toThrow("Execution cancelled");
  });

  it("callbacks arriving after reset are ignored", async () => {
    const promise = executionWorkerClient.run(makeRequest());
    await Promise.resolve();

    const firstRunId = (workers[0].messages[0] as { runId: string }).runId;
    executionWorkerClient.reset();

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
