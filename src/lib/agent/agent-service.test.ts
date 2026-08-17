import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  createAgentDiscovery: vi.fn(),
  createAgentProposal: vi.fn(),
  isAgentProposalStale: vi.fn(() => false),
  createProviderModel: vi.fn(() => ({ model: true })),
  toAgentTransportError: vi.fn(() => new Error("Normalized provider error")),
  buildContextPrompt: vi.fn(() => "prompt"),
  buildRequestContext: vi.fn(() => "request context"),
  discovery: {
    buildContextSnapshot: vi.fn(() => ({ selectedOperation: true })),
    lookupOperations: vi.fn(),
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
  AgentOperationLookupSchema: { schema: true },
  createAgentDiscovery: mocks.createAgentDiscovery,
}));
vi.mock("./proposal", () => ({
  AgentOperationUpdateSchema: { schema: true },
  createAgentProposal: mocks.createAgentProposal,
  isAgentProposalStale: mocks.isAgentProposalStale,
}));
vi.mock("./transport", () => ({
  createProviderModel: mocks.createProviderModel,
  toAgentTransportError: mocks.toAgentTransportError,
}));
vi.mock("./prompts", () => ({
  LOGICFLOW_SYSTEM_PROMPT: "system",
  buildContextPrompt: mocks.buildContextPrompt,
  buildRequestContext: mocks.buildRequestContext,
}));

import { AgentDiscoveryError } from "./discovery";
import {
  generateOperationProposal,
  getExplicitDeploymentIntent,
} from "./agent-service";

const operation = { id: "operation-id" } as never;
const project = { id: "project-id" } as never;
const update = {
  explanation: "Updated",
  enablePackages: [],
  changes: [{ kind: "insert_statement" }],
};
const proposal = { id: "proposal-id", update, diagnostics: [] };

