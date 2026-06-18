import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("idb", () => ({
  openDB: () =>
    Promise.resolve({
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
    }),
}));

vi.mock("../store", () => ({
  useProjectStore: {
    getState: () => ({
      getCurrentProject: () => ({
        id: "test-project",
        name: "test",
        version: "1",
        createdAt: 1,
        files: [],
        dependencies: {
          npm: [
            {
              name: "rowguard",
              version: "latest",
              exports: [],
              namespace: "Rg",
            },
            { name: "wretch", version: "latest", exports: [] },
          ],
        },
      }),
      getCurrentFile: () => null,
    }),
  },
}));

import { createData } from "../utils";
import { getReservedNames, useExecutionResultsStore } from "./store";
import type { Context, Variable } from "./types";

describe("execution store cache invalidation", () => {
  beforeEach(() => {
    useExecutionResultsStore.getState().removeAll();
  });

  it("clears shouldCacheResult entries and memoized operation calls", () => {
    const cachedResult = createData({ value: 42 });
    const initialRunVersion = useExecutionResultsStore.getState().runVersion;

    useExecutionResultsStore.setState((state) => ({
      results: new Map([
        ["cached-fetch", { data: cachedResult, shouldCacheResult: true }],
      ]),
      contexts: new Map([["ctx", state.rootContext]]),
      instances: new Map(),
      rootContext: {
        ...state.rootContext,
        operationCache: new Map([["memo-key", cachedResult]]),
      },
    }));

    useExecutionResultsStore.getState().removeAll();

    const { results, contexts, instances, rootContext, runVersion } =
      useExecutionResultsStore.getState();
    expect(results.size).toBe(0);
    expect(contexts.size).toBe(0);
    expect(instances.size).toBe(0);
    expect(rootContext.operationCache?.size).toBe(0);
    expect(runVersion).toBe(initialRunVersion + 1);
  });

  it("clears cache for rerun without clearing execution contexts", () => {
    const cachedResult = createData({ value: 42 });
    const normalResult = createData({ value: "keep" });
    const state = useExecutionResultsStore.getState();
    const initialRunVersion = state.runVersion;

    useExecutionResultsStore.setState({
      results: new Map([
        ["cached-fetch", { data: cachedResult, shouldCacheResult: true }],
        ["normal-result", { data: normalResult }],
      ]),
      contexts: new Map([
        [
          "skipped-branch",
          {
            ...state.rootContext,
            skipExecution: {
              reason: "Unreachable branch",
              kind: "unreachable",
            },
          },
        ],
      ]),
      instances: new Map([
        ["instance", { instance: {}, type: { kind: "unknown" } }],
      ]),
      rootContext: {
        ...state.rootContext,
        operationCache: new Map([["memo-key", cachedResult]]),
      },
    });

    useExecutionResultsStore.getState().clearCache();

    const { results, contexts, instances, rootContext, runVersion } =
      useExecutionResultsStore.getState();
    expect(results.has("cached-fetch")).toBe(false);
    expect(results.get("normal-result")?.data).toBe(normalResult);
    expect(contexts.get("skipped-branch")?.skipExecution?.kind).toBe(
      "unreachable"
    );
    expect(instances.size).toBe(0);
    expect(rootContext.operationCache?.size).toBe(0);
    expect(runVersion).toBe(initialRunVersion + 1);
  });
});

describe("packageAliases in store lifecycle", () => {
  beforeEach(() => {
    useExecutionResultsStore.getState().removeAll();
  });

  it("recomputes packageAliases on removeAll from project dependencies", () => {
    useExecutionResultsStore.setState((state) => ({
      rootContext: {
        ...state.rootContext,
        packageAliases: { stale: "value" },
      },
    }));

    useExecutionResultsStore.getState().removeAll();

    const { rootContext } = useExecutionResultsStore.getState();
    expect(rootContext.packageAliases).toEqual({ rowguard: "Rg" });
  });

  it("recomputes packageAliases on clearCache from project dependencies", () => {
    useExecutionResultsStore.setState((state) => ({
      rootContext: {
        ...state.rootContext,
        packageAliases: { stale: "value" },
      },
    }));

    useExecutionResultsStore.getState().clearCache();

    const { rootContext } = useExecutionResultsStore.getState();
    expect(rootContext.packageAliases).toEqual({ rowguard: "Rg" });
  });

  it("initial rootContext has packageAliases from project dependencies", () => {
    const { rootContext } = useExecutionResultsStore.getState();
    expect(rootContext.packageAliases).toEqual({ rowguard: "Rg" });
  });
});

