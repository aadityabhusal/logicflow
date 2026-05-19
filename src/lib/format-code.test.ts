import { describe, it, expect, beforeAll } from "vitest";
import {
  generateData,
  generateOperation,
  createCodeGenContext,
} from "@/lib/format-code";
import { createData, createStatement, isDataOfType } from "@/lib/utils";
import {
  createTestContext,
  testString,
  testNumber,
  testBoolean,
  testArray,
  testObject,
  testOperation,
  testReference,
  testError,
  testUnion,
  stringStatement,
  numberStatement,
  testTuple,
  testDictionary,
  testCondition,
  booleanStatement,
} from "@/tests/helpers";
import { syncPackageRegistry } from "@/lib/operations/built-in";
import { operations as wretchOperations } from "@/lib/operations/wretch";
import type { DataType, OperationType } from "@/lib/types";

describe("generateData", () => {
  it("generates string literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(testString("hello"), ctx);
    expect(result).toBe('"hello"');
  });

  it("generates empty string literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(testString(""), ctx);
    expect(result).toBe('""');
  });

  it("generates number literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    expect(generateData(testNumber(42), ctx)).toBe("42");
  });

  it("generates zero number literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    expect(generateData(testNumber(0), ctx)).toBe("0");
  });

  it("generates boolean literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    expect(generateData(testBoolean(true), ctx)).toBe("true");
    expect(generateData(testBoolean(false), ctx)).toBe("false");
  });

  it("generates undefined", () => {
    const ctx = createCodeGenContext(createTestContext());
    const data = createData({ type: { kind: "undefined" } });
    const result = generateData(data, ctx);
    expect(result).toBe("undefined");
  });

  it("generates array literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    const arr = testArray([stringStatement("a"), stringStatement("b")]);
    const result = generateData(arr, ctx);
    expect(result).toBe('["a", "b"]');
  });

  it("generates empty array literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    const arr = testArray([], { kind: "string" });
    const result = generateData(arr, ctx);
    expect(result).toBe("[]");
  });

  it("generates object literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    const obj = testObject([{ key: "name", value: stringStatement("test") }]);
    const result = generateData(obj, ctx);
    expect(result).toBe('{name: "test"}');
  });

  it("generates error as new Error", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(testError("oops"), ctx);
    expect(result).toBe('new Error("oops")');
  });

  it("generates reference as variable name", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(testReference("myVar", "stmt1"), ctx);
    expect(result).toBe("myVar");
  });

  it("generates env reference with process.env", () => {
    const ctx = createCodeGenContext(createTestContext());
    const ref = createData({
      type: { kind: "reference", name: "API_KEY", isEnv: true },
      value: { name: "API_KEY", id: "env1" },
    });
    const result = generateData(ref, ctx);
    expect(result).toBe("process.env.API_KEY");
  });

  it("generates instance with new keyword", () => {
    const ctx = createCodeGenContext(createTestContext());
    const data = createData({
      type: { kind: "instance", className: "Date", constructorArgs: [] },
    });
    const result = generateData(data, ctx);
    expect(result).toContain("new Date");
  });

  it("generates instance with constructor arguments", () => {
    const ctx = createCodeGenContext(createTestContext());
    const data = createData({
      type: {
        kind: "instance",
        className: "URL",
        constructorArgs: [
          { name: "url", type: { kind: "string" } },
          { name: "base", type: { kind: "string" }, isOptional: true },
        ],
      },
      value: {
        className: "URL",
        instanceId: "id1",
        constructorArgs: [stringStatement("https://example.com")],
      },
    });
    const result = generateData(data, ctx);
    expect(result).toContain("new URL");
    expect(result).toContain('"https://example.com"');
  });

  it("generates union data as active type", () => {
    const ctx = createCodeGenContext(createTestContext());
    const union = testUnion([{ kind: "string" }, { kind: "number" }], "hello");
    const result = generateData(union, ctx);
    expect(result).toBe('"hello"');
  });

  it("generates tuple literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    const tuple = testTuple([stringStatement("a"), numberStatement(1)]);
    const result = generateData(tuple, ctx);
    expect(result).toBe('["a", 1]');
  });

  it("generates operation data as callback", () => {
    const ctx = createCodeGenContext(createTestContext());
    const op = testOperation(
      [stringStatement("", "x")],
      [stringStatement("result")]
    );
    const result = generateData(op, ctx);
    expect(result).toContain("x");
    expect(result).toContain("=>");
  });

  it("adds reference name to importedOperations", () => {
    const ctx = createCodeGenContext(createTestContext());
    ctx.variables.set("myImportedOp", {
      data: testOperation([], [], "myImportedOp"),
    });
    generateData(testReference("myImportedOp", "stmt1"), ctx);
    expect(ctx.importedOperations.has("myImportedOp")).toBe(true);
  });

  it("does not import references to ordinary variables", () => {
    const ctx = createCodeGenContext(createTestContext());
    ctx.variables.set("myValue", { data: testString("value") });

    const result = generateData(testReference("myValue", "stmt1"), ctx);

    expect(result).toBe("myValue");
    expect(ctx.importedOperations.has("myValue")).toBe(false);
  });

  it("generates built-in operation references without user imports", () => {
    const ctx = createCodeGenContext(createTestContext());
    ctx.variables.set("length", {
      data: createData<OperationType>({
        id: "builtin:length",
        type: {
          kind: "operation",
          parameters: [{ type: { kind: "string" } }],
          result: { kind: "number" },
        },
        value: { name: "length", parameters: [], statements: [] },
      }),
    });

    const result = generateData(testReference("length", "stmt1"), ctx);

    expect(result).toBe("_.length");
    expect(ctx.importedOperations.has("length")).toBe(false);
  });

  it("generates bracket access for env references that are not valid identifiers", () => {
    const ctx = createCodeGenContext(createTestContext());
    const ref = createData({
      type: { kind: "reference", name: "API-KEY", isEnv: true },
      value: { name: "API-KEY", id: "env1" },
    });

    expect(generateData(ref, ctx)).toBe('process.env["API-KEY"]');
  });
});

