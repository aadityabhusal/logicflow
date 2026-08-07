import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  createAgentDiscovery: vi.fn(),
  createProviderModel: vi.fn(() => ({ model: true })),
  toAgentTransportError: vi.fn(() => new Error("Normalized provider error")),
  discovery: {
    getProjectOutline: vi.fn(),
    inspectOperation: vi.fn(),
    searchOperations: vi.fn(),
    describeOperations: vi.fn(),
    searchPackages: vi.fn(),
    resolveOperationHandle: vi.fn(),
    updateProposedState: vi.fn(),
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
  createAgentDiscovery: mocks.createAgentDiscovery,
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
import {
  getAgentEditableFingerprint,
  getAgentHistoryState,
  type AgentProposal,
} from "./proposal";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAgentDiscovery.mockResolvedValue(mocks.discovery);
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
          set_package_enabled: expect.any(Object),
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
    mocks.discovery.resolveOperationHandle.mockReturnValue({
      source: "project",
      fileId: file.id,
    });
    let toolResult: unknown;
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {
        const execute = mocks.streamText.mock.calls[0][0].tools.update_proposal
          .execute as (draft: unknown) => Promise<unknown>;
        toolResult = await execute({
          action: "replace",
          operationHandle: "target-handle",
          draft: {
            name: "target",
            parameters: [],
            statements: [],
          },
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

    expect(mocks.discovery.resolveOperationHandle).toHaveBeenCalledWith(
      "target-handle"
    );

    expect(toolResult).toMatchObject({ valid: true, diagnostics: [] });
    expect(result.proposal).toMatchObject({
      projectId: project.id,
      fileId: file.id,
    });
    expect(file.content.value.statements).toEqual([]);
  });

  it("seeds revisions with the pending progressive proposal state", async () => {
    const anchor = createOperationFile("anchor");
    const helper = createOperationFile("helper");
    const project = createTestProject({ files: [anchor] });
    const proposedState = getAgentHistoryState({
      ...project,
      files: [anchor, helper],
      dependencies: {
        npm: [{ name: "wretch", version: "latest", exports: [] }],
      },
    });
    const initialProposal: AgentProposal = {
      id: "pending-proposal",
      projectId: project.id,
      fileId: anchor.id,
      baseFingerprint: getAgentEditableFingerprint(project),
      sourcePrompt: "Original request",
      draft: { name: anchor.name, parameters: [], statements: [] },
      proposedState,
      diagnostics: [],
    };
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {
        const execute = mocks.streamText.mock.calls[0][0].tools
          .set_package_enabled.execute as (input: {
          name: string;
          enabled: boolean;
        }) => Promise<unknown>;
        await execute({ name: "dateFns", enabled: true });
        yield {};
      })(),
      output: Promise.resolve({ explanation: "Revised" }),
    });

    const result = await generateOperationProposal({
      operation: createOperationFromFile(anchor)!,
      project,
      initialProposal,
      userPrompt: "Also enable date-fns",
      model: "openai/gpt-5.1-codex",
      apiKey: "session-key",
    });

    expect(mocks.discovery.updateProposedState).toHaveBeenNthCalledWith(
      1,
      proposedState
    );
    expect(
      result.proposal?.proposedState?.operationFiles.map(
        ({ file }) => file.name
      )
    ).toEqual(["anchor", "helper"]);
    expect(
      result.proposal?.proposedState?.npmDependencies.map(({ name }) => name)
    ).toEqual(["wretch", "dateFns"]);
    expect(result.proposal?.review?.files).toMatchObject([
      { change: "create", operationName: "helper" },
    ]);
  });

  it.each([
    {
      name: "stale",
      change: (proposal: AgentProposal) => ({
        ...proposal,
        baseFingerprint: "stale-fingerprint",
      }),
      message: "Cannot revise proposal: proposal is stale",
    },
    {
      name: "mismatched",
      change: (proposal: AgentProposal) => ({
        ...proposal,
        fileId: "other-operation",
      }),
      message:
        "Cannot revise proposal: it does not belong to this project and operation",
    },
  ])(
    "rejects $name initial proposals before discovery",
    async ({ change, message }) => {
      const anchor = createOperationFile("anchor");
      const project = createTestProject({ files: [anchor] });
      const initialProposal: AgentProposal = {
        id: "pending-proposal",
        projectId: project.id,
        fileId: anchor.id,
        baseFingerprint: getAgentEditableFingerprint(project),
        sourcePrompt: "Original request",
        draft: { name: anchor.name, parameters: [], statements: [] },
        proposedState: getAgentHistoryState(project),
        diagnostics: [],
      };

      await expect(
        generateOperationProposal({
          operation: createOperationFromFile(anchor)!,
          project,
          initialProposal: change(initialProposal),
          userPrompt: "Revise it",
          model: "openai/gpt-5.1-codex",
          apiKey: "session-key",
        })
      ).rejects.toThrow(message);
      expect(mocks.createAgentDiscovery).not.toHaveBeenCalled();
      expect(mocks.discovery.updateProposedState).not.toHaveBeenCalled();
      expect(mocks.streamText).not.toHaveBeenCalled();
    }
  );

  it("revises invalid proposals from their last valid progressive state", async () => {
    const anchor = createOperationFile("anchor");
    const helper = createOperationFile("helper");
    const invalid = createOperationFile("invalidCandidate");
    const project = createTestProject({ files: [anchor] });
    const revisionState = getAgentHistoryState({
      ...project,
      files: [anchor, helper],
      dependencies: {
        npm: [{ name: "wretch", version: "latest", exports: [] }],
      },
    });
    const initialProposal: AgentProposal = {
      id: "invalid-proposal",
      projectId: project.id,
      fileId: anchor.id,
      baseFingerprint: getAgentEditableFingerprint(project),
      sourcePrompt: "Original request",
      draft: { name: "invalidCandidate", parameters: [], statements: [] },
      proposedState: getAgentHistoryState({
        ...project,
        files: [anchor, invalid],
      }),
      revisionState,
      diagnostics: [
        {
          code: "invalid_operation",
          severity: "error",
          message: "Invalid operation",
          repairable: true,
        },
      ],
    };
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {
        const execute = mocks.streamText.mock.calls[0][0].tools
          .set_package_enabled.execute as (input: {
          name: string;
          enabled: boolean;
        }) => Promise<unknown>;
        await execute({ name: "dateFns", enabled: true });
        yield {};
      })(),
      output: Promise.resolve({ explanation: "Repaired" }),
    });

    const result = await generateOperationProposal({
      operation: createOperationFromFile(anchor)!,
      project,
      initialProposal,
      userPrompt: "Repair it",
      model: "openai/gpt-5.1-codex",
      apiKey: "session-key",
    });

    expect(mocks.discovery.updateProposedState).toHaveBeenNthCalledWith(
      1,
      revisionState
    );
    expect(
      result.proposal?.proposedState?.operationFiles.map(
        ({ file }) => file.name
      )
    ).toEqual(["anchor", "helper"]);
    expect(
      result.proposal?.proposedState?.npmDependencies.map(({ name }) => name)
    ).toEqual(["wretch", "dateFns"]);
    expect(result.proposal?.revisionState).toEqual(
      result.proposal?.proposedState
    );
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

  it("exposes strict host-owned proposal and package tool inputs", async () => {
    const file = createOperationFile("target");
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {})(),
      output: Promise.resolve({ explanation: "" }),
    });
    await generateOperationProposal({
      operation: createOperationFromFile(file)!,
      project: createTestProject({ files: [file] }),
      userPrompt: "Change it",
      model: "openai/gpt-5.1-codex",
      apiKey: "session-key",
    });
    const tools = mocks.streamText.mock.calls[0][0].tools;

    expect(
      tools.update_proposal.inputSchema.safeParse({
        action: "create",
        draft: {
          id: "model-file-id",
          name: "created",
          parameters: [],
          statements: [],
        },
      }).success
    ).toBe(false);
    expect(
      tools.update_proposal.inputSchema.safeParse({
        name: "target",
        parameters: [],
        statements: [],
      }).success
    ).toBe(false);
    expect(
      tools.set_package_enabled.inputSchema.safeParse({
        name: "wretch",
        enabled: true,
        version: "model-version",
      }).success
    ).toBe(false);
    await expect(
      tools.set_package_enabled.execute({
        name: "arbitrary-package",
        enabled: true,
      })
    ).resolves.toEqual({
      error: {
        code: "unsupported_package",
        message: "Unsupported package: arbitrary-package",
      },
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
