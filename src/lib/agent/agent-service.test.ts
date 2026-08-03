import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  createProviderModel: vi.fn(() => ({ model: true })),
  toAgentTransportError: vi.fn(() => new Error("Normalized provider error")),
  operationToLLMFormat: vi.fn(() => ({
    mappedOperation: { id: "O1" },
    mappingContext: { reverseMap: new Map() },
  })),
}));

vi.mock("ai", () => ({
  streamText: mocks.streamText,
  Output: { object: vi.fn(() => ({ output: true })) },
  zodSchema: vi.fn(() => ({ schema: true })),
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
      })
    );
    expect(onPartialExplanation).toHaveBeenNthCalledWith(1, "Working");
    expect(onPartialExplanation).toHaveBeenNthCalledWith(2, "Finished");
    expect(result.response).toBe(output);
  });

  it("normalizes provider and stream failures", async () => {
    const providerError = new Error("raw provider detail");
    mocks.streamText.mockImplementation(() => {
      throw providerError;
    });

    await expect(
      generateOperationChanges({
        operation: {} as never,
        userPrompt: "Update it",
        model: "openai/gpt-5.1-codex",
        apiKey: "session-key",
      })
    ).rejects.toThrow("Normalized provider error");
    expect(mocks.toAgentTransportError).toHaveBeenCalledWith(providerError);
  });
});