describe("createCodeGenContext", () => {
  it("creates context with default options", () => {
    const ctx = createCodeGenContext(createTestContext());
    expect(ctx.importedOperations).toBeInstanceOf(Set);
    expect(typeof ctx.getOperation).toBe("function");
  });

  it("creates context with showResult option", () => {
    const ctx = createCodeGenContext(createTestContext(), { showResult: true });
    expect(ctx.showResult).toBe(true);
  });

  it("getOperation finds built-in operations", () => {
    const ctx = createCodeGenContext(createTestContext());
    const op = ctx.getOperation("length");
    expect(op).toBeDefined();
    expect(op?.name).toBe("length");
  });

  it("getOperation returns undefined for unknown operation", () => {
    const ctx = createCodeGenContext(createTestContext());
    expect(ctx.getOperation("nonexistent")).toBeUndefined();
  });

  it("starts with empty importedOperations", () => {
    const ctx = createCodeGenContext(createTestContext());
    expect(ctx.importedOperations.size).toBe(0);
  });
});

describe("generateOperation", () => {
  it("generates complete module with imports", () => {
    const ctx = createTestContext();
    const op = testOperation(
      [stringStatement("", "input")],
      [stringStatement("output")],
      "myOp"
    );
    const result = generateOperation(op, ctx);
    expect(result).toContain("import");
    expect(result).toContain("export default");
    expect(result).toContain("input");
  });

  it("generates callback syntax for operation", () => {
    const ctx = createTestContext();
    const param = stringStatement("", "input");
    const stmt = stringStatement("result");
    const op = testOperation([param], [stmt], "transform");
    const result = generateOperation(op, ctx);
    expect(result).toContain("input");
    expect(result).toContain("return");
  });

  it("generates async keyword for async operations", () => {
    const ctx = createTestContext();
    const op = testOperation([], [], "asyncOp");
    op.value.isAsync = true;
    const result = generateOperation(op, ctx);
    expect(result).toContain("async");
  });

  it("generates correct return value from last statement", () => {
    const ctx = createTestContext();
    const stmt1 = stringStatement("intermediate", "temp");
    const stmt2 = numberStatement(42);
    const op = testOperation([], [stmt1, stmt2], "multiStmt");
    const result = generateOperation(op, ctx);
    expect(result).toContain("return 42");
  });

  it("trims declaration from named last statement return", () => {
    const ctx = createTestContext();
    const stmt = numberStatement(42, "result");
    const op = testOperation([], [stmt], "namedLastStmt");
    const result = generateOperation(op, ctx);
    expect(result).toContain("return 42");
    expect(result).not.toContain("return const");
  });

  it("generates empty body for empty statements", () => {
    const ctx = createTestContext();
    const op = testOperation([], [], "emptyOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("() => {");
  });

  it("includes user-defined operation imports when referenced", () => {
    const ctx = createTestContext();
    ctx.variables.set("otherOp", { data: testOperation([], [], "otherOp") });
    const refStmt = createStatement({
      data: testReference("otherOp", "stmt1"),
    });
    const op = testOperation([], [refStmt], "usesOtherOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("otherOp");
  });

  it("generates multi-statement operation with named intermediate variables", () => {
    const ctx = createTestContext();
    const stmt1 = stringStatement("hello", "temp");
    const stmt2 = numberStatement(42);
    const op = testOperation([], [stmt1, stmt2], "multiStmt");
    const result = generateOperation(op, ctx);
    expect(result).toContain("const temp");
    expect(result).toContain("return 42");
  });

  it("generates pipe syntax for statement with operations", () => {
    const ctx = createTestContext();
    const lengthOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("hello"),
      operations: [lengthOp],
    });
    const op = testOperation([], [stmt], "withPipe");
    const result = generateOperation(op, ctx);
    expect(result).toContain("R.pipe");
    expect(result).toContain("_.length");
  });

  it("generates isTypeOf with an example value parameter", () => {
    const ctx = createTestContext();
    const input = createStatement({
      name: "input",
      data: testUnion([{ kind: "string" }, { kind: "number" }], 42),
    });
    const isTypeOf = createData({
      type: {
        kind: "operation",
        parameters: [{ type: input.data.type }, { type: { kind: "number" } }],
        result: { kind: "boolean" },
      },
      value: {
        name: "isTypeOf",
        parameters: [numberStatement(0)],
        statements: [],
      },
    });
    const op = testOperation(
      [input],
      [
        createStatement({
          data: testReference("input", input.id),
          operations: [isTypeOf],
        }),
      ],
      "checkType"
    );

    const result = generateOperation(op, ctx);

    expect(result).toContain("_.isTypeOf(0)");
  });

  it("generates await R.pipeAsync for async operations", () => {
    const ctx = createTestContext();
    const awaitOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "undefined" },
      },
      value: { name: "await", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("hello"),
      operations: [awaitOp],
    });
    const op = testOperation([], [stmt], "asyncPipe");
    op.value.isAsync = true;
    const result = generateOperation(op, ctx);
    expect(result).toContain("async");
    expect(result).toContain("_.pipeAsync");
  });

  it("generates with showResult option resolving values", () => {
    const ctx = createCodeGenContext(createTestContext(), { showResult: true });
    const stmt = stringStatement("hello");
    const result = generateData(stmt.data, ctx);
    expect(result).toBe('"hello"');
  });
});

