import { describe, expect, it } from "vitest";
import { createOperationFile, createTestProject } from "../../tests/helpers";
import { createAgentDiscovery } from "./discovery";
import { createData, createStatement } from "../utils";
import type { OperationType } from "../types";
import {
  createAgentProposal,
  getAgentEditableFingerprint,
  isAgentProposalStale,
  OperationDraftSchema,
} from "./proposal";

describe("agent proposal", () => {
  it("builds host-owned operation state and preserves file metadata", async () => {
    const file = createOperationFile("formatMessage");
    file.tags = ["public"];
    file.documentation = "Keep this documentation";
    file.tests = [];
    const project = createTestProject({ files: [file] });
    const discovery = await createAgentDiscovery(project, file.id);

    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Return the message",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: "formatMessage",
        parameters: [{ name: "message", type: { kind: "string" } }],
        statements: [
          {
            name: "result",
            value: { kind: "reference", name: "message" },
            return: true,
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    expect(proposal.proposedFile).toMatchObject({
      id: file.id,
      name: file.name,
      tags: ["public"],
      documentation: "Keep this documentation",
      tests: [],
    });
    const parameter = proposal.proposedFile!.content.value.parameters[0];
    const statement = proposal.proposedFile!.content.value.statements[0];
    expect(parameter.id).not.toBe(parameter.data.id);
    expect(statement.data).toMatchObject({
      type: { kind: "reference", name: "message" },
      value: { name: "message", id: parameter.id },
    });
    expect(proposal.review).toMatchObject({
      operationName: "formatMessage",
      generatedSyntax: "valid",
      parameters: { before: 0, after: 1 },
      statements: { before: 0, after: 1 },
    });
    expect(file.content.value.parameters).toEqual([]);
  });

  it("constructs catalog operation calls from scoped handles", async () => {
    const file = createOperationFile("getMessageLength");
    const project = createTestProject({ files: [file] });
    const discovery = await createAgentDiscovery(project, file.id);
    const operation = discovery.searchOperations({
      query: "stringifyJSON",
      inputType: { kind: "string" },
      source: "core",
    })[0];

    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Return the message length",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: file.name,
        parameters: [{ name: "message", type: { kind: "string" } }],
        statements: [
          {
            value: { kind: "reference", name: "message" },
            operations: [{ operationHandle: operation.handle, arguments: [] }],
            return: true,
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    expect(
      proposal.proposedFile?.content.value.statements[0].operations[0]
    ).toMatchObject({
      type: { result: { kind: "string" } },
      value: { name: "stringifyJSON", parameters: [] },
    });
    expect(proposal.proposedFile?.content.type.result).toEqual({
      kind: "string",
    });
  });

  it("returns explicit diagnostics for invalid drafts", async () => {
    const file = createOperationFile("target");
    const project = createTestProject({ files: [file] });

    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Change it",
      resolveOperation: () => {
        throw new Error("Unknown operation handle");
      },
      draft: {
        name: "renamed",
        parameters: [],
        statements: [
          { value: { kind: "reference", name: "missing" }, return: true },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_rename" }),
        expect.objectContaining({ code: "unresolved_reference" }),
      ])
    );
    expect(
      OperationDraftSchema.safeParse({
        id: "model-id",
        name: "target",
        parameters: [],
        statements: [],
      }).success
    ).toBe(false);

    const unreachable = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Return twice",
      resolveOperation: () => {
        throw new Error("Unused");
      },
      draft: {
        name: "target",
        parameters: [],
        statements: [
          { value: { kind: "string", value: "first" }, return: true },
          { value: { kind: "number", value: 2 }, return: true },
        ],
      },
    });
    expect(unreachable.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unreachable_statement" }),
      ])
    );
    expect(unreachable.proposedFile?.content.type.result).toEqual({
      kind: "string",
    });
  });

  it("rejects unrepresentable parameter chains", async () => {
    const file = createOperationFile("target");
    const parameter = createStatement({
      name: "value",
      data: createData({ type: { kind: "string" }, value: "default" }),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [{ type: { kind: "string" } }],
            result: { kind: "string" },
          },
          value: { name: "trim", parameters: [], statements: [] },
        }),
      ],
    });
    file.content.type.parameters = [
      { name: "value", type: { kind: "string" } },
    ];
    file.content.value.parameters = [parameter];
    const project = createTestProject({ files: [file] });

    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Change it",
      resolveOperation: () => {
        throw new Error("Unused");
      },
      draft: {
        name: "target",
        parameters: [{ name: "value", type: { kind: "string" } }],
        statements: [],
      },
    });

    expect(proposal.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_parameter_operations" }),
      ])
    );
    expect(proposal.review?.operationCalls).toEqual({ before: 1, after: 0 });
  });

  it("treats optional parameters as possibly undefined", async () => {
    const file = createOperationFile("target");
    const project = createTestProject({ files: [file] });

    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Use the optional value",
      resolveOperation: () => ({
        name: "strictStringOperation",
        source: "core",
        parameters: [{ type: { kind: "string" } }],
        resultType: { kind: "string" },
      }),
      draft: {
        name: "target",
        parameters: [
          { name: "value", type: { kind: "string" }, optional: true },
        ],
        statements: [
          {
            value: { kind: "reference", name: "value" },
            operations: [{ operationHandle: "strict", arguments: [] }],
            return: true,
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_chain_input" }),
      ])
    );
  });

  it("fingerprints all operation metadata and npm dependencies", async () => {
    const file = createOperationFile("target");
    const project = createTestProject({ files: [file] });
    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Change it",
      resolveOperation: () => {
        throw new Error("Unused");
      },
      draft: { name: "target", parameters: [], statements: [] },
    });
    const changed = structuredClone(project);
    const changedFile = changed.files[0];
    if (changedFile.type === "operation") changedFile.documentation = "Later";

    expect(proposal.baseFingerprint).toBe(getAgentEditableFingerprint(project));
    expect(isAgentProposalStale(proposal, project)).toBe(false);
    expect(isAgentProposalStale(proposal, changed)).toBe(true);
  });
});
