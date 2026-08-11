import { describe, expect, it } from "vitest";
import {
  createOperationFile,
  createTestProject,
  testArray,
  testCondition,
  testObject,
  testOperation,
} from "../../tests/helpers";
import { createAgentDiscovery } from "./discovery";
import { createData, createStatement } from "../utils";
import type { DataType, OperationType, ProjectFile } from "../types";
import {
  createAgentPackageProposal,
  createAgentProposal,
  deleteAgentOperationProposal,
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

  it("counts operation calls recursively through nested statement schemas", async () => {
    const call = () =>
      createData<OperationType>({
        type: {
          kind: "operation",
          parameters: [],
          result: { kind: "undefined" },
        },
        value: { name: "call", parameters: [], statements: [] },
      });
    const calledStatement = () =>
      createStatement({ data: createData(), operations: [call()] });
    const argument = calledStatement();
    const callback = createStatement({
      data: testOperation([], [calledStatement()]),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [{ type: { kind: "undefined" } }],
            result: { kind: "undefined" },
          },
          value: { name: "call", parameters: [argument], statements: [] },
        }),
      ],
    });
    const file = createOperationFile("nestedCalls");
    file.content.value.statements = [
      createStatement({
        data: testArray([
          createStatement({
            data: testObject([
              {
                key: "nested",
                value: createStatement({
                  data: testCondition(calledStatement(), [callback], []),
                }),
              },
            ]),
          }),
        ]),
      }),
    ];
    const project = createTestProject({ files: [file] });

    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Clear nested calls",
      resolveOperation: () => {
        throw new Error("Unused");
      },
      draft: { name: file.name, parameters: [], statements: [] },
    });

    expect(proposal.review?.operationCalls).toEqual({ before: 4, after: 0 });
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

  it("creates host-owned operations that later calls can discover and reference", async () => {
    const anchor = createOperationFile("anchor");
    const project = createTestProject({ files: [anchor] });
    const discovery = await createAgentDiscovery(project, anchor.id);
    const created = await createAgentProposal({
      project,
      anchorFileId: anchor.id,
      create: true,
      sourcePrompt: "Add a helper",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: "helper",
        parameters: [],
        statements: [{ value: { kind: "string", value: "ok" }, return: true }],
      },
    });

    expect(created.diagnostics).toEqual([]);
    expect(created.proposedFile?.id).not.toBe(anchor.id);
    expect(created.proposedFile?.id).not.toBe("model-id");
    await discovery.updateProposedState(created.proposedState!);
    const helper = discovery.searchOperations({
      query: "helper",
      source: "project",
    })[0];
    expect(helper.handle).toMatch(/^operation_/);

    const caller = await createAgentProposal({
      project,
      anchorFileId: anchor.id,
      previousState: created.proposedState,
      create: true,
      sourcePrompt: "Add a caller",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: "caller",
        parameters: [],
        statements: [
          {
            value: { kind: "reference", name: "helper" },
            operations: [{ operationHandle: helper.handle, arguments: [] }],
            return: true,
          },
        ],
      },
    });

    expect(caller.diagnostics).toEqual([]);
    expect(
      caller.proposedState?.operationFiles.map(({ file }) => file.name)
    ).toEqual(["anchor", "helper", "caller"]);
    const helperFile = caller.proposedState?.operationFiles.find(
      ({ file }) => file.name === "helper"
    )!.file;
    const callerFile = caller.proposedState?.operationFiles.find(
      ({ file }) => file.name === "caller"
    )!.file;
    expect(callerFile?.content.value.statements[0].data.value).toMatchObject({
      name: "helper",
      id: helperFile?.id,
    });
  });

  it("accepts a project helper operation as a filter predicate", async () => {
    const anchor = createOperationFile("anchor");
    const predicate = createOperationFile("isEven");
    predicate.content.type = {
      kind: "operation",
      parameters: [{ name: "item", type: { kind: "number" } }],
      result: { kind: "boolean" },
    };
    const project = createTestProject({ files: [anchor, predicate] });
    const discovery = await createAgentDiscovery(project, anchor.id);
    const filter = discovery.searchOperations({
      query: "filter",
      inputType: { kind: "array", elementType: { kind: "number" } },
    })[0];

    const proposal = await createAgentProposal({
      project,
      fileId: anchor.id,
      sourcePrompt: "Keep even numbers",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: "anchor",
        parameters: [],
        statements: [
          {
            value: {
              kind: "array",
              items: [
                { kind: "number", value: 1 },
                { kind: "number", value: 2 },
              ],
            },
            operations: [
              {
                operationHandle: filter.handle,
                arguments: [{ kind: "reference", name: "isEven" }],
              },
            ],
            return: true,
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    expect(proposal.proposedFile?.content.type.result).toMatchObject({
      kind: "union",
      types: expect.arrayContaining([
        { kind: "array", elementType: { kind: "number" } },
      ]),
    });
  });

  it("propagates a renamed signature and result type into stable-ID callers", async () => {
    const helper = createOperationFile("helper");
    helper.content.type.result = { kind: "number" };
    const caller = createOperationFile("caller");
    caller.content.value.statements = [
      createStatement({
        data: createData({
          type: { kind: "reference", name: "helper" },
          value: { name: "helper", id: helper.id },
        }),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [{ type: helper.content.type }],
              result: { kind: "number" },
            },
            value: { name: "call", parameters: [], statements: [] },
          }),
        ],
      }),
    ];
    const project = createTestProject({ files: [helper, caller] });
    const discovery = await createAgentDiscovery(project, caller.id);
    const proposal = await createAgentProposal({
      project,
      anchorFileId: caller.id,
      fileId: helper.id,
      sourcePrompt: "Rename and change the signature",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: "formatHelper",
        parameters: [{ name: "value", type: { kind: "string" } }],
        statements: [
          {
            value: { kind: "reference", name: "value" },
            return: true,
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    const updatedCaller = proposal.proposedState?.operationFiles.find(
      ({ file }) => file.id === caller.id
    )!.file;
    const statement = updatedCaller?.content.value.statements[0];
    expect(statement?.data.value).toMatchObject({
      name: "formatHelper",
      id: helper.id,
    });
    expect(statement?.operations[0]).toMatchObject({
      type: { result: { kind: "string" } },
      value: { name: "call" },
    });
    expect(statement?.operations[0].value.parameters).toHaveLength(1);
    expect(proposal.review?.files?.map((file) => file.operationName)).toEqual([
      "formatHelper",
      "caller",
    ]);
  });

  it("propagates changed result types through transitive callers", async () => {
    const helper = createOperationFile("helper");
    helper.content.type.result = { kind: "number" };
    const createCaller = (name: string, target: typeof helper) => {
      const caller = createOperationFile(name);
      caller.content.type.result = { kind: "number" };
      caller.content.value.statements = [
        createStatement({
          data: createData({
            type: { kind: "reference", name: target.name },
            value: { name: target.name, id: target.id },
          }),
          operations: [
            createData<OperationType>({
              type: {
                kind: "operation",
                parameters: [{ type: target.content.type }],
                result: { kind: "number" },
              },
              value: { name: "call", parameters: [], statements: [] },
            }),
          ],
        }),
      ];
      return caller;
    };
    const middle = createCaller("middle", helper);
    const outer = createCaller("outer", middle);
    const project = createTestProject({ files: [helper, middle, outer] });
    const discovery = await createAgentDiscovery(project, outer.id);

    const proposal = await createAgentProposal({
      project,
      anchorFileId: outer.id,
      fileId: helper.id,
      sourcePrompt: "Change helper result",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: "helper",
        parameters: [],
        statements: [
          { value: { kind: "string", value: "changed" }, return: true },
        ],
      },
    });

    const updatedOuter = proposal.proposedState!.operationFiles.find(
      ({ file }) => file.id === outer.id
    )!.file;
    expect(
      updatedOuter.content.value.statements[0].operations[0].type.result
    ).toEqual({
      kind: "string",
    });
    expect(
      proposal.review?.files?.map(({ operationName }) => operationName)
    ).toEqual(["helper", "middle", "outer"]);
  });

  it("blocks referenced deletes and safely deletes unreferenced operations", () => {
    const target = createOperationFile("target");
    const caller = createOperationFile("caller");
    caller.content.value.statements = [
      createStatement({
        data: createData({
          type: { kind: "reference", name: "target" },
          value: { name: "target", id: target.id },
        }),
      }),
    ];
    const project = createTestProject({ files: [target, caller] });
    const blocked = deleteAgentOperationProposal({
      project,
      anchorFileId: caller.id,
      fileId: target.id,
      sourcePrompt: "Delete target",
    });
    expect(blocked.diagnostics).toEqual([
      expect.objectContaining({
        code: "operation_in_use",
        message: "Cannot delete target; referenced by caller",
      }),
    ]);

    caller.content.value.statements = [];
    const deleted = deleteAgentOperationProposal({
      project,
      anchorFileId: caller.id,
      fileId: target.id,
      sourcePrompt: "Delete target",
    });
    expect(deleted.diagnostics).toEqual([]);
    expect(
      deleted.proposedState?.operationFiles.map(({ file }) => file.name)
    ).toEqual(["caller"]);
    expect(deleted.review?.files).toMatchObject([
      { change: "delete", operationName: "target" },
    ]);
  });

  it("blocks deletes referenced by operation tests and globals", () => {
    const target = createOperationFile("target");
    const tested = createOperationFile("tested");
    const reference = () =>
      createData({
        type: { kind: "reference" as const, name: target.name },
        value: { name: target.name, id: target.id },
      });
    tested.tests = [
      {
        name: "calls target",
        inputs: [reference()],
        expectedOutput: createData(),
      },
    ];
    const globals: ProjectFile = {
      id: "globals",
      name: "globals",
      type: "globals",
      createdAt: 1,
      content: { target: reference() },
    };

    const blocked = deleteAgentOperationProposal({
      project: createTestProject({ files: [target, tested, globals] }),
      anchorFileId: tested.id,
      fileId: target.id,
      sourcePrompt: "Delete target",
    });

    expect(blocked.diagnostics).toEqual([
      expect.objectContaining({
        code: "operation_in_use",
        message: "Cannot delete target; referenced by globals, tested",
      }),
    ]);
  });

  it("finds project references beyond the old child bound in nested calls", () => {
    const target = createOperationFile("target");
    const caller = createOperationFile("caller");
    const parameters = Array.from({ length: 101 }, (_, index) =>
      createStatement({
        data:
          index === 100
            ? createData({
                type: { kind: "reference", name: target.name },
                value: { name: target.name, id: target.id },
              })
            : createData({ value: index }),
      })
    );
    caller.content.value.statements = [
      createStatement({
        data: createData({ value: "input" }),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [],
              result: { kind: "undefined" },
            },
            value: { name: "nested", parameters, statements: [] },
          }),
        ],
      }),
    ];

    const blocked = deleteAgentOperationProposal({
      project: createTestProject({ files: [target, caller] }),
      anchorFileId: caller.id,
      fileId: target.id,
      sourcePrompt: "Delete target",
    });

    expect(blocked.diagnostics).toEqual([
      expect.objectContaining({ code: "operation_in_use" }),
    ]);
  });

  it("keeps idempotent package changes across edits and blocks disabling referenced packages", async () => {
    const file = createOperationFile("usesWretch");
    file.content.value.statements = [
      createStatement({
        data: createData({ value: "url" }),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [{ type: { kind: "string" } }],
              result: { kind: "string" },
            },
            value: {
              name: "wretch.get",
              parameters: [],
              statements: [],
              source: { name: "wretch" },
            },
          }),
        ],
      }),
    ];
    const project = createTestProject({
      files: [file],
      dependencies: {
        npm: [{ name: "wretch", version: "latest", exports: [] }],
      },
    });
    const blocked = createAgentPackageProposal({
      project,
      anchorFileId: file.id,
      sourcePrompt: "Disable wretch",
      name: "wretch",
      enabled: false,
    });
    expect(blocked.diagnostics).toEqual([
      expect.objectContaining({
        code: "package_in_use",
        packageName: "wretch",
      }),
    ]);

    const emptyProject = createTestProject({
      files: [createOperationFile("plain")],
    });
    const enabled = createAgentPackageProposal({
      project: emptyProject,
      anchorFileId: emptyProject.files[0].id,
      sourcePrompt: "Enable wretch",
      name: "wretch",
      enabled: true,
    });
    const repeated = createAgentPackageProposal({
      project: emptyProject,
      anchorFileId: emptyProject.files[0].id,
      previousState: enabled.proposedState,
      sourcePrompt: "Enable wretch again",
      name: "wretch",
      enabled: true,
    });
    expect(repeated.proposedState?.npmDependencies).toHaveLength(1);
    expect(repeated.review?.packages).toEqual({
      enabled: ["wretch"],
      disabled: [],
    });
    const edited = await createAgentProposal({
      project: emptyProject,
      anchorFileId: emptyProject.files[0].id,
      fileId: emptyProject.files[0].id,
      previousState: repeated.proposedState,
      sourcePrompt: "Edit after enabling",
      resolveOperation: () => {
        throw new Error("Unused");
      },
      draft: {
        name: "plain",
        parameters: [],
        statements: [
          { value: { kind: "string", value: "kept" }, return: true },
        ],
      },
    });
    expect(edited.proposedState?.npmDependencies).toEqual(
      repeated.proposedState?.npmDependencies
    );
    expect(() =>
      createAgentPackageProposal({
        project: emptyProject,
        anchorFileId: emptyProject.files[0].id,
        sourcePrompt: "Enable arbitrary package",
        name: "arbitrary-package",
        enabled: true,
      })
    ).toThrow("Unsupported package: arbitrary-package");
  });

  it("blocks disabling packages referenced by operation tests", () => {
    const file = createOperationFile("testedPackage");
    file.tests = [
      {
        name: "package output",
        inputs: [],
        expectedOutput: createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [],
            result: { kind: "undefined" },
          },
          value: {
            name: "wretch.get",
            parameters: [],
            statements: [],
            source: { name: "wretch" },
          },
        }),
      },
    ];
    const project = createTestProject({
      files: [file],
      dependencies: {
        npm: [{ name: "wretch", version: "latest", exports: [] }],
      },
    });

    const blocked = createAgentPackageProposal({
      project,
      anchorFileId: file.id,
      sourcePrompt: "Disable wretch",
      name: "wretch",
      enabled: false,
    });

    expect(blocked.diagnostics).toEqual([
      expect.objectContaining({ code: "package_in_use" }),
    ]);
  });

  it.each([
    {
      enabled: true,
      dependencies: [{ name: "wretch", version: "latest", exports: [] }],
    },
    { enabled: false, dependencies: [] },
  ])(
    "rejects idempotent package changes with an empty review",
    ({ enabled, dependencies }) => {
      const file = createOperationFile("plain");
      const project = createTestProject({
        files: [file],
        dependencies: { npm: dependencies },
      });

      const proposal = createAgentPackageProposal({
        project,
        anchorFileId: file.id,
        sourcePrompt: "Keep package state",
        name: "wretch",
        enabled,
      });

      expect(proposal.review?.files).toEqual([]);
      expect(proposal.review?.packages).toEqual({ enabled: [], disabled: [] });
      expect(proposal.diagnostics).toEqual([
        expect.objectContaining({ code: "no_changes", severity: "error" }),
      ]);
    }
  );

  it("finds package references in deeply nested data types", () => {
    const file = createOperationFile("typedPackageResult");
    let result: DataType = {
      kind: "instance",
      className: "wretchResponseChain",
      constructorArgs: [],
    };
    for (let depth = 0; depth < 14; depth++) {
      result = { kind: "array", elementType: result };
    }
    file.content.type.result = result;
    const project = createTestProject({
      files: [file],
      dependencies: {
        npm: [{ name: "wretch", version: "latest", exports: [] }],
      },
    });

    const blocked = createAgentPackageProposal({
      project,
      anchorFileId: file.id,
      sourcePrompt: "Disable wretch",
      name: "wretch",
      enabled: false,
    });

    expect(blocked.diagnostics).toEqual([
      expect.objectContaining({ code: "package_in_use" }),
    ]);
  });

  it("keeps the complete live-base review through progressive actions", async () => {
    const anchor = createOperationFile("anchor");
    const obsolete = createOperationFile("obsolete");
    const project = createTestProject({ files: [anchor, obsolete] });
    const discovery = await createAgentDiscovery(project, anchor.id);
    const created = await createAgentProposal({
      project,
      anchorFileId: anchor.id,
      previousState: undefined,
      create: true,
      sourcePrompt: "Make several changes",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: "helper",
        parameters: [],
        statements: [
          { value: { kind: "string", value: "helper" }, return: true },
        ],
      },
    });
    const edited = await createAgentProposal({
      project,
      anchorFileId: anchor.id,
      fileId: anchor.id,
      previousState: created.proposedState,
      sourcePrompt: "Make several changes",
      resolveOperation: (handle, inputType) =>
        discovery.resolveOperationHandle(handle, inputType),
      draft: {
        name: "anchor",
        parameters: [],
        statements: [{ value: { kind: "number", value: 1 }, return: true }],
      },
    });
    const deleted = deleteAgentOperationProposal({
      project,
      anchorFileId: anchor.id,
      fileId: obsolete.id,
      previousState: edited.proposedState,
      sourcePrompt: "Make several changes",
    });
    const packaged = createAgentPackageProposal({
      project,
      anchorFileId: anchor.id,
      previousState: deleted.proposedState,
      sourcePrompt: "Make several changes",
      name: "wretch",
      enabled: true,
    });

    expect(packaged.review?.files).toMatchObject([
      { change: "update", operationName: "anchor" },
      { change: "create", operationName: "helper" },
      { change: "delete", operationName: "obsolete" },
    ]);
    expect(packaged.review?.packages).toEqual({
      enabled: ["wretch"],
      disabled: [],
    });
  });

  it("returns a deterministic diagnostic for an equivalent replacement", async () => {
    const file = createOperationFile("unchanged");
    file.content.type.result = { kind: "undefined" };
    file.content.value.name = file.name;
    file.content.value.isAsync = false;
    const project = createTestProject({ files: [file] });

    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "Keep it as-is",
      resolveOperation: () => {
        throw new Error("Unused");
      },
      draft: { name: file.name, parameters: [], statements: [] },
    });

    expect(proposal.review?.files).toEqual([]);
    expect(proposal.diagnostics).toEqual([
      expect.objectContaining({ code: "no_changes", severity: "error" }),
    ]);
  });
});