describe("wretch code generation", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "wretch" }]);
  });

  const WretchType = {
    kind: "instance" as const,
    className: "wretch.Wretch",
    constructorArgs: [],
  };

  function createWretchOp() {
    return createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" as const } }],
        result: WretchType,
      },
      value: {
        name: "wretch",
        parameters: [],
        statements: [],
        source: { name: "wretch" },
      },
    });
  }

  it("generates wretch as a package operation on strings", () => {
    const ctx = createCodeGenContext(createTestContext());
    const stmt = createStatement({
      data: testString("https://api.example.com"),
      operations: [createWretchOp()],
    });
    const op = testOperation([], [stmt], "wretchTest");
    const result = generateOperation(op, ctx);
    expect(result).toContain("import wretch from 'wretch'");
    expect(result).toContain('R.pipe("https://api.example.com", wretch)');
  });

  it("generates same-named package member operations without treating them as imports", () => {
    const ctx = createCodeGenContext(createTestContext());
    const memberOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" as const } }],
        result: WretchType,
      },
      value: {
        name: "wretch",
        parameters: [],
        statements: [],
        source: {
          name: "wretch",
          packageCallTarget: "member",
        },
      },
    });
    const stmt = createStatement({
      data: testString("https://api.example.com"),
      operations: [memberOp],
    });
    const op = testOperation([], [stmt], "wretchMemberTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import wretch from 'wretch'");
    expect(result).toContain(
      'R.pipe("https://api.example.com", wretch.wretch)'
    );
  });

  it("formats Wretch instances as package class constructors", () => {
    const ctx = createCodeGenContext(createTestContext(), { showResult: true });
    const data = createData({ type: WretchType });
    expect(generateData(data, ctx)).toBe("new wretch.Wretch()");
    expect(ctx.usedPackages.has("wretch")).toBe(true);
  });

  it("keeps Wretch factory inputs on the returned instance for cache keys", async () => {
    const ctx = createTestContext();
    const op = wretchOperations.find(
      (operation) => operation.name === "wretch"
    );
    if (!op || !("handler" in op)) throw new Error("wretch operation missing");

    const url = testString("https://api.example.com");
    const result = await op.handler(ctx, url);
    if (!isDataOfType(result, "instance")) {
      throw new Error("wretch operation should return a Wretch instance");
    }

    expect(result.value.constructorArgs[0].data).toBe(url);
  });

  it("generates instance method call for wretch source operations", () => {
    const ctx = createCodeGenContext(createTestContext());
    const urlOp = createData({
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "wretch.Wretch",
              constructorArgs: [],
            },
          },
          { type: { kind: "string" } },
        ],
        result: {
          kind: "instance",
          className: "wretch.Wretch",
          constructorArgs: [],
        },
      },
      value: {
        name: "url",
        parameters: [stringStatement("/users")],
        statements: [],
        source: { name: "wretch" },
      },
    });
    const stmt = createStatement({
      data: testString("https://api.example.com"),
      operations: [createWretchOp(), urlOp],
    });
    const op = testOperation([], [stmt], "wretchTest");
    const result = generateOperation(op, ctx);
    expect(result).toContain("import wretch from 'wretch'");
    expect(result).toContain(
      'R.pipe("https://api.example.com", wretch, (arg) => arg.url("/users"))'
    );
  });

  it("generates instance method call for wretchResponseChain source operations", () => {
    const ctx = createCodeGenContext(createTestContext());
    const jsonOp = createData({
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "wretch.WretchResponseChain",
              constructorArgs: [],
            },
          },
        ],
        result: { kind: "unknown" },
      },
      value: {
        name: "json",
        parameters: [],
        statements: [],
        source: { name: "wretchResponseChain" },
      },
    });
    const stmt = createStatement({
      data: testString("ignored"),
      operations: [jsonOp],
    });
    const op = testOperation([], [stmt], "chainTest");
    const result = generateOperation(op, ctx);
    expect(result).toContain("import wretch from 'wretch'");
    expect(result).toContain('R.pipe("ignored", (arg) => arg.json())');
  });

  it("includes wretch import when wretch operation is used", () => {
    const ctx = createTestContext();
    const stmt = createStatement({
      data: testString("https://api.example.com"),
      operations: [createWretchOp()],
    });
    const op = testOperation([], [stmt], "usesWretch");
    const result = generateOperation(op, ctx);
    expect(result).toContain("import wretch from 'wretch'");
  });

  it("omits wretch import when no wretch usage", () => {
    const ctx = createTestContext();
    const stmt = createStatement({ data: testString("hello") });
    const op = testOperation([], [stmt], "noWretch");
    const result = generateOperation(op, ctx);
    expect(result).not.toContain("import wretch");
  });

  it("generates complete wretch pipeline with proper method chaining", () => {
    const ctx = createCodeGenContext(createTestContext());

    const urlOp = createData({
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "wretch.Wretch",
              constructorArgs: [],
            },
          },
          { type: { kind: "string" } },
        ],
        result: {
          kind: "instance",
          className: "wretch.Wretch",
          constructorArgs: [],
        },
      },
      value: {
        name: "url",
        parameters: [stringStatement("/users")],
        statements: [],
        source: { name: "wretch" },
      },
    });

    const getOp = createData({
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "wretch.Wretch",
              constructorArgs: [],
            },
          },
        ],
        result: {
          kind: "instance",
          className: "wretch.WretchResponseChain",
          constructorArgs: [],
        },
      },
      value: {
        name: "get",
        parameters: [],
        statements: [],
        source: { name: "wretch" },
      },
    });

    const jsonOp = createData({
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "wretch.WretchResponseChain",
              constructorArgs: [],
            },
          },
        ],
        result: { kind: "unknown" },
      },
      value: {
        name: "json",
        parameters: [],
        statements: [],
        source: { name: "wretchResponseChain" },
      },
    });

    const stmt = createStatement({
      data: testString("https://api.example.com"),
      operations: [createWretchOp(), urlOp, getOp, jsonOp],
    });

    const op = testOperation([], [stmt], "fetchUsers");
    const result = generateOperation(op, ctx);
    expect(result).toContain("import wretch from 'wretch'");
    expect(result).toContain(
      'R.pipe("https://api.example.com", wretch, (arg) => arg.url("/users"), (arg) => arg.get(), (arg) => arg.json())'
    );
  });
});