describe("getContext merges rootContext.packageAliases", () => {
  beforeEach(() => {
    useExecutionResultsStore.getState().removeAll();
  });

  it("returns rootContext directly when no context registered", () => {
    const { rootContext } = useExecutionResultsStore.getState();
    const ctx = useExecutionResultsStore.getState().getContext("nonexistent");
    expect(ctx).toBe(rootContext);
    expect(ctx.packageAliases).toEqual(rootContext.packageAliases);
  });

  it("returns registered context with root's packageAliases overwriting child's", () => {
    const state = useExecutionResultsStore.getState();
    const childContext: Context = {
      ...state.rootContext,
      scopeId: "child",
      packageAliases: { child: "override" },
      variables: new Map<string, Variable>([
        ["x", { data: createData({ type: { kind: "string" } }) }],
      ]),
    };

    useExecutionResultsStore.setState(() => ({
      contexts: new Map([["entity-1", childContext]]),
    }));

    const retrieved = useExecutionResultsStore
      .getState()
      .getContext("entity-1");

    expect(retrieved).not.toBe(state.rootContext);
    expect(retrieved.scopeId).toBe("child");
    expect(retrieved.packageAliases).toEqual({ rowguard: "Rg" });
    expect(retrieved.variables.has("x")).toBe(true);
  });

  it("returns rootContext when root packageAliases changes", () => {
    useExecutionResultsStore.setState((state) => ({
      rootContext: {
        ...state.rootContext,
        packageAliases: { custom: "val" },
      },
    }));

    const ctx = useExecutionResultsStore.getState().getContext("nonexistent");
    expect(ctx.packageAliases).toEqual({ custom: "val" });
  });
});

describe("execution store mutation helpers", () => {
  beforeEach(() => {
    useExecutionResultsStore.getState().removeAll();
  });

  it("does not overwrite an existing context with an isolated replacement", () => {
    const state = useExecutionResultsStore.getState();
    const original: Context = { ...state.rootContext, scopeId: "original" };
    const isolated: Context = {
      ...state.rootContext,
      scopeId: "isolated",
      isIsolated: true,
    };

    state.setContext("entity", original);
    state.setContext("entity", isolated);

    expect(
      useExecutionResultsStore.getState().getContext("entity").scopeId
    ).toBe("original");
  });

  it("removeResult removes result data and associated instance", () => {
    const data = createData({ value: 42 });
    useExecutionResultsStore.setState({
      results: new Map([["entity", { data }]]),
      instances: new Map([["entity", { instance: {}, type: data.type }]]),
    });

    useExecutionResultsStore.getState().removeResult("entity");

    expect(
      useExecutionResultsStore.getState().getResult("entity")
    ).toBeUndefined();
    expect(
      useExecutionResultsStore.getState().getInstance("entity")
    ).toBeUndefined();
  });
});

describe("getReservedNames", () => {
  it("includes operations, reserved keywords, data types, and variables", () => {
    const variables = new Map<string, Variable>([
      ["customVar", { data: createData({ value: 1 }) }],
    ]);
    const names = getReservedNames(variables);

    expect(names).toEqual(
      expect.arrayContaining([
        { kind: "operation", name: "length" },
        { kind: "reserved", name: "return" },
        { kind: "data-type", name: "string" },
        { kind: "variable", name: "customVar" },
      ])
    );
  });
});
