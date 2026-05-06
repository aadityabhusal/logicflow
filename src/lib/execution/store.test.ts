import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("idb", () => ({
  openDB: () =>
    Promise.resolve({
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
    }),
}));

import { createData } from "../utils";
import { useExecutionResultsStore } from "./store";

describe("execution store cache invalidation", () => {
  beforeEach(() => {
    useExecutionResultsStore.getState().removeAll();
  });

  it("clears shouldCacheResult entries and memoized operation calls", () => {
    const cachedResult = createData({ value: 42 });

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

    const { results, contexts, instances, rootContext } =
      useExecutionResultsStore.getState();
    expect(results.size).toBe(0);
    expect(contexts.size).toBe(0);
    expect(instances.size).toBe(0);
    expect(rootContext.operationCache?.size).toBe(0);
  });
});