describe("rowguard code generation", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "rowguard" }]);
  });

  it("formats namespace-imported instances as package class constructors", () => {
    const ctx = createCodeGenContext(createTestContext(), { showResult: true });
    const data = createData({
      type: {
        kind: "instance" as const,
        className: "rowguard.PolicyBuilder",
        constructorArgs: [],
      },
    });

    expect(generateData(data, ctx)).toBe("new rowguard.PolicyBuilder()");
    expect(ctx.usedPackages.has("rowguard")).toBe(true);
  });

  it("uses packageAlias for namespace-imported instance constructors", () => {
    const ctx = createCodeGenContext(
      { ...createTestContext(), packageAliases: { rowguard: "Rg" } },
      { showResult: true }
    );
    const data = createData({
      type: {
        kind: "instance" as const,
        className: "rowguard.PolicyBuilder",
        constructorArgs: [],
      },
    });

    expect(generateData(data, ctx)).toBe("new Rg.PolicyBuilder()");
    expect(ctx.usedPackages.has("rowguard")).toBe(true);
  });

  it("uses packageAlias in generated import statement", () => {
    const ctxWithAlias = {
      ...createTestContext(),
      packageAliases: { rowguard: "Rg" },
    };
    const policiesOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" as const } }],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "policies.userOwned",
        parameters: [],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("myTable"),
      operations: [policiesOp],
    });
    const op = testOperation([], [stmt], "aliasTest");

    const result = generateOperation(op, ctxWithAlias);

    expect(result).toContain("import * as Rg from 'rowguard'");
    expect(result).toContain('R.pipe("myTable", Rg.policies.userOwned)');
  });

  it("generates dotted package function call for policies.userOwned with no extra args", () => {
    const ctx = createCodeGenContext(createTestContext());
    const policiesOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" as const } },
          { type: { kind: "unknown" as const }, isOptional: true },
          { type: { kind: "string" as const }, isOptional: true },
        ],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "policies.userOwned",
        parameters: [],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("myTable"),
      operations: [policiesOp],
    });
    const op = testOperation([], [stmt], "policyTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain('R.pipe("myTable", rowguard.policies.userOwned)');
  });

  it("generates dotted package function with arguments for policies.userOwned", () => {
    const ctx = createCodeGenContext(createTestContext());
    const policiesOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" as const } },
          { type: { kind: "unknown" as const }, isOptional: true },
          { type: { kind: "string" as const }, isOptional: true },
        ],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "policies.userOwned",
        parameters: [stringStatement("SELECT")],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("myTable"),
      operations: [policiesOp],
    });
    const op = testOperation([], [stmt], "policyWithArgs");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain(
      'R.pipe("myTable", (arg) => rowguard.policies.userOwned(arg, "SELECT"))'
    );
  });

  it("generates dotted package function for policies.tenantIsolation", () => {
    const ctx = createCodeGenContext(createTestContext());
    const policiesOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" as const } },
          { type: { kind: "string" as const }, isOptional: true },
          { type: { kind: "string" as const }, isOptional: true },
        ],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "policies.tenantIsolation",
        parameters: [stringStatement("tenant_col")],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("myTable"),
      operations: [policiesOp],
    });
    const op = testOperation([], [stmt], "policyTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain(
      'R.pipe("myTable", (arg) => rowguard.policies.tenantIsolation(arg, "tenant_col"))'
    );
  });

  it("generates dotted package function for policies.publicAccess with no extra args", () => {
    const ctx = createCodeGenContext(createTestContext());
    const policiesOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" as const } },
          { type: { kind: "string" as const }, isOptional: true },
        ],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "policies.publicAccess",
        parameters: [],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("myTable"),
      operations: [policiesOp],
    });
    const op = testOperation([], [stmt], "policyTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain(
      'R.pipe("myTable", rowguard.policies.publicAccess)'
    );
  });

  it("generates dotted package function for policies.roleAccess with required role arg", () => {
    const ctx = createCodeGenContext(createTestContext());
    const policiesOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" as const } },
          { type: { kind: "string" as const } },
          { type: { kind: "unknown" as const }, isOptional: true },
        ],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "policies.roleAccess",
        parameters: [stringStatement("admin")],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("myTable"),
      operations: [policiesOp],
    });
    const op = testOperation([], [stmt], "policyTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain(
      'R.pipe("myTable", (arg) => rowguard.policies.roleAccess(arg, "admin"))'
    );
  });

  it("strips package prefix when operation name is already prefixed by registry", () => {
    const ctx = createCodeGenContext(createTestContext());
    const policiesOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" as const } }],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "rowguard.policies.userOwned",
        parameters: [],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("myTable"),
      operations: [policiesOp],
    });
    const op = testOperation([], [stmt], "prefixedName");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain('R.pipe("myTable", rowguard.policies.userOwned)');
  });

  it("generates zero-arg package call for auth.uid", () => {
    const ctx = createCodeGenContext(createTestContext());
    const authUidOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "auth.uid",
        parameters: [],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: createData({ type: { kind: "undefined" } }),
      operations: [authUidOp],
    });
    const op = testOperation([], [stmt], "authUidTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain("R.pipe(undefined, rowguard.auth.uid)");
  });

  it("generates package call with arg for session.get", () => {
    const ctx = createCodeGenContext(createTestContext());
    const sessionGetOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" as const } },
          { type: { kind: "string" as const }, isOptional: true },
        ],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "session.get",
        parameters: [stringStatement("app.tenant_id")],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("app.current_tenant_id"),
      operations: [sessionGetOp],
    });
    const op = testOperation([], [stmt], "sessionGetTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain(
      'R.pipe("app.current_tenant_id", (arg) => rowguard.session.get(arg, "app.tenant_id"))'
    );
  });

  it("generates direct pipe for session.get with no extra args", () => {
    const ctx = createCodeGenContext(createTestContext());
    const sessionGetOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" as const } },
          { type: { kind: "string" as const }, isOptional: true },
        ],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "session.get",
        parameters: [],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const stmt = createStatement({
      data: testString("app.current_tenant_id"),
      operations: [sessionGetOp],
    });
    const op = testOperation([], [stmt], "sessionGetDirect");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain(
      'R.pipe("app.current_tenant_id", rowguard.session.get)'
    );
  });
});

