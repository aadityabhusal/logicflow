import { afterEach, describe, expect, it, vi } from "vitest";
import { PACKAGE_CATALOG } from "../packages/catalog";
import { loadedPackageOperations } from "../packages/registry";
import {
  createOperationFile,
  createTestProject,
  stringStatement,
} from "../../tests/helpers";
import { AgentDiscoveryError, createAgentDiscovery } from "./discovery";

afterEach(() => vi.restoreAllMocks());

describe("agent discovery", () => {
  it("returns a compact outline without persistent IDs or sensitive config", async () => {
    const operation = createOperationFile("formatMessage");
    const project = createTestProject({
      files: [
        operation,
        {
          id: "secret-file-id",
          name: "notes",
          type: "documentation",
          content: "private document body",
          createdAt: 1,
        },
      ],
      deployment: {
        envVariables: [{ key: "TOKEN", value: "secret-value" }],
        platforms: [],
      },
    });

    const discovery = await createAgentDiscovery(project, operation.id);
    const outline = discovery.getProjectOutline();
    const serialized = JSON.stringify(outline);

    expect(outline.currentOperationHandle).toMatch(/^operation_/);
    expect(outline.operations[0].name).toBe("formatMessage");
    expect(serialized).not.toContain(operation.id);
    expect(serialized).not.toContain("secret-file-id");
    expect(serialized).not.toContain("private document body");
    expect(serialized).not.toContain("secret-value");
  });

  it("inspects project structure through a scoped handle", async () => {
    const operation = createOperationFile("formatMessage");
    operation.content.type.parameters = [
      { name: "message", type: { kind: "string" } },
    ];
    operation.content.value.statements = [stringStatement("Hello", "result")];
    const discovery = await createAgentDiscovery(
      createTestProject({ files: [operation] })
    );
    const handle = discovery.getProjectOutline().operations[0].handle;

    const inspection = discovery.inspectOperation(handle);

    expect(inspection).toMatchObject({
      name: "formatMessage",
      source: "project",
      parameters: [{ name: "message", type: { kind: "string" } }],
      statements: [{ name: "result", value: "Hello" }],
    });
    expect(JSON.stringify(inspection)).not.toContain(
      operation.content.value.statements[0].id
    );
  });

  it("rejects unknown and stale handles explicitly", async () => {
    const project = createTestProject({
      files: [createOperationFile("formatMessage")],
    });
    const first = await createAgentDiscovery(project);
    const second = await createAgentDiscovery(project);
    const oldHandle = first.getProjectOutline().operations[0].handle;

    expect(() => first.inspectOperation("invalid")).toThrowError(
      expect.objectContaining({ code: "unknown_handle" })
    );
    expect(() => second.inspectOperation(oldHandle)).toThrowError(
      expect.objectContaining({ code: "stale_handle" })
    );
  });

  it("searches project operations and excludes the caller", async () => {
    const caller = createOperationFile("caller");
    const target = createOperationFile("formatMessage");
    const discovery = await createAgentDiscovery(
      createTestProject({ files: [caller, target] }),
      caller.id
    );

    expect(discovery.searchOperations({ source: "project" })).toMatchObject([
      { name: "formatMessage", source: "project" },
    ]);
  });

  it("filters core operations by input type", async () => {
    const discovery = await createAgentDiscovery(createTestProject());

    const results = discovery.searchOperations({
      query: "add",
      inputType: { kind: "number" },
    });

    expect(results.some((operation) => operation.name === "add")).toBe(true);
    expect(
      discovery.searchOperations({
        query: "please add these numbers",
        inputType: { kind: "number" },
      })[0].name
    ).toBe("add");
    expect(
      discovery
        .searchOperations({
          query: "add",
          inputType: { kind: "string" },
        })
        .some((operation) => operation.name === "add")
    ).toBe(false);
    expect(
      discovery
        .searchOperations({
          query: "map",
          inputType: { kind: "array", elementType: { kind: "string" } },
        })
        .some((operation) => operation.name.includes("map"))
    ).toBe(true);
  });

  it("loads operations only from enabled supported packages", async () => {
    vi.spyOn(PACKAGE_CATALOG.wretch, "load").mockResolvedValue({
      operations: [
        {
          name: "packageOperation",
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
    const enabled = await createAgentDiscovery(
      createTestProject({
        dependencies: {
          npm: [
            {
              name: "wretch",
              version: "1",
              exports: [],
            },
          ],
        },
      })
    );
    const disabled = await createAgentDiscovery(createTestProject());

    expect(
      enabled.searchOperations({
        query: "packageOperation",
        source: "package",
      })[0]
    ).toMatchObject({
      name: "packageOperation",
      source: "package",
      packageName: "wretch",
    });
    const handle = enabled.searchOperations({ source: "package" })[0].handle;
    expect(enabled.describeOperations([handle])[0]).toMatchObject({
      packageKey: "wretch",
      packageName: "wretch",
      importKind: "default",
      parameters: [{ name: "arg1", type: { kind: "string" } }],
    });
    expect(loadedPackageOperations.has("wretch")).toBe(false);
    expect(
      disabled.searchOperations({
        query: "packageOperation",
        source: "package",
      })
    ).toEqual([]);
  });

  it("reports duplicate project operation names", async () => {
    const duplicate = createOperationFile("duplicate");
    duplicate.id = "second-operation";

    await expect(
      createAgentDiscovery(
        createTestProject({
          files: [createOperationFile("duplicate"), duplicate],
        })
      )
    ).rejects.toEqual(
      expect.objectContaining<Partial<AgentDiscoveryError>>({
        code: "duplicate_operation_name",
      })
    );
  });

  it("searches only the supported package catalog with bounded results", async () => {
    const discovery = await createAgentDiscovery(createTestProject());

    expect(discovery.searchPackages("faker", 100)).toMatchObject([
      { name: "faker", packageName: "@faker-js/faker", enabled: false },
    ]);
    expect(discovery.searchPackages("not-a-supported-package")).toEqual([]);
  });
});
