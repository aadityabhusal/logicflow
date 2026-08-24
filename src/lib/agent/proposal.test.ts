import { zodSchema } from "ai";
import { describe, expect, it } from "vitest";
import {
  createOperationFile,
  createTestProject,
  testArray,
  testCondition,
  testObject,
  testOperation,
  testReference,
} from "../../tests/helpers";
import type { IStatement, OperationType } from "../types";
import { createData, createStatement, isDataOfType } from "../utils";
import {
  AgentOperationUpdateSchema,
  createAgentProposal,
  getAgentEditableFingerprint,
  isAgentProposalStale,
} from "./proposal";

describe("native agent proposals", () => {
  it("can be represented as a structured-output JSON Schema", async () => {
    const schema = await zodSchema(AgentOperationUpdateSchema, {
      useReferences: true,
    }).jsonSchema;

    expect(schema).toMatchObject({ type: "object" });
  });

  it("strictly accepts only the four bounded native statement actions", () => {
    const statement = createStatement({ data: createData({ value: "value" }) });
    expect(
      AgentOperationUpdateSchema.safeParse({
        explanation: "insert",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement,
          },
        ],
      }).success
    ).toBe(true);
    expect(
      AgentOperationUpdateSchema.safeParse({
        explanation: "bad",
        enablePackages: [],
        changes: [{ kind: "set_statement_name", statementId: "x", name: "y" }],
      }).success
    ).toBe(false);
    expect(
      AgentOperationUpdateSchema.safeParse({
        explanation: "bad",
        enablePackages: ["not-supported"],
        changes: [],
      }).success
    ).toBe(false);
    expect(
      AgentOperationUpdateSchema.safeParse({
        explanation: "bad",
        enablePackages: [],
        changes: [],
        extra: true,
      }).success
    ).toBe(false);
  });

  it("repairs operation values nested inside operation types from provider output", () => {
    const parsed = AgentOperationUpdateSchema.safeParse({
      explanation: "insert callback",
      enablePackages: [],
      changes: [
        {
          kind: "insert_statement",
          container: "body",
          beforeStatementId: null,
          statement: {
            id: "statement",
            data: {
              id: "data",
              type: {
                kind: "operation",
                parameters: [],
                result: { kind: "string" },
                value: {
                  statements: [],
                  parameters: [],
                  name: "callback",
                },
              },
              operations: [],
            },
            operations: [],
          },
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const [change] = parsed.data.changes;
    if (change.kind !== "insert_statement") return;
    expect(change.statement.data).toMatchObject({
      type: { kind: "operation", parameters: [], result: { kind: "string" } },
      value: { name: "callback", statements: [], parameters: [] },
    });
  });

  it("normalizes null object callback parameters from provider output", () => {
    const providerUpdate = (value: unknown) => ({
      explanation: "Map todo titles",
      enablePackages: ["wretch"],
      changes: [
        {
          kind: "insert_statement",
          container: "body",
          beforeStatementId: null,
          statement: {
            id: "request",
            data: {
              id: "request-data",
              type: { kind: "unknown" },
              value: null,
            },
            operations: [
              {
                id: "map",
                type: {
                  kind: "operation",
                  parameters: [
                    {
                      type: { kind: "array", elementType: { kind: "unknown" } },
                    },
                    {
                      type: {
                        kind: "operation",
                        parameters: [
                          { name: "item", type: { kind: "unknown" } },
                        ],
                        result: { kind: "unknown" },
                      },
                    },
                  ],
                  result: { kind: "array", elementType: { kind: "unknown" } },
                },
                value: {
                  name: "map",
                  parameters: [
                    {
                      id: "callback",
                      data: {
                        id: "callback-data",
                        type: {
                          kind: "operation",
                          parameters: [
                            {
                              name: "item",
                              type: {
                                kind: "object",
                                properties: [
                                  { key: "title", value: { kind: "string" } },
                                ],
                              },
                            },
                          ],
                          result: { kind: "string" },
                        },
                        value: {
                          parameters: [
                            {
                              id: "item",
                              name: "item",
                              data: {
                                id: "item-data",
                                type: {
                                  kind: "object",
                                  properties: [
                                    { key: "title", value: { kind: "string" } },
                                  ],
                                },
                                value,
                              },
                              operations: [],
                            },
                          ],
                          statements: [],
                        },
                      },
                      operations: [],
                    },
                  ],
                  statements: [],
                },
              },
            ],
          },
        },
      ],
    });

    const parsed = AgentOperationUpdateSchema.safeParse(providerUpdate(null));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const change = parsed.data.changes[0];
    expect(change.kind).toBe("insert_statement");
    if (change.kind !== "insert_statement") return;
    const callback = change.statement.operations[0].value.parameters[0].data;
    expect(isDataOfType(callback, "operation")).toBe(true);
    if (!isDataOfType(callback, "operation")) return;
    expect(callback.value.parameters[0].data.value).toEqual({ entries: [] });
    expect(
      AgentOperationUpdateSchema.safeParse(providerUpdate("invalid")).success
    ).toBe(false);
    expect(
      AgentOperationUpdateSchema.safeParse({
        explanation: "Do not repair top-level data",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: {
              id: "object",
              data: {
                id: "object-data",
                type: { kind: "object", properties: [] },
                value: null,
              },
              operations: [],
            },
          },
        ],
      }).success
    ).toBe(false);
  });

  it("fills host-owned IDs and empty operation arrays for an empty-operation update", () => {
    const parsed = AgentOperationUpdateSchema.safeParse({
      explanation: "Add BMI inputs and calculation",
      enablePackages: [],
      changes: [
        {
          kind: "insert_statement",
          container: "parameters",
          beforeStatementId: null,
          statement: {
            name: "weightKg",
            data: { type: { kind: "number" }, value: 70 },
          },
        },
        {
          kind: "insert_statement",
          container: "parameters",
          beforeStatementId: null,
          statement: {
            name: "heightM",
            data: { type: { kind: "number" }, value: 1.75 },
          },
        },
        {
          kind: "insert_statement",
          container: "body",
          beforeStatementId: null,
          statement: {
            name: "bmi",
            data: { type: { kind: "number" }, value: 22.86 },
          },
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const statements = parsed.data.changes.flatMap((change) =>
      change.kind === "insert_statement" ? [change.statement] : []
    );
    expect(statements).toHaveLength(3);
    expect(statements.every(({ id }) => id.length > 0)).toBe(true);
    expect(new Set(statements.map(({ id }) => id)).size).toBe(3);
    expect(
      statements.every(
        ({ data, operations }) => data.id.length > 0 && operations.length === 0
      )
    ).toBe(true);
  });

  it("rejects a parameter-only update when the request requires computation", async () => {
    const file = createOperationFile("bmi");
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "Take height and weight as operation parameters",
      requestContext:
        "[1] user:\nAdd the logic to calculate body mass index.\n\n[2] user:\nTake height and weight as operation parameters.",
      update: {
        explanation: "Added the inputs",
        enablePackages: [],
        changes: ["height", "weight"].map((name) => ({
          kind: "insert_statement" as const,
          container: "parameters" as const,
          beforeStatementId: null,
          statement: createStatement({
            name,
            data: createData({ type: { kind: "number" }, value: 0 }),
          }),
        })),
      },
    });

    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({ code: "incomplete_request" })
    );
    expect(proposal.proposedFile!.content.value.statements).toEqual([]);
  });

  it("removes an explicit return marker from a newly inserted final statement", async () => {
    const file = createOperationFile("main");
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "add the result",
      update: {
        explanation: "Add result",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: createStatement({
              data: createData({ value: 42 }),
              controlFlow: "return",
            }),
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    expect(
      proposal.proposedFile!.content.value.statements[0]
    ).not.toHaveProperty("controlFlow");
  });

  it("canonicalizes stale reference IDs in an empty-operation BMI update", async () => {
    const file = createOperationFile("main");
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "add the logic to calculate body mass index (bmi)",
      update: {
        explanation: "Add BMI inputs and calculation",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "parameters",
            beforeStatementId: null,
            statement: {
              id: "weight-statement",
              name: "weightKg",
              data: {
                id: "weight-data",
                type: { kind: "number" },
                value: 70,
              },
              operations: [],
            },
          },
          {
            kind: "insert_statement",
            container: "parameters",
            beforeStatementId: null,
            statement: {
              id: "height-statement",
              name: "heightM",
              data: {
                id: "height-data",
                type: { kind: "number" },
                value: 1.75,
              },
              operations: [],
            },
          },
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: {
              id: "bmi-statement",
              name: "bmi",
              data: {
                id: "bmi-data",
                type: { kind: "reference", name: "heightM" },
                value: { name: "heightM", id: "height-data" },
              },
              operations: [],
            },
          },
        ],
      },
    });

    expect(proposal.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: "unresolved_reference",
        message: expect.stringContaining("heightM"),
      })
    );
    const height = proposal.proposedFile!.content.value.parameters.find(
      ({ name }) => name === "heightM"
    )!;
    const bmi = proposal.proposedFile!.content.value.statements[0];
    expect(bmi.data.value).toEqual({ name: "heightM", id: height.id });
  });

  it("repairs named arithmetic calls returned inside statement data", async () => {
    const file = createOperationFile("operation1");
    const referenceStatement = (id: string, name: string, referenceId = id) =>
      createStatement({
        id,
        name,
        data: createData({
          id: `${id}-data`,
          type: { kind: "reference", name },
          value: { name, id: referenceId },
        }),
      });
    const arithmeticCall = (
      id: string,
      name: string,
      parameters: IStatement[]
    ) =>
      createData<OperationType>({
        id,
        type: {
          kind: "operation",
          parameters: [
            { type: { kind: "number" } },
            { type: { kind: "number" } },
          ],
          result: { kind: "number" },
        },
        value: { name, parameters, statements: [] },
      });
    const update = {
      explanation: "Calculate BMI",
      enablePackages: [],
      changes: [
        {
          kind: "insert_statement" as const,
          container: "parameters" as const,
          beforeStatementId: null,
          statement: createStatement({
            id: "weightKg",
            name: "weightKg",
            data: createData({
              id: "weightKgData",
              type: { kind: "number" },
              value: 70,
            }),
          }),
        },
        {
          kind: "insert_statement" as const,
          container: "parameters" as const,
          beforeStatementId: null,
          statement: createStatement({
            id: "heightM",
            name: "heightM",
            data: createData({
              id: "heightMData",
              type: { kind: "number" },
              value: 1.75,
            }),
          }),
        },
        {
          kind: "insert_statement" as const,
          container: "body" as const,
          beforeStatementId: null,
          statement: createStatement({
            id: "heightSquared",
            name: "heightSquared",
            data: arithmeticCall("heightSquaredData", "multiply", [
              referenceStatement("heightM-ref-1", "heightM", "heightM"),
              referenceStatement("heightM-ref-2", "heightM", "heightM"),
            ]),
          }),
        },
        {
          kind: "insert_statement" as const,
          container: "body" as const,
          beforeStatementId: null,
          statement: createStatement({
            id: "bmi",
            name: "bmi",
            data: arithmeticCall("bmiData", "divide", [
              referenceStatement("weightKg-ref", "weightKg", "weightKg"),
              referenceStatement(
                "heightSquared-ref",
                "heightSquared",
                "heightSquared"
              ),
            ]),
          }),
        },
      ],
    };
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "add the logic to calculate body mass index (bmi)",
      update,
    });

    expect(proposal.diagnostics).toEqual([]);
    const proposedStatements = proposal.proposedFile!.content.value.statements;
    expect(proposedStatements).toHaveLength(2);
    expect(proposedStatements.map(({ name }) => name)).toEqual([
      "heightSquared",
      "bmi",
    ]);
    expect(proposedStatements.map(({ data }) => data.type.kind)).toEqual([
      "reference",
      "reference",
    ]);
    expect(
      proposedStatements.map(({ operations }) => operations[0].value.name)
    ).toEqual(["multiply", "divide"]);
    expect(
      proposedStatements.map(({ operations }) =>
        operations[0].value.parameters.map(({ name }) => name)
      )
    ).toEqual([["heightM"], ["heightSquared"]]);
  });

  it("does not repair explicit invalid statement fields", () => {
    const parsed = AgentOperationUpdateSchema.safeParse({
      explanation: "bad",
      enablePackages: [],
      changes: [
        {
          kind: "insert_statement",
          container: "body",
          beforeStatementId: null,
          statement: {
            data: { type: { kind: "number" }, value: 1 },
            operations: null,
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("inserts only into the selected operation and preserves metadata", async () => {
    const file = createOperationFile("main");
    file.documentation = "keep";
    file.tags = ["public"];
    const other = createOperationFile("other");
    const project = createTestProject({ files: [file, other] });
    const payload = createStatement({
      name: "result",
      data: createData({ value: "ok" }),
      controlFlow: "return",
    });
    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "return ok",
      update: {
        explanation: "Return ok",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: payload,
          },
        ],
      },
    });
    expect(proposal.diagnostics).toEqual([]);
    expect(proposal.proposedFile).toMatchObject({
      id: file.id,
      documentation: "keep",
      tags: ["public"],
    });
    expect(proposal.proposedFile!.content.value.statements[0].id).not.toBe(
      payload.id
    );
    expect(proposal.proposedState!.operationFiles[1].file).toEqual(other);
    expect(file.content.value.statements).toEqual([]);
  });

  it("remaps nested IDs and internal references while preserving a replacement root", async () => {
    const file = createOperationFile("main");
    const target = createStatement({ data: createData({ value: "old" }) });
    file.content.value.statements = [target];
    const nested = createStatement({
      name: "item",
      data: createData({ value: 1 }),
    });
    const reference = createStatement({
      data: createData({
        type: { kind: "reference", name: "item" },
        value: { name: "item", id: nested.id },
      }),
    });
    const payload = createStatement({ data: testArray([nested, reference]) });
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "replace",
      update: {
        explanation: "replace",
        enablePackages: [],
        changes: [
          {
            kind: "replace_statement",
            statementId: target.id,
            statement: payload,
          },
        ],
      },
    });
    expect(proposal.diagnostics).toEqual([]);
    const replaced = proposal.proposedFile!.content.value.statements[0];
    expect(replaced.id).toBe(target.id);
    expect(replaced.data.id).not.toBe(payload.data.id);
    if (
      replaced.data.type.kind !== "array" ||
      !Array.isArray(replaced.data.value)
    )
      throw new Error("Expected array");
    expect(replaced.data.value[1].data.value).toMatchObject({
      id: replaced.data.value[0].id,
    });
  });

  it("remaps references to statements inserted by another action", async () => {
    const file = createOperationFile("main");
    const target = createStatement({ data: createData({ value: "inline" }) });
    file.content.value.statements = [target];
    const callback = createStatement({
      name: "isEven",
      data: testOperation(),
    });
    const replacement = createStatement({
      data: testReference("isEven", callback.id),
    });

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "extract callback",
      update: {
        explanation: "Extract callback",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: target.id,
            statement: callback,
          },
          {
            kind: "replace_statement",
            statementId: target.id,
            statement: replacement,
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    const [inserted, replaced] =
      proposal.proposedFile!.content.value.statements;
    expect(inserted.id).not.toBe(callback.id);
    expect(replaced.id).toBe(target.id);
    expect(replaced.data.value).toMatchObject({
      name: "isEven",
      id: inserted.id,
    });
  });

  it("moves statements without changing IDs and validates anchors and containers", async () => {
    const file = createOperationFile("main");
    const first = createStatement({ data: createData({ value: 1 }) });
    const second = createStatement({ data: createData({ value: 2 }) });
    file.content.value.statements = [first, second];
    const project = createTestProject({ files: [file] });
    const moved = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "move",
      update: {
        explanation: "move",
        enablePackages: [],
        changes: [
          {
            kind: "move_statement",
            statementId: second.id,
            beforeStatementId: first.id,
          },
        ],
      },
    });
    expect(moved.diagnostics).toEqual([]);
    expect(
      moved.proposedFile!.content.value.statements.map(({ id }) => id)
    ).toEqual([second.id, first.id]);
    const invalid = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "bad",
      update: {
        explanation: "bad",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "parameters",
            beforeStatementId: first.id,
            statement: createStatement(),
          },
        ],
      },
    });
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid_anchor" })
    );
  });

  it("rejects nested statement IDs as action targets", async () => {
    const nested = createStatement({ data: createData({ value: "nested" }) });
    const root = createStatement({ data: testOperation([], [nested]) });
    const file = createOperationFile("main");
    file.content.value.statements = [root];

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "replace nested",
      update: {
        explanation: "replace nested",
        enablePackages: [],
        changes: [{ kind: "delete_statement", statementId: nested.id }],
      },
    });

    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "invalid_statement_target",
        message: expect.stringContaining(nested.id),
      })
    );
  });

  it("rejects moving a statement before a dependency from the untouched operation", async () => {
    const file = createOperationFile("main");
    const dependency = createStatement({
      name: "dependency",
      data: createData({ value: 1 }),
    });
    const dependent = createStatement({
      data: testReference("dependency", dependency.id),
    });
    file.content.value.statements = [dependency, dependent];
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "move",
      update: {
        explanation: "move",
        enablePackages: [],
        changes: [
          {
            kind: "move_statement",
            statementId: dependent.id,
            beforeStatementId: dependency.id,
          },
        ],
      },
    });
    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid_statement_order" })
    );
  });

  it("rejects deleting a referenced statement and duplicate targets", async () => {
    const file = createOperationFile("main");
    const value = createStatement({
      name: "value",
      data: createData({ value: 1 }),
    });
    const reference = createStatement({
      data: createData({
        type: { kind: "reference", name: "value" },
        value: { name: "value", id: value.id },
      }),
    });
    file.content.value.statements = [value, reference];
    const project = createTestProject({ files: [file] });
    const deleted = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "delete",
      update: {
        explanation: "delete",
        enablePackages: [],
        changes: [{ kind: "delete_statement", statementId: value.id }],
      },
    });
    expect(deleted.diagnostics).toContainEqual(
      expect.objectContaining({ code: "statement_in_use" })
    );
    const conflict = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "conflict",
      update: {
        explanation: "conflict",
        enablePackages: [],
        changes: [
          { kind: "delete_statement", statementId: value.id },
          {
            kind: "move_statement",
            statementId: value.id,
            beforeStatementId: null,
          },
        ],
      },
    });
    expect(conflict.diagnostics).toContainEqual(
      expect.objectContaining({ code: "conflicting_actions" })
    );
  });

  it("rejects structurally valid calls to nonexistent operations", async () => {
    const file = createOperationFile("main");
    const statement = createStatement({
      data: createData({ value: "x" }),
      operations: [
        createData({
          type: {
            kind: "operation",
            parameters: [{ type: { kind: "string" } }],
            result: { kind: "string" },
          },
          value: { name: "inventedOperation", parameters: [], statements: [] },
        }),
      ],
    });
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "insert",
      update: {
        explanation: "insert",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement,
          },
        ],
      },
    });
    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown_operation" })
    );
  });

  it("recursively validates calls in every nested statement host", async () => {
    const invalidCall = () =>
      createStatement({
        data: createData({ value: "x" }),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [{ type: { kind: "string" } }],
              result: { kind: "string" },
            },
            value: {
              name: "inventedOperation",
              parameters: [],
              statements: [],
            },
          }),
        ],
      });
    const callee = createOperationFile("callee");
    callee.content.value.parameters = [
      createStatement({ name: "value", data: createData({ value: "" }) }),
    ];
    callee.content.type.parameters = [
      { name: "value", type: { kind: "string" } },
    ];
    const nested = [
      createStatement({ data: testArray([invalidCall()]) }),
      createStatement({
        data: testObject([{ key: "value", value: invalidCall() }]),
      }),
      createStatement({
        data: testCondition(
          createStatement({ data: createData({ value: true }) }),
          [invalidCall()],
          []
        ),
      }),
      createStatement({ data: testOperation([], [invalidCall()]) }),
      createStatement({
        data: createData({
          type: {
            kind: "instance",
            className: "Example",
            constructorArgs: [{ type: { kind: "string" } }],
          },
          value: {
            className: "Example",
            instanceId: "payload-instance",
            constructorArgs: [invalidCall()],
          },
        }),
      }),
      createStatement({
        data: testReference(callee.name, callee.id),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [
                { type: callee.content.type },
                { type: { kind: "string" } },
              ],
              result: callee.content.type.result,
            },
            value: {
              name: "call",
              parameters: [invalidCall()],
              statements: [],
            },
          }),
        ],
      }),
    ];
    const file = createOperationFile("main");
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file, callee] }),
      fileId: file.id,
      sourcePrompt: "insert nested",
      update: {
        explanation: "insert nested",
        enablePackages: [],
        changes: nested.map((statement) => ({
          kind: "insert_statement" as const,
          container: "body" as const,
          beforeStatementId: null,
          statement,
        })),
      },
    });
    expect(
      proposal.diagnostics.filter(({ code }) => code === "unknown_operation")
    ).toHaveLength(6);
  });

  it("validates project-call argument types and canonicalizes call metadata", async () => {
    const callee = createOperationFile("callee");
    callee.content.value.parameters = [
      createStatement({ name: "value", data: createData({ value: 0 }) }),
    ];
    callee.content.type.parameters = [
      { name: "value", type: { kind: "number" } },
    ];
    const call = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "unknown" },
      },
      value: {
        name: "call",
        source: { name: "wrong" },
        parameters: [createStatement({ data: createData({ value: "wrong" }) })],
        statements: [],
      },
    });
    const file = createOperationFile("main");
    const statement = createStatement({
      data: testReference(callee.name, callee.id),
      operations: [call],
    });
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file, callee] }),
      fileId: file.id,
      sourcePrompt: "call",
      update: {
        explanation: "call",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement,
          },
        ],
      },
    });
    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid_argument_type" })
    );
    const proposedCall =
      proposal.proposedFile!.content.value.statements[0].operations[0];
    expect(proposedCall.value.source).toBeUndefined();
    expect(proposedCall.type).toEqual({
      kind: "operation",
      parameters: [
        { type: callee.content.type },
        { name: "value", type: { kind: "number" } },
      ],
      result: callee.content.type.result,
    });
  });

  it("migrates only calls whose receiver is the selected operation", async () => {
    const selected = createOperationFile("selected");
    const first = createStatement({
      name: "first",
      data: createData({ value: "" }),
    });
    const second = createStatement({
      name: "second",
      data: createData({ value: 0 }),
    });
    selected.content.value.parameters = [first, second];
    selected.content.type.parameters = [
      { name: "first", type: { kind: "string" } },
      { name: "second", type: { kind: "number" } },
    ];
    const other = createOperationFile("other");
    other.content.value.parameters = [first];
    other.content.type.parameters = [
      { name: "first", type: { kind: "string" } },
    ];
    const makeCall = (target: typeof selected, args: IStatement[]) =>
      createStatement({
        data: testReference(target.name, target.id),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [
                { type: target.content.type },
                ...target.content.type.parameters,
              ],
              result: target.content.type.result,
            },
            value: { name: "call", parameters: args, statements: [] },
          }),
        ],
      });
    const selectedArgs = [
      createStatement({ data: createData({ value: "selected" }) }),
      createStatement({ data: createData({ value: 1 }) }),
    ];
    const otherArg = createStatement({ data: createData({ value: "other" }) });
    const caller = createOperationFile("caller");
    caller.content.value.statements = [
      createStatement({
        data: testArray([
          makeCall(selected, selectedArgs),
          makeCall(other, [otherArg]),
        ]),
      }),
    ];
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [selected, other, caller] }),
      fileId: selected.id,
      sourcePrompt: "reorder",
      update: {
        explanation: "reorder",
        enablePackages: [],
        changes: [
          {
            kind: "move_statement",
            statementId: second.id,
            beforeStatementId: first.id,
          },
        ],
      },
    });
    const proposedCaller = proposal.proposedState!.operationFiles.find(
      ({ file }) => file.id === caller.id
    )!.file;
    const calls = proposedCaller.content.value.statements[0].data
      .value as IStatement[];
    expect(calls[0].operations[0].value.parameters.map(({ id }) => id)).toEqual(
      [selectedArgs[1].id, selectedArgs[0].id]
    );
    expect(calls[1].operations[0].value.parameters.map(({ id }) => id)).toEqual(
      [otherArg.id]
    );
  });

  it("remaps operation-call and constructor-argument entity IDs", async () => {
    const file = createOperationFile("main");
    const argument = createStatement({ data: createData({ value: "value" }) });
    const call = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "string" },
      },
      value: { name: "toString", parameters: [], statements: [] },
    });
    argument.operations = [call];
    const instance = createData({
      type: {
        kind: "instance",
        className: "Example",
        constructorArgs: [{ type: { kind: "string" } }],
      },
      value: {
        className: "Example",
        instanceId: "instance-host",
        constructorArgs: [argument],
      },
    });
    const payload = createStatement({
      data: testArray([createStatement({ data: instance })]),
    });
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "insert",
      update: {
        explanation: "insert",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: payload,
          },
        ],
      },
    });
    const value = proposal.proposedFile!.content.value.statements[0].data
      .value as IStatement[];
    const constructorArgument = (
      value[0].data.value as { constructorArgs: IStatement[] }
    ).constructorArgs[0];
    expect(constructorArgument.id).not.toBe(argument.id);
    expect(constructorArgument.data.id).not.toBe(argument.data.id);
    expect(constructorArgument.operations[0].id).not.toBe(call.id);
  });

  it("fingerprints history-relevant state for staleness", async () => {
    const file = createOperationFile("main");
    const project = createTestProject({ files: [file] });
    const proposal = await createAgentProposal({
      project,
      fileId: file.id,
      sourcePrompt: "noop",
      update: { explanation: "noop", enablePackages: [], changes: [] },
    });
    expect(proposal.baseFingerprint).toBe(getAgentEditableFingerprint(project));
    expect(isAgentProposalStale(proposal, project)).toBe(false);
    const changed = structuredClone(project);
    if (changed.files[0].type === "operation")
      changed.files[0].documentation = "changed";
    expect(isAgentProposalStale(proposal, changed)).toBe(true);
  });

  it("validates submitted reference name and ID before normalization", async () => {
    const file = createOperationFile("main");
    const value = createStatement({
      name: "value",
      data: createData({ value: 1 }),
    });
    file.content.value.statements = [value];
    const reference = createStatement({
      data: testReference("wrongName", value.id),
    });
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "reference",
      update: {
        explanation: "reference",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: reference,
          },
        ],
      },
    });
    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unresolved_reference" })
    );
  });

  it("keeps nested lexical declarations local while allowing closure capture", async () => {
    const file = createOperationFile("main");
    const outer = createStatement({
      name: "outer",
      data: createData({ value: 1 }),
    });
    file.content.value.statements = [outer];
    const local = createStatement({
      name: "local",
      data: testReference("outer", outer.id),
    });
    const closure = createStatement({
      data: testOperation(
        [],
        [local, createStatement({ data: testReference("local", local.id) })]
      ),
    });
    const escaped = createStatement({ data: testReference("local", local.id) });
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "scope",
      update: {
        explanation: "scope",
        enablePackages: [],
        changes: [closure, escaped].map((statement) => ({
          kind: "insert_statement" as const,
          container: "body" as const,
          beforeStatementId: null,
          statement,
        })),
      },
    });
    expect(
      proposal.diagnostics.filter(({ code }) => code === "unresolved_reference")
    ).toHaveLength(1);
  });

  it("canonicalizes stale project and recursive operation references", async () => {
    const selected = createOperationFile("selected");
    const helper = createOperationFile("helper");
    const caller = createOperationFile("caller");
    const operationCall = (name: string, id: string) =>
      createStatement({
        data: testReference(name, id),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [],
              result: { kind: "unknown" },
            },
            value: { name: "call", parameters: [], statements: [] },
          }),
        ],
      });
    selected.content.value.statements = [
      operationCall(selected.name, "old-selected-id"),
      operationCall(helper.name, "old-helper-id"),
    ];
    caller.content.value.statements = [
      operationCall(selected.name, "old-selected-id"),
    ];

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [selected, helper, caller] }),
      fileId: selected.id,
      sourcePrompt: "keep calls valid",
      update: {
        explanation: "add value",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: createStatement({ data: createData({ value: 1 }) }),
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    expect(
      proposal
        .proposedFile!.content.value.statements.slice(0, 2)
        .map(({ data }) => data.value)
    ).toEqual([
      { name: selected.name, id: selected.id },
      { name: helper.name, id: helper.id },
    ]);
    const proposedCaller = proposal.proposedState!.operationFiles.find(
      ({ file }) => file.id === caller.id
    )!.file;
    expect(proposedCaller.content.value.statements[0].data.value).toEqual({
      name: selected.name,
      id: selected.id,
    });
  });

  it("does not report unrelated operation calls as proposal changes", async () => {
    const selected = createOperationFile("selected");
    const helper = createOperationFile("helper");
    const unrelated = createOperationFile("unrelated");
    unrelated.content.value.statements = [
      createStatement({
        data: testReference(helper.name, helper.id),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [{ type: helper.content.type }],
              result: helper.content.type.result,
            },
            value: { name: "call", parameters: [], statements: [] },
          }),
        ],
      }),
    ];

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [selected, helper, unrelated] }),
      fileId: selected.id,
      sourcePrompt: "add a value",
      update: {
        explanation: "add a value",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: createStatement({ data: createData({ value: 1 }) }),
          },
        ],
      },
    });

    expect(proposal.review?.files).toEqual([]);
    expect(
      proposal.proposedState?.operationFiles.find(
        ({ file }) => file.id === unrelated.id
      )?.file
    ).toEqual(unrelated);
  });

  it("canonicalizes built-in result metadata and validates project-call arity", async () => {
    const callee = createOperationFile("callee");
    callee.content.value.parameters = [
      createStatement({ name: "value", data: createData({ value: 0 }) }),
    ];
    callee.content.type.parameters = [{ type: { kind: "number" } }];
    const projectCall = createStatement({
      data: testReference(callee.name, callee.id),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [],
            result: { kind: "unknown" },
          },
          value: { name: "call", parameters: [], statements: [] },
        }),
      ],
    });
    const builtIn = createStatement({
      data: createData({ value: 1 }),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [],
            result: { kind: "boolean" },
          },
          value: {
            name: "mod",
            parameters: [createStatement({ data: createData({ value: 2 }) })],
            statements: [],
          },
        }),
      ],
    });
    const file = createOperationFile("main");
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file, callee] }),
      fileId: file.id,
      sourcePrompt: "calls",
      update: {
        explanation: "calls",
        enablePackages: [],
        changes: [projectCall, builtIn].map((statement) => ({
          kind: "insert_statement" as const,
          container: "body" as const,
          beforeStatementId: null,
          statement,
        })),
      },
    });
    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid_argument_count" })
    );
    expect(
      proposal.proposedFile!.content.value.statements[1].operations[0].type
        .result
    ).toEqual({ kind: "number" });
  });

  it("validates sourced core operations against the built-in catalog", async () => {
    const file = createOperationFile("main");
    const statement = createStatement({
      data: createData({ value: "a,b" }),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [],
            result: { kind: "unknown" },
          },
          value: {
            name: "split",
            source: { name: "remeda" },
            parameters: [createStatement({ data: createData({ value: "," }) })],
            statements: [],
          },
        }),
      ],
    });

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "split",
      update: {
        explanation: "split",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement,
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    const call =
      proposal.proposedFile!.content.value.statements[0].operations[0];
    expect(call.value.source).toEqual({ name: "remeda" });
    expect(call.type.result).toEqual({
      kind: "array",
      elementType: { kind: "string" },
    });
    expect(call.value.parameters[0]).toMatchObject({
      id: expect.any(String),
      data: { id: expect.any(String) },
    });
  });

  it("maps titles from an awaited wretch GET JSON result", async () => {
    const operation = (
      name: string,
      result: OperationType["result"],
      source?: string,
      parameters: IStatement[] = []
    ) =>
      createData<OperationType>({
        type: { kind: "operation", parameters: [], result },
        value: {
          name,
          source: source ? { name: source } : undefined,
          parameters,
          statements: [],
        },
      });
    const fetchTodos = createStatement({
      name: "fetchTodos",
      data: createData({
        value: "https://jsonplaceholder.typicode.com/todos",
      }),
      operations: [
        operation("wretch", { kind: "unknown" }, "wretch"),
        operation("wretch.get", { kind: "unknown" }, "wretch"),
        operation("wretch.json", { kind: "unknown" }, "wretchResponseChain"),
        operation("await", { kind: "unknown" }),
      ],
    });
    const item = createStatement({
      name: "item",
      data: testObject([
        {
          key: "title",
          value: createStatement({ data: createData({ value: "" }) }),
        },
      ]),
    });
    const title = createStatement({
      data: testReference("item", item.id),
      operations: [
        operation("get", { kind: "string" }, undefined, [
          createStatement({ data: createData({ value: "title" }) }),
        ]),
      ],
    });
    const todoTitles = createStatement({
      name: "todoTitles",
      data: testReference("fetchTodos", fetchTodos.id),
      operations: [
        operation("map", { kind: "unknown" }, undefined, [
          createStatement({ data: testOperation([item], [title]) }),
        ]),
      ],
    });
    const file = createOperationFile("main");

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "Fetch todos with wretch and map their titles",
      update: {
        explanation: "Fetch and map todos",
        enablePackages: ["wretch"],
        changes: [fetchTodos, todoTitles].map((statement) => ({
          kind: "insert_statement" as const,
          container: "body" as const,
          beforeStatementId: null,
          statement,
        })),
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    const statements = proposal.proposedFile!.content.value.statements;
    const requestOperations = statements[0].operations;
    expect(requestOperations[0].type.result).toEqual({
      kind: "instance",
      className: "wretch.Wretch",
      constructorArgs: [],
    });
    expect(requestOperations[1].type.result).toEqual({
      kind: "instance",
      className: "wretch.WretchResponseChain",
      constructorArgs: [],
    });
    expect(requestOperations[2]).toMatchObject({
      type: {
        result: {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
          result: { kind: "unknown" },
        },
      },
      value: { source: { name: "wretchResponseChain" } },
    });
    expect(requestOperations[3].type.result).toEqual({ kind: "unknown" });
    expect(statements[1].operations[0]).toMatchObject({
      type: { result: { kind: "unknown" } },
      value: { name: "map" },
    });
  });

  it("rejects an exact array operation on a known non-array receiver", async () => {
    const file = createOperationFile("main");
    const statement = createStatement({
      data: createData({ value: "not an array" }),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [],
            result: { kind: "unknown" },
          },
          value: {
            name: "map",
            parameters: [createStatement({ data: testOperation([], []) })],
            statements: [],
          },
        }),
      ],
    });

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "Map a string",
      update: {
        explanation: "Map a string",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement,
          },
        ],
      },
    });

    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "unknown_operation",
        message: "Operation map is unavailable for string",
      })
    );
  });

  it("canonicalizes direct-name project calls without degrading results", async () => {
    const arrayType = {
      kind: "array" as const,
      elementType: { kind: "number" as const },
    };
    const helper = createOperationFile("merge_sort");
    helper.content.type.parameters = [{ name: "arr", type: arrayType }];
    helper.content.type.result = arrayType;
    const selected = createOperationFile("main");
    selected.content.type.result = arrayType;
    selected.content.value.statements = [
      createStatement({
        data: createData({ type: arrayType, value: [] }),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: helper.content.type.parameters,
              result: { kind: "unknown" },
            },
            value: {
              name: helper.name,
              parameters: [],
              statements: [],
            },
          }),
        ],
        controlFlow: "return",
      }),
    ];

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [selected, helper] }),
      fileId: selected.id,
      sourcePrompt: "add note",
      update: {
        explanation: "add note",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: selected.content.value.statements[0].id,
            statement: createStatement({
              data: createData({ type: arrayType, value: [] }),
            }),
          },
        ],
      },
    });

    expect(proposal.diagnostics).toEqual([]);
    expect(proposal.proposedFile!.content.type.result).toEqual(arrayType);
    expect(
      proposal.proposedFile!.content.value.statements[1].operations[0].type
        .result
    ).toEqual(arrayType);
  });

  it("validates chained lexical arguments by their final result type", async () => {
    const arrayType = {
      kind: "array" as const,
      elementType: { kind: "number" as const },
    };
    const selected = createOperationFile("merge_op");
    const left = createStatement({
      name: "left",
      data: createData({ type: arrayType, value: [] }),
    });
    const right = createStatement({
      name: "right",
      data: createData({ type: arrayType, value: [] }),
    });
    selected.content.value.parameters = [left, right];
    selected.content.type.parameters = [
      { name: left.name, type: arrayType },
      { name: right.name, type: arrayType },
    ];
    selected.content.type.result = arrayType;
    selected.content.value.statements = [
      createStatement({
        data: testReference(selected.name, selected.id),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [
                { type: selected.content.type },
                ...selected.content.type.parameters,
              ],
              result: arrayType,
            },
            value: {
              name: "call",
              parameters: [
                createStatement({
                  data: testReference(left.name!, left.id),
                  operations: [
                    createData<OperationType>({
                      type: {
                        kind: "operation",
                        parameters: [
                          {
                            type: {
                              kind: "array",
                              elementType: { kind: "unknown" },
                            },
                          },
                        ],
                        result: { kind: "unknown" },
                      },
                      value: {
                        name: "slice",
                        parameters: [],
                        statements: [],
                      },
                    }),
                  ],
                }),
                createStatement({ data: testReference(right.name!, right.id) }),
              ],
              statements: [],
            },
          }),
        ],
        controlFlow: "return",
      }),
    ];

    const proposal = await createAgentProposal({
      project: createTestProject({ files: [selected] }),
      fileId: selected.id,
      sourcePrompt: "retain recursive call",
      update: {
        explanation: "retain recursive call",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: selected.content.value.statements[0].id,
            statement: createStatement({
              data: createData({ type: arrayType, value: [] }),
            }),
          },
        ],
      },
    });

    expect(proposal.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "invalid_argument_type" })
    );
  });

  it("preserves every retained rest argument during parameter migration", async () => {
    const selected = createOperationFile("selected");
    const rest = createStatement({
      name: "values",
      isRest: true,
      data: createData({
        type: { kind: "array", elementType: { kind: "number" } },
        value: [],
      }),
    });
    selected.content.value.parameters = [rest];
    selected.content.type.parameters = [{ type: rest.data.type, isRest: true }];
    const args = [1, 2, 3].map((value) =>
      createStatement({ data: createData({ value }) })
    );
    const caller = createOperationFile("caller");
    caller.content.value.statements = [
      createStatement({
        data: testReference(selected.name, selected.id),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [
                { type: selected.content.type },
                ...selected.content.type.parameters,
              ],
              result: selected.content.type.result,
            },
            value: { name: "call", parameters: args, statements: [] },
          }),
        ],
      }),
    ];
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [selected, caller] }),
      fileId: selected.id,
      sourcePrompt: "rename rest",
      update: {
        explanation: "rename rest",
        enablePackages: [],
        changes: [
          {
            kind: "replace_statement",
            statementId: rest.id,
            statement: { ...rest, name: "items" },
          },
        ],
      },
    });
    const proposedCaller = proposal.proposedState!.operationFiles.find(
      ({ file }) => file.id === caller.id
    )!.file;
    expect(
      proposedCaller.content.value.statements[0].operations[0].value.parameters.map(
        ({ id }) => id
      )
    ).toEqual(args.map(({ id }) => id));
  });

  it("propagates changed results through transitive callers", async () => {
    const selected = createOperationFile("selected");
    const direct = createOperationFile("direct");
    const transitive = createOperationFile("transitive");
    const call = (target: typeof selected) =>
      createStatement({
        data: testReference(target.name, target.id),
        operations: [
          createData<OperationType>({
            type: {
              kind: "operation",
              parameters: [{ type: target.content.type }],
              result: target.content.type.result,
            },
            value: { name: "call", parameters: [], statements: [] },
          }),
        ],
        controlFlow: "return",
      });
    direct.content.value.statements = [call(selected)];
    transitive.content.value.statements = [call(direct)];
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [selected, direct, transitive] }),
      fileId: selected.id,
      sourcePrompt: "return number",
      update: {
        explanation: "return number",
        enablePackages: [],
        changes: [
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: null,
            statement: createStatement({
              data: createData({ value: 1 }),
              controlFlow: "return",
            }),
          },
        ],
      },
    });
    const files = proposal.proposedState!.operationFiles;
    expect(proposal.review?.files.map(({ operationName }) => operationName)).toEqual([
      "direct",
      "transitive",
    ]);
    const directResult = files.find(({ file }) => file.id === direct.id)!.file
      .content.type.result;
    const proposedTransitive = files.find(
      ({ file }) => file.id === transitive.id
    )!.file;
    expect(proposedTransitive.content.type.result).toEqual(directResult);
    expect(
      proposedTransitive.content.value.statements[0].operations[0].type.result
    ).toEqual(directResult);
  });

  it("rejects an anchor changed incompatibly in the same batch", async () => {
    const file = createOperationFile("main");
    const anchor = createStatement();
    file.content.value.statements = [anchor];
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "conflict",
      update: {
        explanation: "conflict",
        enablePackages: [],
        changes: [
          { kind: "delete_statement", statementId: anchor.id },
          {
            kind: "insert_statement",
            container: "body",
            beforeStatementId: anchor.id,
            statement: createStatement(),
          },
        ],
      },
    });
    expect(proposal.diagnostics).toContainEqual(
      expect.objectContaining({ code: "conflicting_actions" })
    );
  });

  it("remaps runtime instance IDs but preserves external File asset IDs", async () => {
    const file = createOperationFile("main");
    const runtime = createData({
      type: { kind: "instance", className: "Date", constructorArgs: [] },
      value: {
        className: "Date",
        instanceId: "runtime-id",
        constructorArgs: [],
      },
    });
    const asset = createData({
      type: { kind: "instance", className: "File", constructorArgs: [] },
      value: { className: "File", instanceId: "asset-id", constructorArgs: [] },
    });
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "instances",
      update: {
        explanation: "instances",
        enablePackages: [],
        changes: [runtime, asset].map((data) => ({
          kind: "insert_statement" as const,
          container: "body" as const,
          beforeStatementId: null,
          statement: createStatement({ data }),
        })),
      },
    });
    const statements = proposal.proposedFile!.content.value.statements;
    expect(
      (statements[0].data.value as { instanceId: string }).instanceId
    ).not.toBe("runtime-id");
    expect(
      (statements[1].data.value as { instanceId: string }).instanceId
    ).toBe("asset-id");
  });

  it("remaps colliding submitted runtime instance IDs to unique IDs", async () => {
    const file = createOperationFile("main");
    const instance = () =>
      createData({
        type: { kind: "instance", className: "Date", constructorArgs: [] },
        value: {
          className: "Date",
          instanceId: "shared-runtime-id",
          constructorArgs: [],
        },
      });
    const proposal = await createAgentProposal({
      project: createTestProject({ files: [file] }),
      fileId: file.id,
      sourcePrompt: "instances",
      update: {
        explanation: "instances",
        enablePackages: [],
        changes: [instance(), instance()].map((data) => ({
          kind: "insert_statement" as const,
          container: "body" as const,
          beforeStatementId: null,
          statement: createStatement({ data }),
        })),
      },
    });
    const ids = proposal.proposedFile!.content.value.statements.map(
      ({ data }) => (data.value as { instanceId: string }).instanceId
    );
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain("shared-runtime-id");
    expect(proposal.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "duplicate_instance_id" })
    );
  });

  it("fingerprints globals and file identity/order but ignores document bodies", () => {
    const operation = createOperationFile("main");
    const globals = {
      id: "globals",
      name: "globals",
      type: "globals" as const,
      createdAt: 1,
      content: { value: createData({ value: 1 }) },
    };
    const docs = {
      id: "docs",
      name: "docs",
      type: "documentation" as const,
      createdAt: 2,
      content: "large body",
    };
    const project = createTestProject({ files: [operation, globals, docs] });
    const fingerprint = getAgentEditableFingerprint(project);
    const globalChanged = structuredClone(project);
    if (globalChanged.files[1].type === "globals")
      globalChanged.files[1].content.value = createData({ value: 2 });
    expect(getAgentEditableFingerprint(globalChanged)).not.toBe(fingerprint);
    const reordered = structuredClone(project);
    reordered.files.reverse();
    expect(getAgentEditableFingerprint(reordered)).not.toBe(fingerprint);
    const docsChanged = structuredClone(project);
    if (docsChanged.files[2].type === "documentation")
      docsChanged.files[2].content = "unrelated replacement body";
    expect(getAgentEditableFingerprint(docsChanged)).toBe(fingerprint);
  });
});