describe("toSQL codegen for structural conditions", () => {
  it("generates method call for toSQL after auth.uid", () => {
    const ctx = createCodeGenContext(createTestContext());
    const authUidOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: {
          kind: "instance",
          className: "rowguard.ContextValue",
          constructorArgs: [],
        } as const,
      },
      value: {
        name: "auth.uid",
        parameters: [],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const toSQLOp = createData({
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "rowguard.ContextValue",
              constructorArgs: [],
            } as const,
          },
        ],
        result: { kind: "string" as const },
      },
      value: {
        name: "toSQL",
        parameters: [],
        statements: [],
        source: { name: "rowguardCondition" },
      },
    });
    const stmt = createStatement({
      data: createData({ type: { kind: "undefined" } }),
      operations: [authUidOp, toSQLOp],
    });
    const op = testOperation([], [stmt], "toSQLTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import * as rowguard from 'rowguard'");
    expect(result).toContain("(arg) => arg.toSQL()");
  });

  it("generates _.get for property access after session.get", () => {
    const ctx = createCodeGenContext(createTestContext());
    const sessionGetOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" as const } },
          { type: { kind: "string" as const }, isOptional: true },
        ],
        result: {
          kind: "instance",
          className: "rowguard.ContextValue",
          constructorArgs: [],
        } as const,
      },
      value: {
        name: "session.get",
        parameters: [stringStatement("org_id")],
        statements: [],
        source: { name: "rowguard" },
      },
    });
    const getOp = createData({
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "rowguard.ContextValue",
              constructorArgs: [],
            } as const,
          },
          { type: { kind: "string" as const } },
        ],
        result: { kind: "unknown" as const },
      },
      value: {
        name: "get",
        parameters: [stringStatement("key")],
        statements: [],
      },
    });
    const stmt = createStatement({
      data: testString("org_id"),
      operations: [sessionGetOp, getOp],
    });
    const op = testOperation([], [stmt], "getOnSessionTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain('_.get("key")');
  });
});

describe("generateData additional coverage", () => {
  it("generates negative number literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    expect(generateData(testNumber(-42), ctx)).toBe("-42");
  });

  it("generates float number literal", () => {
    const ctx = createCodeGenContext(createTestContext());
    expect(generateData(testNumber(3.14), ctx)).toBe("3.14");
  });

  it("generates string with special characters", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(testString('he"llo'), ctx);
    expect(result).toBe('"he\\"llo"');
  });

  it("generates string with newline", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(testString("hello\nworld"), ctx);
    expect(result).toBe('"hello\\nworld"');
  });

  it("escapes error reasons using JSON string encoding", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(testError('bad "quote"\nnext'), ctx);
    expect(result).toBe('new Error("bad \\"quote\\"\\nnext")');
  });

  it("quotes object keys that are not valid identifiers", () => {
    const ctx = createCodeGenContext(createTestContext());
    const obj = testObject([
      { key: "first-name", value: stringStatement("Ada") },
      { key: "last name", value: stringStatement("Lovelace") },
    ]);
    const result = generateData(obj, ctx);
    expect(result).toBe('{"first-name": "Ada", "last name": "Lovelace"}');
  });

  it("generates dictionary data", () => {
    const ctx = createCodeGenContext(createTestContext());
    const dict = testDictionary(
      [{ key: "name", value: stringStatement("test") }],
      { kind: "string" }
    );
    const result = generateData(dict, ctx);
    expect(result).toContain("name");
    expect(result).toContain("test");
  });

  it("generates empty dictionary as {}", () => {
    const ctx = createCodeGenContext(createTestContext());
    const dict = testDictionary([], { kind: "string" });
    const result = generateData(dict, ctx);
    expect(result).toBe("{}");
  });

  it("generates condition data as ternary expression", () => {
    const ctx = createCodeGenContext(createTestContext());
    const cond = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const result = generateData(cond, ctx);
    expect(result).toContain("?");
    expect(result).toContain("yes");
    expect(result).toContain("no");
  });

  it("generates empty object", () => {
    const ctx = createCodeGenContext(createTestContext());
    const obj = testObject([]);
    const result = generateData(obj, ctx);
    expect(result).toBe("{}");
  });

  it("generates nested arrays", () => {
    const ctx = createCodeGenContext(createTestContext());
    const inner = testArray([stringStatement("a")]);
    const outer = testArray([createStatement({ data: inner })]);
    const result = generateData(outer, ctx);
    expect(result).toContain("[[");
    expect(result).toContain('"a"');
  });

  it("generates nested objects", () => {
    const ctx = createCodeGenContext(createTestContext());
    const innerObj = testObject([
      { key: "inner", value: stringStatement("val") },
    ]);
    const outerObj = testObject([
      { key: "nested", value: createStatement({ data: innerObj }) },
    ]);
    const result = generateData(outerObj, ctx);
    expect(result).toContain("nested");
    expect(result).toContain("inner");
  });

  it("generates unknown data by inferring type", () => {
    const ctx = createCodeGenContext(createTestContext());
    const data = createData({ type: { kind: "unknown" }, value: "inferred" });
    const result = generateData(data, ctx);
    expect(result).toBe('"inferred"');
  });

  it("generates never data by inferring type", () => {
    const ctx = createCodeGenContext(createTestContext());
    const data = createData({ type: { kind: "never" } });
    const result = generateData(data, ctx);
    expect(result).toBe("undefined");
  });
});

