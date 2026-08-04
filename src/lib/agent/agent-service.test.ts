import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  createProviderModel: vi.fn(() => ({ model: true })),
  toAgentTransportError: vi.fn(() => new Error("Normalized provider error")),
  operationToLLMFormat: vi.fn(() => ({
    mappedOperation: { id: "O1" },
    mappingContext: { reverseMap: new Map() },
  })),
  discovery: {
    getProjectOutline: vi.fn(),
    inspectOperation: vi.fn(),
    searchOperations: vi.fn(),
    describeOperations: vi.fn(),
    searchPackages: vi.fn(),
  },
}));

vi.mock("ai", () => ({
  streamText: mocks.streamText,
  Output: { object: vi.fn(() => ({ output: true })) },
  stepCountIs: vi.fn((count) => ({ count })),
  tool: vi.fn((definition) => definition),
  zodSchema: vi.fn(() => ({ schema: true })),
}));
vi.mock("./discovery", () => ({
  AgentDiscoveryError: class extends Error {},
  createAgentDiscovery: vi.fn(() => Promise.resolve(mocks.discovery)),
}));
vi.mock("./transport", () => ({
  createProviderModel: mocks.createProviderModel,
  toAgentTransportError: mocks.toAgentTransportError,
}));
vi.mock("./entity-mapper", () => ({
  operationToLLMFormat: mocks.operationToLLMFormat,
}));
vi.mock("./prompts", () => ({
  LOGICFLOW_SYSTEM_PROMPT: "system",
  buildContextPrompt: vi.fn(() => "prompt"),
}));

import { generateOperationChanges } from "./agent-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateOperationChanges transport lifecycle", () => {
  it("streams partial explanations and returns the validated output", async () => {
    const output = { explanation: "Finished", changes: [] };
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {
        yield { explanation: "Working" };
        yield { explanation: "Finished" };
      })(),
      output: Promise.resolve(output),
    });
    const onPartialExplanation = vi.fn();
    const abortController = new AbortController();

    const result = await generateOperationChanges({
      operation: {} as never,
      project: {} as never,
      userPrompt: "Update it",
      model: "anthropic/claude-sonnet-4-5",
      apiKey: "session-key",
      abortSignal: abortController.signal,
      onPartialExplanation,
    });

    expect(mocks.createProviderModel).toHaveBeenCalledWith(
      "anthropic",
      "claude-sonnet-4-5",
      "session-key"
    );
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
        timeout: 60_000,
        maxRetries: 0,
        stopWhen: { count: 8 },
        tools: expect.objectContaining({
          get_project_outline: expect.any(Object),
          inspect_operation: expect.any(Object),
          search_operations: expect.any(Object),
          describe_operations: expect.any(Object),
          search_packages: expect.any(Object),
        }),
      })
    );
    expect(onPartialExplanation).toHaveBeenNthCalledWith(1, "Working");
    expect(onPartialExplanation).toHaveBeenNthCalledWith(2, "Finished");
    expect(result.response).toBe(output);

    const options = mocks.streamText.mock.calls[0][0];
    await options.tools.search_operations.execute({
      inputType: { kind: "array", elementType: { kind: "string" } },
    });
    expect(mocks.discovery.searchOperations).toHaveBeenCalledWith({
      inputType: { kind: "array", elementType: { kind: "string" } },
      resultType: undefined,
      query: undefined,
      source: undefined,
      limit: undefined,
    });
  });

  it("bounds discovery calls across the run", async () => {
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {})(),
      output: Promise.resolve({ explanation: "", changes: [] }),
    });
    await generateOperationChanges({
      operation: {} as never,
      project: {} as never,
      userPrompt: "Update it",
      model: "openai/gpt-5.1-codex",
      apiKey: "session-key",
    });
    const execute = mocks.streamText.mock.calls[0][0].tools.get_project_outline
      .execute as () => Promise<unknown>;

    for (let index = 0; index < 20; index++) await execute();

    await expect(execute()).resolves.toEqual({
      error: {
        code: "tool_limit_reached",
        message: "Discovery tool-call limit reached",
      },
    });
  });

  it("normalizes provider and stream failures", async () => {
    const providerError = new Error("raw provider detail");
    mocks.streamText.mockImplementation(() => {
      throw providerError;
    });

    await expect(
      generateOperationChanges({
        operation: {} as never,
        project: {} as never,
        userPrompt: "Update it",
        model: "openai/gpt-5.1-codex",
        apiKey: "session-key",
      })
    ).rejects.toThrow("Normalized provider error");
    expect(mocks.toAgentTransportError).toHaveBeenCalledWith(providerError);
  });
});
