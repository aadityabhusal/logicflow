import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOperationFile,
  createTestProject,
  testOperation,
} from "../../tests/helpers";
import { PACKAGE_CATALOG } from "../packages/catalog";
import { loadedPackageOperations } from "../packages/registry";
import type { OperationType } from "../types";
import { createData, createStatement } from "../utils";
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
    expect(context.languagePrimitives).toEqual([
      expect.objectContaining({ name: "get", source: "builtin" }),
      expect.objectContaining({ name: "await", source: "builtin" }),
    ]);
    expect(JSON.stringify(context)).not.toContain("secret-value");
  });

  it("includes descriptors for operations used inside nested callbacks", async () => {
    const nested = createStatement({
      data: createData({ value: "value" }),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [{ type: { kind: "string" } }],
            result: { kind: "number" },
          },
          value: { name: "length", parameters: [], statements: [] },
        }),
      ],
    });
    const selected = createOperationFile("main");
    selected.content.value.statements = [
      createStatement({ data: testOperation([], [nested]) }),
    ];
    const discovery = await createAgentDiscovery(
      createTestProject({ files: [selected] }),
      selected.id
    );

    const context = discovery.buildContextSnapshot();

    expect(context.usedOperations).toContainEqual(
      expect.objectContaining({ name: "length", source: "builtin" })
    );
    expect(context.languagePrimitives).toHaveLength(2);
    expect(context.languagePrimitives).not.toContainEqual(
      expect.objectContaining({ name: "map" })
    );
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

  it("finds property access from a descriptive lookup", async () => {
    const discovery = await createAgentDiscovery(createTestProject());
    const [propertyAccess] = await discovery.lookupOperations({
      requests: [
        {
          query: "read object property by key title",
          package: "builtin",
          inputType: { kind: "unknown" },
        },
      ],
    });

    expect(propertyAccess[0]).toEqual(
      expect.objectContaining({ name: "get", source: "builtin" })
    );
  });

  it("resolves await results from the input Promise type", async () => {
    const discovery = await createAgentDiscovery(createTestProject());
    const [awaitOperations] = await discovery.lookupOperations({
      requests: [
        {
          query: "await",
          package: "builtin",
          inputType: {
            kind: "instance",
            className: "Promise",
            constructorArgs: [],
            result: { kind: "array", elementType: { kind: "string" } },
          },
        },
      ],
    });

    expect(awaitOperations[0]).toMatchObject({
      name: "await",
      source: "builtin",
      result: { kind: "array", elementType: { kind: "string" } },
    });
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

  it("treats unknown receiver types as unconstrained during package lookup", async () => {
    const discovery = await createAgentDiscovery(createTestProject());
    const [factory, wretchGet, fetch, json, propertyAccess, incompatible] =
      await discovery.lookupOperations({
        requests: [
          {
            query: "Create a wretch client for a URL",
            package: "wretch",
            inputType: { kind: "undefined" },
          },
          {
            query: "GET request on a wretch client",
            package: "wretch",
            inputType: { kind: "unknown" },
          },
          {
            query: "fetch",
            package: "wretch",
            inputType: { kind: "unknown" },
          },
          {
            query: "Parse a wretch response as JSON",
            package: "wretch",
            inputType: { kind: "unknown" },
          },
          {
            query: "read object property by key title",
            package: "builtin",
            inputType: { kind: "unknown" },
          },
          {
            query: "get",
            package: "wretch",
            inputType: { kind: "string" },
          },
        ],
      });

    expect(factory).toContainEqual(
      expect.objectContaining({
        name: "wretch",
        package: "wretch",
        result: expect.objectContaining({
          kind: "instance",
          className: "wretch.Wretch",
        }),
      })
    );
    expect(wretchGet).toContainEqual(
      expect.objectContaining({
        name: "wretch.get",
        package: "wretch",
        result: expect.objectContaining({
          kind: "instance",
          className: "wretch.WretchResponseChain",
        }),
      })
    );
    expect(fetch).toContainEqual(
      expect.objectContaining({
        name: "wretch.fetch",
        result: expect.objectContaining({
          kind: "instance",
          className: "wretch.WretchResponseChain",
        }),
      })
    );
    expect(json).toContainEqual(
      expect.objectContaining({
        name: "wretch.json",
        package: "wretch",
        operationSource: { name: "wretchResponseChain" },
        result: {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
          result: { kind: "unknown" },
        },
      })
    );
    expect(propertyAccess).toContainEqual(
      expect.objectContaining({
        name: "get",
        source: "builtin",
      })
    );
    expect(incompatible).toEqual([]);
  });

  it("handles the unresolved reference receiver from the captured lookup", async () => {
    const discovery = await createAgentDiscovery(createTestProject());
    const [operations] = await discovery.lookupOperations({
      requests: [
        {
          query: "fetch a URL and create a wretch request",
          package: "wretch",
          inputType: { kind: "reference", name: "wretch", isEnv: false },
        },
      ],
    });

    expect(operations).toContainEqual(
      expect.objectContaining({
        name: "wretch",
        result: expect.objectContaining({
          kind: "instance",
          className: "wretch.Wretch",
        }),
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        name: "wretch.fetch",
        result: expect.objectContaining({
          kind: "instance",
          className: "wretch.WretchResponseChain",
        }),
      })
    );
  });

  it("ranks chained package and builtin lookups by descriptive intent", async () => {
    const discovery = await createAgentDiscovery(createTestProject());
    const [factory, wretchGet, fetch, json, map, get] =
      await discovery.lookupOperations({
        requests: [
          {
            query: "create a wretch client for a URL",
            package: "wretch",
            inputType: { kind: "string" },
          },
          {
            query: "GET request on a wretch client",
            package: "wretch",
            inputType: { kind: "unknown" },
          },
          {
            query: "fetch a URL and create a wretch request operation",
            package: "wretch",
            inputType: { kind: "unknown" },
          },
          {
            query: "parse the wretch response as JSON",
            package: "wretch",
            inputType: { kind: "unknown" },
          },
          {
            query: "map each array item with an operation",
            package: "builtin",
            inputType: { kind: "unknown" },
          },
          {
            query: "read object property by key",
            package: "builtin",
            inputType: { kind: "unknown" },
          },
        ],
      });

    expect(factory).toContainEqual(
      expect.objectContaining({ name: "wretch", package: "wretch" })
    );
    expect(wretchGet[0]).toEqual(
      expect.objectContaining({
        name: "wretch.get",
        operationSource: { name: "wretch" },
        result: expect.objectContaining({
          kind: "instance",
          className: "wretch.WretchResponseChain",
        }),
      })
    );
    expect(fetch[0]).toEqual(
      expect.objectContaining({ name: "wretch.fetch", package: "wretch" })
    );
    expect(
      fetch.findIndex(({ name }) => name === "wretch.fetchError")
    ).toBeGreaterThan(0);
    expect(json[0]).toEqual(
      expect.objectContaining({
        name: "wretch.json",
        operationSource: { name: "wretchResponseChain" },
        result: {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
          result: { kind: "unknown" },
        },
      })
    );
    expect(map[0]).toEqual(
      expect.objectContaining({ name: "map", source: "builtin" })
    );
    expect(get[0]).toEqual(
      expect.objectContaining({ name: "get", source: "builtin" })
    );
  });

  it("preserves valid operation names that are generic in descriptive queries", async () => {
    const request = createOperationFile("request");
    const discovery = await createAgentDiscovery(
      createTestProject({ files: [request] })
    );
    const [operations] = await discovery.lookupOperations({
      requests: [{ query: "call the request operation" }],
    });

    expect(operations).toContainEqual(
      expect.objectContaining({ name: "request", source: "project" })
    );
  });

  it("resolves known reference receiver types from project context", async () => {
    const helper = createOperationFile("helper");
    helper.content.type.result = { kind: "string" };
    const discovery = await createAgentDiscovery(
      createTestProject({ files: [helper] })
    );
    const [call] = await discovery.lookupOperations({
      requests: [
        {
          query: "call",
          package: "builtin",
          inputType: { kind: "reference", name: "helper" },
        },
      ],
    });

    expect(call).toContainEqual(
      expect.objectContaining({
        name: "call",
        result: { kind: "string" },
      })
    );
  });

  it("qualifies an unqualified package instance receiver during lookup", async () => {
    const discovery = await createAgentDiscovery(createTestProject());
    const [get] = await discovery.lookupOperations({
      requests: [
        {
          query: "Perform a GET request on a wretch request",
          package: "wretch",
          inputType: {
            kind: "instance",
            className: "Wretch",
            constructorArgs: [],
            result: { kind: "unknown" },
          },
        },
      ],
    });

    expect(get).toContainEqual(
      expect.objectContaining({
        name: "wretch.get",
        package: "wretch",
        operationSource: { name: "wretch" },
      })
    );
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