describe("recursive operation code generation", () => {
  it("generates named binding for operations", () => {
    const ctx = createTestContext();
    const op = testOperation(
      [stringStatement("", "input")],
      [stringStatement("output")],
      "myOp"
    );
    const result = generateOperation(op, ctx);
    expect(result).toContain("const myOp = ");
    expect(result).toContain("export default myOp");
  });

  it("does not self-import when operation references itself", () => {
    const ctx = createTestContext();
    ctx.variables.set("factorial", {
      data: testOperation(
        [numberStatement(0, "n")],
        [numberStatement(0)],
        "factorial"
      ),
    });

    const recursiveRef = testReference("factorial", "ref1");
    const stmt = createStatement({ data: recursiveRef });
    const op = testOperation([numberStatement(0, "n")], [stmt], "factorial");

    const result = generateOperation(op, ctx);
    expect(result).toContain("const factorial =");
    expect(result).toContain("export default factorial");
    expect(result).not.toContain("import factorial from");
  });

  it("still imports other user-defined operations", () => {
    const ctx = createTestContext();
    ctx.variables.set("helper", {
      data: testOperation([], [], "helper"),
    });

    const helperRef = testReference("helper", "ref1");
    const stmt = createStatement({ data: helperRef });
    const op = testOperation([], [stmt], "myOp");

    const result = generateOperation(op, ctx);
    expect(result).toContain("import helper from './helper.js'");
    expect(result).toContain("const myOp =");
    expect(result).toContain("export default myOp");
  });

  it("references self by name in operation call without self-import", () => {
    const ctx = createTestContext();
    ctx.variables.set("factorial", {
      data: testOperation(
        [numberStatement(0, "n")],
        [numberStatement(0)],
        "factorial"
      ),
    });

    const selfCallOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "number" } }],
        result: { kind: "number" },
      },
      value: { name: "factorial", parameters: [], statements: [] },
    });
    const innerStmt = createStatement({
      data: createData({ type: { kind: "number" }, value: 5 }),
      operations: [selfCallOp],
    });
    const op = testOperation(
      [numberStatement(0, "n")],
      [innerStmt],
      "factorial"
    );

    const result = generateOperation(op, ctx);
    expect(result).toContain("const factorial =");
    expect(result).toContain("factorial");
    expect(result).not.toContain("import factorial from");
  });

  it("generates operation with multiple parameters", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("combined");
    const op = testOperation(
      [stringStatement("a", "first"), numberStatement(0, "second")],
      [stmt],
      "concat"
    );
    const result = generateOperation(op, ctx);
    expect(result).toContain("(first, second)");
  });

  it("generates internal callback with ...args for stored instance without type", () => {
    const ctx = createTestContext();
    const opData = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "string" },
      },
      value: {
        name: "greet",
        parameters: [],
        statements: [],
        instanceId: "inst123",
      },
    });
    ctx.setInstance("inst123", {
      type: { kind: "string" },
      instance: () => "hello",
    });
    const result = generateData(opData, createCodeGenContext(ctx));
    expect(result).toContain("...args");
  });
});

describe("condition code generation", () => {
  it("generates ternary for simple conditions", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "condOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("?");
    expect(result).not.toContain("if (");
  });

  it("generates if/else block when branch has return", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [
        createStatement({
          data: stringStatement("yes").data,
          controlFlow: "return",
        }),
      ],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "retCondOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("if (");
    expect(result).toContain("else");
    expect(result).toContain("return");
    expect(result).not.toContain("?");
  });

  it("generates if/else block for multi-statement branches", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("a"), numberStatement(1)],
      [stringStatement("b")]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "multiCondOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("if (");
    expect(result).toContain("else");
    expect(result).not.toContain("?");
  });

  it("generates pipe chain in condition expression", () => {
    const ctx = createTestContext();
    ctx.variables.set("n", { data: testNumber(5) });
    const lessThanOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "number" } },
          { type: { kind: "number" } },
        ],
        result: { kind: "boolean" },
      },
      value: {
        name: "lessThan",
        parameters: [numberStatement(2)],
        statements: [],
      },
    });
    const condData = testCondition(
      createStatement({
        data: testReference("n", "ref1"),
        operations: [lessThanOp],
      }),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "pipeCondOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("R.pipe");
    expect(result).toContain("_.lessThan");
    expect(result).toContain("?");
  });

  it("generates if/else block when false branch has return", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [
        createStatement({
          data: stringStatement("no").data,
          controlFlow: "return",
        }),
      ]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "falseRetOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("if (");
    expect(result).toContain("else");
    expect(result).toContain("return");
  });

  it("generates if/else when both branches have single statement with return", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [
        createStatement({
          data: stringStatement("yes").data,
          controlFlow: "return",
        }),
      ],
      [
        createStatement({
          data: stringStatement("no").data,
          controlFlow: "return",
        }),
      ]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "bothRetOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("if (");
    expect(result).toContain("else");
    expect(result).toContain("return");
    expect(result).not.toContain("?");
  });

  it("generates ternary with undefined for empty branches", () => {
    const ctx = createTestContext();
    const condData = testCondition(booleanStatement(true), [], []);
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "emptyCondOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("?");
  });

  it("generates if/else when branch statement has a variable name", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [numberStatement(42, "named")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "namedBranchOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("if (");
    expect(result).toContain("else");
    expect(result).not.toContain("?");
  });

  it("omits else block when block condition has empty false branch", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [numberStatement(42, "named")],
      []
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "emptyFalseBranchBlockOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("if (");
    expect(result).not.toContain("else {");
    expect(result).not.toContain("?");
  });

  it("generates empty true block when true branch is empty in block condition", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [],
      [numberStatement(42, "named")]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "emptyTrueBlockOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("if (");
    expect(result).toContain("else");
    expect(result).not.toContain("?");
  });

  it("generates ternary for empty both branches", () => {
    const ctx = createTestContext();
    const condData = testCondition(booleanStatement(true), [], []);
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "emptyBothBranchesOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("?");
    expect(result).not.toContain("if (");
  });

  it("trims declaration from named last condition return", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ name: "result", data: condData });
    const op = testOperation([], [stmt], "namedCondOp");
    const result = generateOperation(op, ctx);
    expect(result).toMatch(/return\s+true\s*\?\s*"yes"\s*:\s*"no"/);
    expect(result).not.toContain("return const");
    expect(result).toContain("?");
  });

  it("handles return with named ternary condition", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({
      name: "result",
      data: condData,
      controlFlow: "return",
    });
    const op = testOperation([], [stmt], "retNamedCondOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("return ");
    expect(result).toContain("?");
    expect(result).toMatch(/return\s+true\s*\?\s*"yes"\s*:\s*"no"/);
  });

  it("generates if/else for nested condition with return in deep branch", () => {
    const ctx = createTestContext();
    const innerCond = testCondition(
      booleanStatement(true),
      [
        createStatement({
          data: stringStatement("ret").data,
          controlFlow: "return",
        }),
      ],
      [stringStatement("no")]
    );
    const condData = testCondition(
      booleanStatement(true),
      [createStatement({ data: innerCond })],
      [stringStatement("fallback")]
    );
    const stmt = createStatement({ data: condData });
    const op = testOperation([], [stmt], "nestedRetOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("if (");
    expect(result).toContain("else");
    expect(result).not.toContain("?");
  });
});