function mockStream(output = update) {
  mocks.streamText.mockReturnValue({
    partialOutputStream: (async function* () {})(),
    output: Promise.resolve(output),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAgentDiscovery.mockResolvedValue(mocks.discovery);
  mocks.createAgentProposal.mockResolvedValue(proposal);
});

describe("deployment intent", () => {
  it("detects only explicit non-negated deployment intent", () => {
    expect(getExplicitDeploymentIntent("Deploy this to Vercel")).toEqual({
      afterChanges: false,
    });
    expect(getExplicitDeploymentIntent("Do not deploy this")).toBeUndefined();
    expect(
      getExplicitDeploymentIntent("How do I deploy this?")
    ).toBeUndefined();
    expect(getExplicitDeploymentIntent("Start a deployment")).toEqual({
      afterChanges: false,
    });
    expect(getExplicitDeploymentIntent("Fix it and deploy")).toEqual({
      afterChanges: true,
    });
  });
});

describe("generateOperationProposal", () => {
  it("generates one native update without a lookup and builds one fresh proposal", async () => {
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {
        yield { explanation: "Working" };
        yield { explanation: "Updated" };
      })(),
      output: Promise.resolve(update),
    });
    const onPartialExplanation = vi.fn();
    const onProgress = vi.fn();
    const abortController = new AbortController();

    const result = await generateOperationProposal({
      operation,
      project,
      userPrompt: "Update it",
      model: "anthropic/claude-sonnet-5",
      apiKey: "session-key",
      thinkingLevel: "max",
      abortSignal: abortController.signal,
      onProgress,
      onPartialExplanation,
    });

    expect(mocks.createProviderModel).toHaveBeenCalledWith(
      "anthropic",
      "claude-sonnet-5",
      "session-key"
    );
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
        timeout: { stepMs: 60_000 },
        maxRetries: 0,
        stopWhen: { count: 2 },
        providerOptions: {
          anthropic: { thinking: { type: "adaptive" }, effort: "max" },
        },
      })
    );
    expect(Object.keys(mocks.streamText.mock.calls[0][0].tools)).toEqual([
      "lookup_operations",
    ]);
    expect(mocks.discovery.lookupOperations).not.toHaveBeenCalled();
    expect(mocks.createAgentProposal).toHaveBeenCalledOnce();
    expect(mocks.createAgentProposal).toHaveBeenCalledWith({
      project,
      fileId: "operation-id",
      sourcePrompt: "Update it",
      update,
    });
    expect(onPartialExplanation).toHaveBeenNthCalledWith(1, "Working");
    expect(onPartialExplanation).toHaveBeenNthCalledWith(2, "Updated");
    expect(onProgress.mock.calls.map(([label]) => label)).toEqual([
      "Reading project context",
      "Preparing an implementation",
    ]);
    expect(result).toEqual({ response: update, proposal });
  });

  it("includes prior conversation when continuing an unfinished request", async () => {
    mockStream();
    const conversation = [
      { role: "user" as const, content: "Calculate BMI" },
      { role: "assistant" as const, content: "What units should I use?" },
    ];

    await generateOperationProposal({
      operation,
      project,
      userPrompt: "Use kilograms and centimetres",
      conversation,
      model: "openai/gpt-5.6-sol",
      apiKey: "session-key",
    });

    expect(mocks.buildContextPrompt).toHaveBeenCalledWith(
      "Use kilograms and centimetres",
      { selectedOperation: true },
      undefined,
      conversation
    );
    expect(mocks.buildRequestContext).toHaveBeenCalledWith(
      "Use kilograms and centimetres",
      conversation
    );
    expect(mocks.createAgentProposal).toHaveBeenCalledWith(
      expect.objectContaining({ requestContext: "request context" })
    );
  });

  it("returns an explanation without proposal review for an empty update", async () => {
    const response = {
      explanation: "No supported operation is available",
      enablePackages: [],
      changes: [],
    };
    mockStream(response);

    const result = await generateOperationProposal({
      operation,
      project,
      userPrompt: "Update it",
      model: "openai/gpt-5.6-sol",
      apiKey: "session-key",
    });

    expect(mocks.createAgentProposal).not.toHaveBeenCalled();
    expect(result).toEqual({ response, proposal: undefined });
  });

  it("retries malformed structured output once", async () => {
    const malformed = {
      name: "AI_NoObjectGeneratedError",
      cause: {
        name: "AI_TypeValidationError",
        cause: {
          name: "ZodError",
          message: JSON.stringify([
            {
              path: ["changes", 1, "statement", "operations", 0, "value"],
              message: "Invalid input: expected object, received undefined",
            },
          ]),
        },
      },
    };
    mocks.streamText
      .mockReturnValueOnce({
        partialOutputStream: (async function* () {})(),
        output: Promise.reject(malformed),
      })
      .mockReturnValueOnce({
        partialOutputStream: (async function* () {})(),
        output: Promise.resolve(update),
      });

    await expect(
      generateOperationProposal({
        operation,
        project,
        userPrompt: "Extract the callback",
        model: "openai/gpt-5.6-sol",
        apiKey: "session-key",
      })
    ).resolves.toEqual({ response: update, proposal });

    expect(mocks.streamText).toHaveBeenCalledTimes(2);
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain(
      "previous response did not match the required schema"
    );
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain(
      "changes.1.statement.operations.0.value"
    );
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain(
      "operations: []"
    );
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain(
      "Reference value.id must be the referenced statement ID"
    );
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain(
      "only the remaining arguments"
    );
    expect(mocks.createAgentProposal).toHaveBeenCalledTimes(1);
  });

  it("repairs invalid statement targets with one fresh generation", async () => {
    const invalidProposal = {
      ...proposal,
      diagnostics: [
        {
          code: "invalid_statement_target",
          severity: "error",
          message: 'Statement target "nested-id" is not a root statement',
          repairable: true,
        },
      ],
    };
    mocks.createAgentProposal
      .mockResolvedValueOnce(invalidProposal)
      .mockResolvedValueOnce(proposal);
    mocks.streamText.mockImplementation(() => ({
      partialOutputStream: (async function* () {})(),
      output: Promise.resolve(update),
    }));

    await expect(
      generateOperationProposal({
        operation,
        project,
        userPrompt: "Extract the callback",
        model: "openai/gpt-5.6-sol",
        apiKey: "session-key",
      })
    ).resolves.toEqual({ response: update, proposal });

    expect(mocks.streamText).toHaveBeenCalledTimes(2);
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain("nested-id");
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain(
      "statementTargets"
    );
    expect(mocks.createAgentProposal).toHaveBeenCalledTimes(2);
  });

  it("repairs a parameter-only response for a request that requires logic", async () => {
    const incompleteProposal = {
      ...proposal,
      diagnostics: [
        {
          code: "incomplete_request",
          severity: "error" as const,
          message: "The requested body is missing",
          repairable: true,
        },
      ],
    };
    mocks.createAgentProposal
      .mockResolvedValueOnce(incompleteProposal)
      .mockResolvedValueOnce(proposal);
    mockStream();

    await expect(
      generateOperationProposal({
        operation,
        project,
        userPrompt: "Add the BMI calculation",
        model: "openai/gpt-5.6-sol",
        apiKey: "session-key",
      })
    ).resolves.toEqual({ response: update, proposal });

    expect(mocks.streamText).toHaveBeenCalledTimes(2);
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain(
      "previous update was incomplete"
    );
    expect(mocks.streamText.mock.calls[1][0].prompt).toContain(
      "complete body implementation"
    );
    expect(mocks.createAgentProposal).toHaveBeenCalledTimes(2);
  });

  it("bounds malformed structured output retries to one", async () => {
    const first = {
      name: "AI_NoObjectGeneratedError",
      cause: { name: "AI_TypeValidationError" },
    };
    const second = {
      name: "AI_NoObjectGeneratedError",
      cause: { name: "AI_JSONParseError" },
    };
    mocks.streamText
      .mockReturnValueOnce({
        partialOutputStream: (async function* () {})(),
        output: Promise.reject(first),
      })
      .mockReturnValueOnce({
        partialOutputStream: (async function* () {})(),
        output: Promise.reject(second),
      });

    await expect(
      generateOperationProposal({
        operation,
        project,
        userPrompt: "Extract the callback",
        model: "openai/gpt-5.6-sol",
        apiKey: "session-key",
      })
    ).rejects.toThrow("Normalized provider error");

    expect(mocks.streamText).toHaveBeenCalledTimes(2);
    expect(mocks.toAgentTransportError).toHaveBeenCalledWith(second);
  });

  it("allows one batched read-only lookup and then disables all tools", async () => {
    const lookup = [[{ name: "map", source: "builtin" }]];
    mocks.discovery.lookupOperations.mockResolvedValue(lookup);
    mockStream();
    const onProgress = vi.fn();
    await generateOperationProposal({
      operation,
      project,
      userPrompt: "Use map",
      model: "openai/gpt-5.6-sol",
      apiKey: "session-key",
      onProgress,
    });
    const options = mocks.streamText.mock.calls[0][0];
    const input = { requests: [{ query: "map" }, { query: "filter" }] };

    await expect(options.tools.lookup_operations.execute(input)).resolves.toBe(
      lookup
    );
    expect(onProgress).toHaveBeenCalledWith("Checking operation details");
    expect(mocks.discovery.lookupOperations).toHaveBeenCalledWith(input);
    expect(options.prepareStep({ instructions: "system" })).toMatchObject({
      activeTools: [],
      toolChoice: "none",
      instructions: expect.stringContaining("final structured update"),
    });
    expect(Object.keys(options.tools)).toEqual(["lookup_operations"]);
  });

  it("uses non-strict OpenAI output for the native schema", async () => {
    mockStream();

    await generateOperationProposal({
      operation,
      project,
      userPrompt: "Update it",
      model: "openai/gpt-5.6-sol",
      apiKey: "session-key",
      thinkingLevel: "high",
    });

    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          openai: {
            reasoningEffort: "high",
            strictJsonSchema: false,
          },
        },
      })
    );
  });

  it("prevents every repeated lookup regardless of input", async () => {
    mocks.discovery.lookupOperations.mockResolvedValue([]);
    mockStream();
    await generateOperationProposal({
      operation,
      project,
      userPrompt: "Update it",
      model: "openai/gpt-5.6-sol",
      apiKey: "session-key",
    });
    const execute =
      mocks.streamText.mock.calls[0][0].tools.lookup_operations.execute;
    await execute({ requests: [{ query: "map" }] });

    await expect(
      execute({ requests: [{ query: "entirely different" }] })
    ).resolves.toEqual({
      error: {
        code: "lookup_limit_reached",
        message: "Only one batched operation lookup is allowed",
      },
    });
    expect(mocks.discovery.lookupOperations).toHaveBeenCalledOnce();
  });

  it("returns bounded discovery errors without exposing another tool", async () => {
    mocks.discovery.lookupOperations.mockRejectedValue(
      new AgentDiscoveryError("unsupported_package", "Unsupported package: x")
    );
    mockStream();
    await generateOperationProposal({
      operation,
      project,
      userPrompt: "Use x",
      model: "openai/gpt-5.6-sol",
      apiKey: "session-key",
    });
    const execute =
      mocks.streamText.mock.calls[0][0].tools.lookup_operations.execute;

    await expect(
      execute({ requests: [{ query: "x", package: "x" }] })
    ).resolves.toEqual({
      error: {
        code: "unsupported_package",
        message: "Unsupported package: x",
      },
    });
  });

  it("validates revision ownership and staleness before discovery", async () => {
    const initialProposal = {
      projectId: "other-project",
      fileId: "operation-id",
    } as never;
    await expect(
      generateOperationProposal({
        operation,
        project,
        initialProposal,
        userPrompt: "Revise it",
        model: "openai/gpt-5.6-sol",
        apiKey: "session-key",
      })
    ).rejects.toThrow("does not belong");
    expect(mocks.createAgentDiscovery).not.toHaveBeenCalled();

    mocks.isAgentProposalStale.mockReturnValueOnce(true);
    await expect(
      generateOperationProposal({
        operation,
        project,
        initialProposal: {
          projectId: "project-id",
          fileId: "operation-id",
        } as never,
        userPrompt: "Revise it",
        model: "openai/gpt-5.6-sol",
        apiKey: "session-key",
      })
    ).rejects.toThrow("proposal is stale");
  });

  it("includes the prior native update in revision prompting but builds from final output", async () => {
    const previousUpdate = {
      explanation: "Before",
      enablePackages: [],
      changes: [],
    };
    mockStream(update);
    await generateOperationProposal({
      operation,
      project,
      initialProposal: {
        projectId: "project-id",
        fileId: "operation-id",
        update: previousUpdate,
      } as never,
      userPrompt: "Revise it",
      model: "openai/gpt-5.6-sol",
      apiKey: "session-key",
    });

    expect(mocks.buildContextPrompt).toHaveBeenCalledWith(
      "Revise it",
      { selectedOperation: true },
      previousUpdate
    );
    expect(mocks.createAgentProposal).toHaveBeenCalledWith(
      expect.objectContaining({ update })
    );
  });

  it("normalizes cancellation and provider failures", async () => {
    const abortController = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    abortController.abort();
    mocks.streamText.mockImplementation(() => {
      throw abortError;
    });

    await expect(
      generateOperationProposal({
        operation,
        project,
        userPrompt: "Update it",
        model: "openai/gpt-5.6-sol",
        apiKey: "session-key",
        abortSignal: abortController.signal,
      })
    ).rejects.toThrow("Normalized provider error");
    expect(mocks.toAgentTransportError).toHaveBeenCalledWith(abortError);

    const streamError = { name: "TimeoutError" };
    const wrapperError = new Error("No output generated");
    mocks.streamText.mockImplementation((options) => {
      options.onError({ error: streamError });
      return {
        partialOutputStream: {
          [Symbol.asyncIterator]: () => ({
            next: () => Promise.reject(wrapperError),
          }),
        },
        output: Promise.resolve(update),
      } as never;
    });
    await expect(
      generateOperationProposal({
        operation,
        project,
        userPrompt: "Update it",
        model: "openai/gpt-5.6-sol",
        apiKey: "session-key",
      })
    ).rejects.toThrow("Normalized provider error");
    expect(mocks.toAgentTransportError).toHaveBeenLastCalledWith(streamError);
  });
});
