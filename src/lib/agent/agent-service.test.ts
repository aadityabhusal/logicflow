import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  createProviderModel: vi.fn(() => ({ model: true })),
  toAgentTransportError: vi.fn(() => new Error("Normalized provider error")),
  discovery: {
    getProjectOutline: vi.fn(),
    inspectOperation: vi.fn(),
    searchOperations: vi.fn(),
    describeOperations: vi.fn(),
    searchPackages: vi.fn(),
    resolveOperationHandle: vi.fn(),
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
  AgentDiscoveryError: class extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message);
    }
  },
  createAgentDiscovery: vi.fn(() => Promise.resolve(mocks.discovery)),
}));
vi.mock("./transport", () => ({
  createProviderModel: mocks.createProviderModel,
  toAgentTransportError: mocks.toAgentTransportError,
}));
vi.mock("./prompts", () => ({
  LOGICFLOW_SYSTEM_PROMPT: "system",
  buildContextPrompt: vi.fn(() => "prompt"),
}));

import { AgentDiscoveryError } from "./discovery";
import { generateOperationProposal } from "./agent-service";
import { createOperationFile, createTestProject } from "../../tests/helpers";
import { createOperationFromFile } from "../utils";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateOperationProposal transport lifecycle", () => {
  it("streams partial explanations and returns the validated output", async () => {
    const output = { explanation: "Finished" };
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {
        yield { explanation: "Working" };
        yield { explanation: "Finished" };
      })(),
      output: Promise.resolve(output),
    });
    const onPartialExplanation = vi.fn();
    const abortController = new AbortController();

    const result = await generateOperationProposal({
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
        stopWhen: { count: 12 },
        tools: expect.objectContaining({
          get_project_outline: expect.any(Object),
          inspect_operation: expect.any(Object),
          search_operations: expect.any(Object),
          describe_operations: expect.any(Object),
          search_packages: expect.any(Object),
          update_proposal: expect.any(Object),
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
      output: Promise.resolve({ explanation: "" }),
    });
    await generateOperationProposal({
      operation: {} as never,
      project: {} as never,
      userPrompt: "Update it",
      model: "openai/gpt-5.1-codex",
      apiKey: "session-key",
    });
    const execute = mocks.streamText.mock.calls[0][0].tools.get_project_outline
      .execute as () => Promise<unknown>;

    for (let index = 0; index < 24; index++) await execute();

    await expect(execute()).resolves.toEqual({
      error: {
        code: "tool_limit_reached",
        message: "Agent tool-call limit reached",
      },
    });
  });

  it("builds proposals only through update_proposal", async () => {
    const file = createOperationFile("target");
    const project = createTestProject({ files: [file] });
    let toolResult: unknown;
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {
        const execute = mocks.streamText.mock.calls[0][0].tools.update_proposal
          .execute as (draft: unknown) => Promise<unknown>;
        toolResult = await execute({
          name: "target",
          parameters: [],
          statements: [],
        });
        yield {};
      })(),
      output: Promise.resolve({ explanation: "Review it" }),
    });

    const result = await generateOperationProposal({
      operation: createOperationFromFile(file)!,
      project,
      userPrompt: "Clear it",
      model: "openai/gpt-5.1-codex",
      apiKey: "session-key",
    });

    expect(toolResult).toMatchObject({ valid: true, diagnostics: [] });
    expect(result.proposal).toMatchObject({
      projectId: project.id,
      fileId: file.id,
    });
    expect(file.content.value.statements).toEqual([]);
  });

  it("returns structured discovery handle errors to the model", async () => {
    mocks.discovery.inspectOperation.mockImplementation((handle: string) => {
      const stale = handle === "old-handle";
      throw new AgentDiscoveryError(
        stale ? "stale_handle" : "unknown_handle",
        stale ? "Obsolete handle" : "Unknown handle"
      );
    });
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {})(),
      output: Promise.resolve({ explanation: "" }),
    });
    await generateOperationProposal({
      operation: {} as never,
      project: {} as never,
      userPrompt: "Update it",
      model: "openai/gpt-5.1-codex",
      apiKey: "session-key",
    });
    const execute = mocks.streamText.mock.calls[0][0].tools.inspect_operation
      .execute as (input: { handle: string }) => Promise<unknown>;

    await expect(execute({ handle: "old-handle" })).resolves.toEqual({
      error: { code: "stale_handle", message: "Obsolete handle" },
    });
    await expect(execute({ handle: "invalid" })).resolves.toEqual({
      error: { code: "unknown_handle", message: "Unknown handle" },
    });
  });

  it("normalizes provider and stream failures", async () => {
    const providerError = new Error("raw provider detail");
    mocks.streamText.mockImplementation(() => {
      throw providerError;
    });

    await expect(
      generateOperationProposal({
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