describe("faker code generation", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "faker" }]);
  });

  it("generates named import for faker", () => {
    const ctx = createCodeGenContext(createTestContext());
    const fakerOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "string" as const },
      },
      value: {
        name: "faker.person.firstName",
        parameters: [],
        statements: [],
        source: { name: "faker" },
      },
    });
    const stmt = createStatement({
      data: createData({ type: { kind: "undefined" } }),
      operations: [fakerOp],
    });
    const op = testOperation([], [stmt], "fakerTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import { faker } from '@faker-js/faker';");
    expect(result).toContain("R.pipe(undefined, faker.person.firstName)");
  });

  it("generates faker function call with arguments", () => {
    const ctx = createCodeGenContext(createTestContext());
    const intOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "unknown" as const }, isOptional: true }],
        result: { kind: "number" as const },
      },
      value: {
        name: "faker.number.int",
        parameters: [numberStatement(0)],
        statements: [],
        source: { name: "faker" },
      },
    });
    const stmt = createStatement({
      data: createData({ type: { kind: "undefined" } }),
      operations: [intOp],
    });
    const op = testOperation([], [stmt], "fakerNumberTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import { faker } from '@faker-js/faker';");
    expect(result).toContain(
      "R.pipe(undefined, (arg) => faker.number.int(arg, 0))"
    );
  });

  it("generates no-arg faker call without wrapper arrow", () => {
    const ctx = createCodeGenContext(createTestContext());
    const uuidOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "string" as const },
      },
      value: {
        name: "faker.string.uuid",
        parameters: [],
        statements: [],
        source: { name: "faker" },
      },
    });
    const stmt = createStatement({
      data: createData({ type: { kind: "undefined" } }),
      operations: [uuidOp],
    });
    const op = testOperation([], [stmt], "fakerUuidTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import { faker } from '@faker-js/faker';");
    expect(result).toContain("R.pipe(undefined, faker.string.uuid)");
  });

  it("omits faker import when no faker usage", () => {
    const ctx = createCodeGenContext(createTestContext());
    const stmt = createStatement({
      data: testString("hello"),
    });
    const op = testOperation([], [stmt], "noFakerTest");
    const result = generateOperation(op, ctx);

    expect(result).not.toContain("faker");
    expect(result).not.toContain("@faker-js/faker");
  });

  it("generates dotted nested faker operations correctly", () => {
    const ctx = createCodeGenContext(createTestContext());
    const locationOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "string" as const },
      },
      value: {
        name: "faker.location.streetAddress",
        parameters: [],
        statements: [],
        source: { name: "faker" },
      },
    });
    const stmt = createStatement({
      data: createData({ type: { kind: "undefined" } }),
      operations: [locationOp],
    });
    const op = testOperation([], [stmt], "fakerLocationTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("faker.location.streetAddress");
  });

  it("generates aliased named import with as clause", () => {
    const ctx = createCodeGenContext(
      createTestContext({ packageAliases: { faker: "f" } })
    );
    const fakerOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "string" as const },
      },
      value: {
        name: "faker.person.firstName",
        parameters: [],
        statements: [],
        source: { name: "faker" },
      },
    });
    const stmt = createStatement({
      data: createData({ type: { kind: "undefined" } }),
      operations: [fakerOp],
    });
    const op = testOperation([], [stmt], "fakerAliasTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("import { faker as f } from '@faker-js/faker';");
    expect(result).toContain("R.pipe(undefined, f.person.firstName)");
  });

  it("generates aliased package name for built-in operation references before package sync", async () => {
    await syncPackageRegistry([]);
    const ctx = createCodeGenContext(
      createTestContext({ packageAliases: { faker: "f" } })
    );
    const callOp = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "operation",
              parameters: [],
              result: { kind: "string" },
            },
          },
        ],
        result: { kind: "string" },
      },
      value: { name: "call", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testReference("faker.word.words", "ref1"),
      operations: [callOp],
    });
    const op = testOperation([], [stmt], "fakerRefAliasTest");

    const result = generateOperation(op, ctx);

    expect(result).toContain("import { faker as f } from '@faker-js/faker';");
    expect(result).toContain("R.pipe(f.word.words, (arg) => arg())");
    expect(result).not.toContain("./faker.word.words.js");
    await syncPackageRegistry([{ name: "faker" }]);
  });

  it("generates aliased package name for built-in variable data before package sync", async () => {
    await syncPackageRegistry([]);
    const ctx = createCodeGenContext(
      createTestContext({ packageAliases: { faker: "f" } })
    );
    ctx.variables.set("faker.word.words", {
      data: createData<OperationType>({
        id: "builtin:faker.word.words",
        type: {
          kind: "operation",
          parameters: [],
          result: { kind: "string" },
        },
        value: {
          name: "faker.word.words",
          parameters: [],
          statements: [],
        },
      }),
    });

    const result = generateData(testReference("faker.word.words", "ref1"), ctx);

    expect(result).toBe("f.word.words");
    expect(ctx.importedOperations.has("faker.word.words")).toBe(false);
    await syncPackageRegistry([{ name: "faker" }]);
  });
});

