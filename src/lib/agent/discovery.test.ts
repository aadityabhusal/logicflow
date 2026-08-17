import { afterEach, describe, expect, it, vi } from "vitest";
import { createOperationFile, createTestProject } from "../../tests/helpers";
import { PACKAGE_CATALOG } from "../packages/catalog";
import { loadedPackageOperations } from "../packages/registry";
import { createData } from "../utils";
import { AgentOperationLookupSchema, createAgentDiscovery } from "./discovery";

afterEach(() => vi.restoreAllMocks());

describe("agent operation discovery", () => {
  it("builds bounded selected-operation context without sensitive project configuration", async () => {
    const selected = createOperationFile("main");
    selected.documentation = "keep metadata";
    selected.content.value.parameters = [
      {
        id: "parameter-statement",
        name: "input",
        data: createData({ value: "input" }),
        operations: [],
      },
    ];
    selected.content.value.statements = [
      {
        id: "body-statement",
        name: "result",
        data: createData({ value: "result" }),
        operations: [],
      },
    ];
    const helper = createOperationFile("helper");
    const project = createTestProject({
      files: [selected, helper],
      deployment: {
        envVariables: [{ key: "SECRET", value: "secret-value" }],
        platforms: [],
      },
    });
    const discovery = await createAgentDiscovery(project, selected.id);
    const context = discovery.buildContextSnapshot();
    expect(context.selectedOperation).toEqual(selected.content);
    expect(context.projectOperations).toMatchObject([
      { name: "helper", operationId: helper.id },
    ]);
    expect(context.selectedFileMetadata.documentation).toBe("keep metadata");
    expect(context.statementTargets).toEqual({
      parameters: [{ id: "parameter-statement", name: "input" }],
      body: [{ id: "body-statement", name: "result" }],
    });
    expect(JSON.stringify(context)).not.toContain("secret-value");
  });

  it("does not include operation test values in provider context", async () => {
    const selected = createOperationFile("main");
    selected.tests = [
      {
        name: "private fixture",
        inputs: [createData({ value: "secret input" })],
        expectedOutput: createData({ value: "secret output" }),
      },
    ];
    const discovery = await createAgentDiscovery(
      createTestProject({ files: [selected] }),
      selected.id
    );

    const context = discovery.buildContextSnapshot();
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("secret input");
    expect(serialized).not.toContain("secret output");
    expect(context.selectedFileMetadata.tests).toBe(1);
  });

  it("gives empty operations construction guidance", async () => {
    const selected = createOperationFile("operation1");
    const discovery = await createAgentDiscovery(
      createTestProject({ files: [selected] }),
      selected.id
    );

    const context = discovery.buildContextSnapshot();

    expect(context.statementTargets).toEqual({ parameters: [], body: [] });
    expect(context.instruction).toContain("no parameters or body statements");
    expect(context.instruction).toContain("beforeStatementId null");
    expect(context.instruction).toContain("complete body logic");
    expect(context.instruction).toContain("returned implicitly");
    expect(context.instruction).toContain("Do not use replace_statement");
  });

  it("performs deterministic bounded builtin and project lookup without handles", async () => {
    const selected = createOperationFile("main");
    const helper = createOperationFile("formatMessage");
    helper.content.type.result = { kind: "string" };
    const discovery = await createAgentDiscovery(
      createTestProject({ files: [selected, helper] }),
      selected.id
    );
    const [builtins, project] = await discovery.lookupOperations({
      requests: [
        { query: "length", inputType: { kind: "string" } },
        { query: "formatMessage" },
      ],
    });
    expect(builtins[0]).toMatchObject({
      name: "length",
      source: "builtin",
      parameters: [{ type: { kind: "string" } }],
    });
    expect(project).toEqual([
      expect.objectContaining({
        name: "formatMessage",
        source: "project",
        operationId: helper.id,
      }),
    ]);
    expect(project[0]).not.toHaveProperty("handle");
  });

  it("accepts builtin semantic lookup phrases", async () => {
    const discovery = await createAgentDiscovery(createTestProject());

    const [filter, modulo, even] = await discovery.lookupOperations({
      requests: [
        {
          query: "filter an array using a predicate callback",
          package: "builtin",
          inputType: {
            kind: "operation",
            parameters: [
              {
                type: { kind: "array", elementType: { kind: "number" } },
              },
              {
                type: {
                  kind: "operation",
                  parameters: [{ type: { kind: "number" } }],
                  result: { kind: "boolean" },
                },
              },
            ],
            result: { kind: "array", elementType: { kind: "number" } },
          },
        },
        {
          query: "remainder or modulo of two numbers",
          package: "builtin",
          inputType: { kind: "number" },
        },
        {
          query: "even",
          package: "builtin",
          inputType: { kind: "number" },
        },
      ],
    });

    expect(filter).toContainEqual(
      expect.objectContaining({
        name: "filter",
        source: "builtin",
        result: { kind: "array", elementType: { kind: "number" } },
      })
    );
    expect(modulo).toContainEqual(
      expect.objectContaining({ name: "mod", source: "builtin" })
    );
    expect(even).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "isDeepEqual", source: "builtin" }),
        expect.objectContaining({ name: "mod", source: "builtin" }),
      ])
    );
  });

  it("loads a disabled package only when its exact catalog key is requested and does not mutate the registry", async () => {
    vi.spyOn(PACKAGE_CATALOG.wretch, "load").mockResolvedValue({
      operations: [
        {
          name: "request",
          parameters: [{ type: { kind: "string" } }],
          expectedType: { kind: "boolean" },
          handler: () => ({
            id: "result",
            type: { kind: "boolean" },
            value: true,
          }),
        },
      ],
    });
    const discovery = await createAgentDiscovery(createTestProject());
    expect(
      (
        await discovery.lookupOperations({ requests: [{ query: "request" }] })
      )[0]
    ).toEqual([]);
    const result = (
      await discovery.lookupOperations({
        requests: [
          {
            query: "request",
            package: "wretch",
            inputType: { kind: "string" },
          },
        ],
      })
    )[0];
    expect(result).toEqual([
      expect.objectContaining({
        name: "wretch.request",
        source: "package",
        package: "wretch",
        result: { kind: "boolean" },
      }),
    ]);
    expect(loadedPackageOperations.has("wretch")).toBe(false);
  });

  it("strictly bounds lookup requests and rejects unsupported packages", async () => {
    expect(
      AgentOperationLookupSchema.safeParse({
        requests: Array.from({ length: 11 }, () => ({ query: "x" })),
      }).success
    ).toBe(false);
    expect(
      AgentOperationLookupSchema.safeParse({
        requests: [{ query: "x", extra: true }],
      }).success
    ).toBe(false);
    const discovery = await createAgentDiscovery(createTestProject());
    await expect(
      discovery.lookupOperations({
        requests: [{ query: "x", package: "unsupported" }],
      })
    ).rejects.toEqual(expect.objectContaining({ code: "unsupported_package" }));
  });

  it("rejects duplicate project operation names", async () => {
    const duplicate = createOperationFile("same");
    duplicate.id = "other-id";
    await expect(
      createAgentDiscovery(
        createTestProject({ files: [createOperationFile("same"), duplicate] })
      )
    ).rejects.toEqual(
      expect.objectContaining({ code: "duplicate_operation_name" })
    );
  });
});