describe("ffmpeg code generation", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "ffmpeg" }]);
  });

  const FfmpegCommandType: DataType = {
    kind: "instance",
    className: "ffmpeg.Command",
    constructorArgs: [],
  };

  function createFfmpegCommandOp() {
    return createData<OperationType>({
      id: "builtin:ffmpeg.command",
      type: {
        kind: "operation",
        parameters: [],
        result: FfmpegCommandType,
      },
      value: {
        name: "ffmpeg.command",
        parameters: [],
        statements: [],
        source: { name: "ffmpeg", callStyle: "function" },
      },
    });
  }

  it("generates ffmpeg.command as a package reference", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(createFfmpegCommandOp(), ctx);

    expect(result).toBe("ffmpeg.command");
    expect(ctx.usedPackages.has("ffmpeg")).toBe(true);
  });

  it("generates virtual import for ffmpeg from packages directory", () => {
    const ctx = createCodeGenContext(createTestContext());
    const stmt = createStatement({
      data: createFfmpegCommandOp(),
      operations: [],
    });
    const op = testOperation([], [stmt], "ffmpegTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain(
      "import * as ffmpeg from '../packages/ffmpeg.js';"
    );
  });

  it("generates function-style chain call for ffmpeg.input", () => {
    const ctx = createCodeGenContext(createTestContext());
    const inputOp = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ type: FfmpegCommandType }, { type: { kind: "string" } }],
        result: FfmpegCommandType,
      },
      value: {
        name: "input",
        parameters: [stringStatement("video.mp4")],
        statements: [],
        source: { name: "ffmpeg", callStyle: "function" },
      },
    });
    const stmt = createStatement({
      data: createFfmpegCommandOp(),
      operations: [inputOp],
    });
    const op = testOperation([], [stmt], "ffmpegInputTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain(
      "import * as ffmpeg from '../packages/ffmpeg.js';"
    );
    expect(result).toContain('(arg) => ffmpeg.input(arg, "video.mp4")');
  });

  it("generates zero-arg chain operation as bare function reference", () => {
    const ctx = createCodeGenContext(createTestContext());
    const toCommandOp = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ type: FfmpegCommandType }],
        result: { kind: "string" },
      },
      value: {
        name: "toCommand",
        parameters: [],
        statements: [],
        source: { name: "ffmpeg", callStyle: "function" },
      },
    });
    const stmt = createStatement({
      data: createFfmpegCommandOp(),
      operations: [toCommandOp],
    });
    const op = testOperation([], [stmt], "ffmpegToCommandTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain("R.pipe(ffmpeg.command, ffmpeg.toCommand)");
  });

  it("generates full ffmpeg pipeline with function-style chain calls", () => {
    const ctx = createCodeGenContext(createTestContext());
    const inputOp = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ type: FfmpegCommandType }, { type: { kind: "string" } }],
        result: FfmpegCommandType,
      },
      value: {
        name: "input",
        parameters: [stringStatement("in.mp4")],
        statements: [],
        source: { name: "ffmpeg", callStyle: "function" },
      },
    });
    const videoCodecOp = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ type: FfmpegCommandType }, { type: { kind: "string" } }],
        result: FfmpegCommandType,
      },
      value: {
        name: "videoCodec",
        parameters: [stringStatement("libx264")],
        statements: [],
        source: { name: "ffmpeg", callStyle: "function" },
      },
    });
    const outputOp = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ type: FfmpegCommandType }, { type: { kind: "string" } }],
        result: FfmpegCommandType,
      },
      value: {
        name: "output",
        parameters: [stringStatement("out.mp4")],
        statements: [],
        source: { name: "ffmpeg", callStyle: "function" },
      },
    });
    const stmt = createStatement({
      data: createFfmpegCommandOp(),
      operations: [inputOp, videoCodecOp, outputOp],
    });
    const op = testOperation([], [stmt], "ffmpegFullTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain(
      "import * as ffmpeg from '../packages/ffmpeg.js';"
    );
    expect(result).toContain('(arg) => ffmpeg.input(arg, "in.mp4")');
    expect(result).toContain('(arg) => ffmpeg.videoCodec(arg, "libx264")');
    expect(result).toContain('(arg) => ffmpeg.output(arg, "out.mp4")');
  });

  it("respects explicit callStyle override on an operation", () => {
    const ctx = createCodeGenContext(createTestContext());
    const methodOp = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ type: FfmpegCommandType }, { type: { kind: "string" } }],
        result: FfmpegCommandType,
      },
      value: {
        name: "normalize",
        parameters: [stringStatement("fast")],
        statements: [],
        source: { name: "ffmpeg", callStyle: "method" },
      },
    });
    const stmt = createStatement({
      data: createFfmpegCommandOp(),
      operations: [methodOp],
    });
    const op = testOperation([], [stmt], "ffmpegMethodOverrideTest");
    const result = generateOperation(op, ctx);

    expect(result).toContain('(arg) => arg.normalize("fast")');
  });
});
