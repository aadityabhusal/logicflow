import { describe, it, expect } from "vitest";
import {
  getFilteredOperations,
  executeStatement,
  executeStatementSync,
  executeOperation,
  executeOperationSync,
  setOperationResults,
  createOperationCall,
} from "@/lib/execution/execution";
import { createData, createStatement, isDataOfType } from "@/lib/utils";
import { builtInOperations } from "@/lib/operations/built-in";
import { OperationListItem } from "@/lib/execution/types";
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
  testCondition,
  stringStatement,
  numberStatement,
  booleanStatement,
  testUndefined,
} from "@/tests/helpers";

describe("getFilteredOperations", () => {
  it("returns operations compatible with string data", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).toContain("length");
    expect(names).toContain("includes");
    expect(names).toContain("concat");
  });

  it("returns operations compatible with number data", () => {
    const ctx = createTestContext();
    const data = testNumber(42);
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).toContain("add");
    expect(names).toContain("subtract");
    expect(names).toContain("multiply");
    expect(names).toContain("lessThan");
  });

  it("returns operations compatible with boolean data", () => {
    const ctx = createTestContext();
    const data = testBoolean(true);
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).toContain("not");
    expect(names).toContain("and");
    expect(names).toContain("or");
    expect(names).toContain("thenElse");
  });

  it("returns operations compatible with array data", () => {
    const ctx = createTestContext();
    const data = testArray([]);
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).toContain("map");
    expect(names).toContain("filter");
    expect(names).toContain("first");
    expect(names).toContain("last");
  });

  it("returns operations compatible with object data", () => {
    const ctx = createTestContext();
    const data = testObject([]);
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).toContain("get");
    expect(names).toContain("has");
    expect(names).toContain("keys");
    expect(names).toContain("values");
  });

  it("returns no operations for never type", () => {
    const ctx = createTestContext();
    const data = createData({ type: { kind: "never" } });
    const ops = getFilteredOperations(data, ctx);
    expect(ops).toHaveLength(0);
  });

  it("returns grouped operations when grouped flag is set", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    const grouped = getFilteredOperations(data, ctx, true);
    expect(grouped).toHaveLength(2);
    expect(grouped[0][0]).toBe("Built-in");
    expect(grouped[1][0]).toBe("User-defined");
  });

  it("includes user-defined operations", () => {
    const ctx = createTestContext();
    ctx.variables.set("myOp", {
      data: testOperation(
        [stringStatement("input")],
        [stringStatement("output")],
        "myOp"
      ),
    });
    const data = testString("hello");
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).toContain("myOp");
  });

  it("resolves references before filtering", () => {
    const ctx = createTestContext();
    ctx.variables.set("myVar", { data: testString("hello") });
    const ref = testReference("myVar", "stmt1");
    const ops = getFilteredOperations(ref, ctx);
    const names = ops.map((op) => op.name);
    expect(names).toContain("length");
  });

  it("excludes user-defined operations that are incompatible", () => {
    const ctx = createTestContext();
    ctx.variables.set("numberOp", {
      data: testOperation(
        [numberStatement(0)],
        [numberStatement(0)],
        "numberOp"
      ),
    });
    const data = testString("hello");
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).not.toContain("numberOp");
  });
});

describe("createOperationCall", () => {
  it("creates an operation call for string length", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testString("hello");
    const result = await createOperationCall({
      data,
      name: "length",
      context: ctx,
    });
    expect(result.type.kind).toBe("operation");
    expect(result.value.name).toBe("length");
  });

  it("creates an operation call with parameters", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testNumber(10);
    const result = await createOperationCall({
      data,
      name: "add",
      parameters: [numberStatement(5)],
      context: ctx,
    });
    expect(result.type.kind).toBe("operation");
    expect(result.value.name).toBe("add");
  });

  it("creates operation call with custom operationId", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testString("hello");
    const result = await createOperationCall({
      data,
      name: "length",
      operationId: "custom-op-id",
      context: ctx,
    });
    expect(result.id).toBe("custom-op-id");
  });

  it("preserves compatible parameter values from input", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testNumber(10);
    const existingParam = numberStatement(5);
    const result = await createOperationCall({
      data,
      name: "add",
      parameters: [existingParam],
      context: ctx,
    });
    expect(result.value.parameters).toHaveLength(1);
    expect(result.value.parameters[0].data.value).toBe(5);
  });

  it("sets result on context cache", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testString("hello");
    const _result = await createOperationCall({
      data,
      name: "length",
      operationId: "cached-op",
      context: ctx,
    });
    const cached = ctx.getResult("cached-op");
    expect(cached).toBeDefined();
    expect(cached?.data?.value).toBe(5);
  });
});

describe("executeStatement", () => {
  it("returns string data directly", async () => {
    const ctx = createTestContext({ isSync: false });
    const stmt = stringStatement("hello");
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("hello");
  });

  it("returns number data directly", async () => {
    const ctx = createTestContext({ isSync: false });
    const stmt = numberStatement(42);
    const result = await executeStatement(stmt, ctx);
    expect(result.value).toBe(42);
  });

  it("returns boolean data directly", async () => {
    const ctx = createTestContext({ isSync: false });
    const stmt = booleanStatement(true);
    const result = await executeStatement(stmt, ctx);
    expect(result.value).toBe(true);
  });

  it("returns undefined data directly", async () => {
    const ctx = createTestContext({ isSync: false });
    const stmt = createStatement({ data: testUndefined() });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("undefined");
  });

  it("propagates fatal errors", async () => {
    const ctx = createTestContext({ isSync: false });
    const errorData = testError("not found", "reference_error");
    const stmt = createStatement({ data: errorData });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("error");
    if (result.type.kind === "error") {
      expect(result.type.errorType).toBe("reference_error");
    }
  });

  it("resolves references", async () => {
    const ctx = createTestContext({ isSync: false });
    const resolvedValue = testNumber(99);
    ctx.variables.set("x", { data: resolvedValue });
    const ref = testReference("x", "stmt1");
    const stmt = createStatement({ data: ref });
    const result = await executeStatement(stmt, ctx);
    expect(result.value).toBe(99);
  });

  it("returns reference error for undefined reference in non-root scope", async () => {
    const ctx = createTestContext({ isSync: false, scopeId: "inner" });
    const ref = testReference("missing", "stmt1");
    const stmt = createStatement({ data: ref });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("error");
    if (result.type.kind === "error") {
      expect(result.type.errorType).toBe("reference_error");
    }
  });

  it("returns condition data as-is when no operations", async () => {
    const ctx = createTestContext({ isSync: false });
    const condData = testCondition(
      booleanStatement(true),
      stringStatement("yes"),
      stringStatement("no")
    );
    const stmt = createStatement({ data: condData });
    const result = await executeStatement(stmt, ctx);
    expect(isDataOfType(result, "condition")).toBe(true);
  });

  it("executes operations in chain", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testString("hello");
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const stmt = createStatement({ data, operations: [op] });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(5);
  });

  it("caches operation results on context", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = createData({
      id: "length-op",
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("hello"),
      operations: [op],
    });
    await executeStatement(stmt, ctx);
    const cached = ctx.getResult(op.id);
    expect(cached).toBeDefined();
    expect(cached?.data?.value).toBe(5);
  });

  it("caches type error for unknown operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = createData({
      id: "unknown-op",
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "undefined" },
      },
      value: { name: "nonExistentOp", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("hello"),
      operations: [op],
    });
    await executeStatement(stmt, ctx);
    const cached = ctx.getResult(op.id);
    expect(cached).toBeDefined();
    expect(cached?.data?.type.kind).toBe("error");
    if (cached?.data?.type.kind === "error") {
      expect(cached.data.type.errorType).toBe("type_error");
    }
  });

  it("executes chained operations", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testString("hello");
    const lengthOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const addOp = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "number" } },
          { type: { kind: "number" } },
        ],
        result: { kind: "number" },
      },
      value: {
        name: "add",
        parameters: [numberStatement(1)],
        statements: [],
      },
    });
    const stmt = createStatement({ data, operations: [lengthOp, addOp] });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(6);
  });
});

describe("executeStatementSync", () => {
  it("returns string data directly", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("hello");
    const result = executeStatementSync(stmt, ctx);
    expect(result.value).toBe("hello");
  });

  it("returns number data directly", () => {
    const ctx = createTestContext();
    const stmt = numberStatement(42);
    const result = executeStatementSync(stmt, ctx);
    expect(result.value).toBe(42);
  });

  it("returns undefined data directly", () => {
    const ctx = createTestContext();
    const stmt = createStatement({ data: testUndefined() });
    const result = executeStatementSync(stmt, ctx);
    expect(result.type.kind).toBe("undefined");
  });

  it("propagates fatal errors", () => {
    const ctx = createTestContext();
    const errorData = testError("broken", "reference_error");
    const stmt = createStatement({ data: errorData });
    const result = executeStatementSync(stmt, ctx);
    expect(result.type.kind).toBe("error");
  });

  it("returns condition data as-is when no operations", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      stringStatement("yes"),
      stringStatement("no")
    );
    const stmt = createStatement({ data: condData });
    const result = executeStatementSync(stmt, ctx);
    expect(isDataOfType(result, "condition")).toBe(true);
  });

  it("executes operations in chain synchronously", () => {
    const ctx = createTestContext();
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("test"),
      operations: [op],
    });
    const result = executeStatementSync(stmt, ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(4);
  });

  it("resolves references synchronously", () => {
    const ctx = createTestContext();
    ctx.variables.set("x", { data: testNumber(99) });
    const ref = testReference("x", "stmt1");
    const stmt = createStatement({ data: ref });
    const result = executeStatementSync(stmt, ctx);
    expect(result.value).toBe(99);
  });

  it("executes nested array data child elements", () => {
    const ctx = createTestContext();
    const arrData = testArray([stringStatement("a"), stringStatement("b")]);
    const stmt = createStatement({ data: arrData });
    const result = executeStatementSync(stmt, ctx);
    expect(isDataOfType(result, "array")).toBe(true);
    expect(result.value).toHaveLength(2);
  });

  it("executes nested object data child elements", () => {
    const ctx = createTestContext();
    const objData = testObject([
      { key: "name", value: stringStatement("test") },
    ]);
    const stmt = createStatement({ data: objData });
    const result = executeStatementSync(stmt, ctx);
    expect(isDataOfType(result, "object")).toBe(true);
    if (isDataOfType(result, "object")) {
      expect(result.value.entries).toHaveLength(1);
    }
  });
});

describe("executeOperation", () => {
  function findBuiltIn(name: string): OperationListItem {
    const op = builtInOperations.find((o) => o.name === name);
    if (!op) throw new Error(`Operation "${name}" not found`);
    return op;
  }

  it("executes a handler-based operation (length)", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("length");
    const data = testString("hello");
    const result = await executeOperation(op, data, [], ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(5);
  });

  it("executes an operation with parameters (add)", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("add");
    const data = testNumber(10);
    const result = await executeOperation(op, data, [numberStatement(3)], ctx);
    expect(result.value).toBe(13);
  });

  it("executes subtract operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("subtract");
    const data = testNumber(10);
    const result = await executeOperation(op, data, [numberStatement(3)], ctx);
    expect(result.value).toBe(7);
  });

  it("executes multiply operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("multiply");
    const data = testNumber(6);
    const result = await executeOperation(op, data, [numberStatement(7)], ctx);
    expect(result.value).toBe(42);
  });

  it("executes lessThan operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("lessThan");
    const data = testNumber(3);
    const result = await executeOperation(op, data, [numberStatement(5)], ctx);
    expect(result.value).toBe(true);
  });

  it("executes includes operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("includes");
    const data = testString("hello world");
    const result = await executeOperation(
      op,
      data,
      [stringStatement("world")],
      ctx
    );
    expect(result.value).toBe(true);
  });

  it("returns empty data when skipExecution is set", async () => {
    const ctx = createTestContext({
      isSync: false,
      skipExecution: { reason: "unreachable", kind: "unreachable" },
    });
    const op = findBuiltIn("length");
    const data = testString("hello");
    const result = await executeOperation(op, data, [], ctx);
    expect(result.type.kind).toBe("undefined");
  });

  it("propagates error data when operation does not support error type", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("length");
    const errorData = testError("broken", "reference_error");
    const result = await executeOperation(op, errorData, [], ctx);
    expect(result.type.kind).toBe("error");
  });

  it("propagates custom_error when operation does not support error type", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("length");
    const customError = testError("recoverable", "custom_error");
    const result = await executeOperation(op, customError, [], ctx);
    expect(result.type.kind).toBe("error");
    if (isDataOfType(result, "error")) {
      expect(result.type.errorType).toBe("custom_error");
      expect(result.value.reason).toBe("recoverable");
    }
  });

  it("executes a lazyHandler-based operation (not)", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("not");
    const data = testBoolean(true);
    const result = await executeOperation(op, data, [], ctx);
    expect(result.value).toBe(false);
  });

  it("returns type error when parameter type mismatches", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("add");
    const data = testNumber(10);
    const result = await executeOperation(
      op,
      data,
      [stringStatement("bad")],
      ctx
    );
    expect(result.type.kind).toBe("error");
    if (result.type.kind === "error") {
      expect(result.type.errorType).toBe("type_error");
    }
  });

  it("executes a user-defined operation with statements", async () => {
    const ctx = createTestContext({ isSync: false });
    const innerResult = stringStatement("from_user_op");
    const userOp: OperationListItem = {
      name: "myUserOp",
      parameters: [{ type: { kind: "string" }, name: "input" }],
      statements: [innerResult],
    };
    const data = testString("hello");
    const result = await executeOperation(userOp, data, [], ctx);
    expect(result.value).toBe("from_user_op");
  });

  it("user-defined operation sets named variables in context", async () => {
    const ctx = createTestContext({ isSync: false });
    const namedResult = stringStatement("computed", "resultVar");
    const userOp: OperationListItem = {
      name: "namedVarOp",
      parameters: [{ type: { kind: "string" }, name: "input" }],
      statements: [namedResult],
    };
    const data = testString("hello");
    const contextResult = await executeOperation(userOp, data, [], ctx);
    expect(contextResult.value).toBe("computed");
  });

  it("executes concat operation with two strings", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("concat");
    const data = testString("hello");
    const result = await executeOperation(
      op,
      data,
      [stringStatement(" world")],
      ctx
    );
    expect(result.value).toBe("hello world");
  });

  it("returns default data for operation with no handler or statements", async () => {
    const ctx = createTestContext({ isSync: false });
    const emptyOp: OperationListItem = {
      name: "emptyOp",
      parameters: [],
      statements: [],
    };
    const data = testString("hello");
    const result = await executeOperation(emptyOp, data, [], ctx);
    expect(result).toBeDefined();
  });
});

describe("executeOperationSync", () => {
  function findBuiltIn(name: string): OperationListItem {
    const op = builtInOperations.find((o) => o.name === name);
    if (!op) throw new Error(`Operation "${name}" not found`);
    return op;
  }

  it("executes a handler-based operation synchronously (length)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("length");
    const data = testString("test");
    const result = executeOperationSync(op, data, [], ctx);
    expect(result.value).toBe(4);
  });

  it("executes an operation with parameters synchronously (add)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("add");
    const data = testNumber(7);
    const result = executeOperationSync(op, data, [numberStatement(3)], ctx);
    expect(result.value).toBe(10);
  });

  it("returns empty data when skipExecution is set", () => {
    const ctx = createTestContext({
      skipExecution: { reason: "unreachable", kind: "unreachable" },
    });
    const op = findBuiltIn("length");
    const data = testString("hello");
    const result = executeOperationSync(op, data, [], ctx);
    expect(result.type.kind).toBe("undefined");
  });

  it("propagates error data synchronously", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("length");
    const errorData = testError("broken", "reference_error");
    const result = executeOperationSync(op, errorData, [], ctx);
    expect(result.type.kind).toBe("error");
  });

  it("executes not operation synchronously", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("not");
    const data = testBoolean(false);
    const result = executeOperationSync(op, data, [], ctx);
    expect(result.value).toBe(true);
  });

  it("returns type error on parameter mismatch synchronously", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("add");
    const data = testNumber(5);
    const result = executeOperationSync(
      op,
      data,
      [stringStatement("bad")],
      ctx
    );
    expect(result.type.kind).toBe("error");
    if (result.type.kind === "error") {
      expect(result.type.errorType).toBe("type_error");
    }
  });

  it("executes a user-defined operation synchronously", () => {
    const ctx = createTestContext();
    const innerResult = stringStatement("sync_result");
    const userOp: OperationListItem = {
      name: "syncUserOp",
      parameters: [{ type: { kind: "string" }, name: "input" }],
      statements: [innerResult],
    };
    const data = testString("hello");
    const result = executeOperationSync(userOp, data, [], ctx);
    expect(result.value).toBe("sync_result");
  });

  it("executes multiply operation synchronously", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("multiply");
    const data = testNumber(6);
    const result = executeOperationSync(op, data, [numberStatement(7)], ctx);
    expect(result.value).toBe(42);
  });

  it("executes subtract operation synchronously", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("subtract");
    const data = testNumber(20);
    const result = executeOperationSync(op, data, [numberStatement(8)], ctx);
    expect(result.value).toBe(12);
  });

  it("executes thenElse with true condition synchronously (short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("thenElse");
    const data = testBoolean(true);
    const result = executeOperationSync(
      op,
      data,
      [stringStatement("yes"), stringStatement("no")],
      ctx
    );
    expect(result).toBeDefined();
  });

  it("executes thenElse with false condition synchronously (short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("thenElse");
    const data = testBoolean(false);
    const result = executeOperationSync(
      op,
      data,
      [stringStatement("yes")],
      ctx
    );
    expect(isDataOfType(result, "undefined")).toBe(true);
  });

  it("executes and operation with false synchronously (short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("and");
    const data = testBoolean(false);
    const result = executeOperationSync(
      op,
      data,
      [stringStatement("second")],
      ctx
    );
    expect(result.value).toBe(false);
  });

  it("executes or operation with true synchronously (short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("or");
    const data = testBoolean(true);
    const result = executeOperationSync(
      op,
      data,
      [stringStatement("second")],
      ctx
    );
    expect(result.value).toBe(true);
  });

  it("executes and operation with true synchronously (non-short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("and");
    const data = testBoolean(true);
    const result = executeOperationSync(
      op,
      data,
      [stringStatement("second")],
      ctx
    );
    expect(result).toBeDefined();
  });

  it("executes or operation with false synchronously (non-short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("or");
    const data = testBoolean(false);
    const result = executeOperationSync(
      op,
      data,
      [stringStatement("second")],
      ctx
    );
    expect(result).toBeDefined();
  });
});

describe("setOperationResults", () => {
  it("returns a thenable for named parameters", () => {
    const ctx = createTestContext();
    const param = stringStatement("input", "myParam");
    const op = testOperation([param], [stringStatement("result")]);
    const result = setOperationResults(op, ctx);
    expect(typeof result.then).toBe("function");
  });

  it("handles empty parameters and statements", () => {
    const ctx = createTestContext();
    const op = testOperation([], []);
    const result = setOperationResults(op, ctx);
    let resolved = false;
    result.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(true);
  });

  it("resolves thenable after processing named parameters", () => {
    const ctx = createTestContext();
    const op = testOperation(
      [stringStatement("input", "param1")],
      [stringStatement("result")]
    );
    const thenable = setOperationResults(op, ctx);
    let resolved = false;
    thenable.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(true);
  });

  it("processes multiple parameters and statements without error", () => {
    const ctx = createTestContext();
    const param1 = stringStatement("a", "p1");
    const param2 = numberStatement(42, "p2");
    const stmt1 = stringStatement("result", "s1");
    const op = testOperation([param1, param2], [stmt1]);
    const result = setOperationResults(op, ctx);
    let resolved = false;
    result.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(true);
  });

  it("processes unnamed parameters without error", () => {
    const ctx = createTestContext();
    const param = stringStatement("input");
    const stmt = stringStatement("result");
    const op = testOperation([param], [stmt]);
    const result = setOperationResults(op, ctx);
    let resolved = false;
    result.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(true);
  });
});

describe("getFilteredOperations additional coverage", () => {
  it("returns operations for union of compatible types", () => {
    const ctx = createTestContext();
    const unionData = createData({
      type: {
        kind: "union",
        types: [
          {
            kind: "object",
            properties: [
              { key: "name", value: { kind: "string" } },
              { key: "age", value: { kind: "number" } },
            ],
          },
          {
            kind: "object",
            properties: [{ key: "name", value: { kind: "string" } }],
          },
        ],
      },
    });
    const ops = getFilteredOperations(unionData, ctx);
    const names = ops.map((op) => op.name);
    expect(names).toContain("get");
    expect(names).toContain("has");
    expect(names).toContain("keys");
    expect(names).toContain("values");
  });

  it("returns limited operations for undefined data", () => {
    const ctx = createTestContext();
    const data = createData({ type: { kind: "undefined" } });
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).not.toContain("length");
    expect(names).not.toContain("add");
  });

  it("returns limited operations for error data", () => {
    const ctx = createTestContext();
    const data = testError("oops");
    const ops = getFilteredOperations(data, ctx);
    const names = ops.map((op) => op.name);
    expect(names).not.toContain("length");
    expect(names).not.toContain("add");
  });
});

describe("createOperationCall additional coverage", () => {
  it("creates operation call for incompatible operation name", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testString("hello");
    const result = await createOperationCall({
      data,
      name: "nonExistentOp",
      context: ctx,
    });
    expect(result.type.kind).toBe("operation");
  });
});

describe("call operation with async operations", () => {
  function findBuiltIn(name: string): OperationListItem {
    const op = builtInOperations.find((o) => o.name === name);
    if (!op) throw new Error(`Operation "${name}" not found`);
    return op;
  }

  it("returns Promise instance type when calling an async operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const asyncOp = testOperation(
      [stringStatement("input", "param")],
      [stringStatement("result")],
      "asyncOp"
    );
    (asyncOp.value as Record<string, unknown>).isAsync = true;
    asyncOp.type.result = {
      kind: "instance",
      className: "Promise",
      constructorArgs: [],
      result: { kind: "string" },
    };

    const callOp = findBuiltIn("call");
    const result = await executeOperation(
      callOp,
      asyncOp,
      [stringStatement("hello")],
      ctx
    );
    expect(result.type.kind).toBe("instance");
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("Promise");
      expect(result.type.result).toBeDefined();
      expect(result.type.result?.kind).toBe("string");
    }
  });

  it("returns unwrapped type when calling a sync operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const syncOp = testOperation(
      [stringStatement("input", "param")],
      [stringStatement("result")],
      "syncOp"
    );

    const callOp = findBuiltIn("call");
    const result = await executeOperation(
      callOp,
      syncOp,
      [stringStatement("hello")],
      ctx
    );
    expect(result.type.kind).not.toBe("instance");
  });

  it("preserves Promise value when calling async operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const asyncOp = testOperation(
      [stringStatement("input", "param")],
      [stringStatement("result")],
      "asyncOp"
    );
    (asyncOp.value as Record<string, unknown>).isAsync = true;
    asyncOp.type.result = {
      kind: "instance",
      className: "Promise",
      constructorArgs: [],
      result: { kind: "string" },
    };

    const callOp = findBuiltIn("call");
    const result = await executeOperation(
      callOp,
      asyncOp,
      [stringStatement("hello")],
      ctx
    );
    expect(result.type.kind).toBe("instance");
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("Promise");
      const instanceData = result.value as { instanceId: string };
      const instance = ctx.getInstance(instanceData.instanceId)?.instance;
      expect(instance).toBeDefined();
    }
  });

  it("call expectedType returns operation result type for operations", () => {
    const asyncOp = testOperation(
      [stringStatement("input", "param")],
      [stringStatement("result")],
      "asyncOp"
    );
    (asyncOp.value as Record<string, unknown>).isAsync = true;
    asyncOp.type.result = {
      kind: "instance",
      className: "Promise",
      constructorArgs: [],
      result: { kind: "string" },
    };

    const callOp = builtInOperations.find((o) => o.name === "call")!;

    expect(callOp.expectedType).toBeDefined();
    const expectedType =
      typeof callOp.expectedType === "function"
        ? callOp.expectedType(asyncOp)
        : callOp.expectedType;
    if (!expectedType) return;
    expect(expectedType.kind).toBe("instance");
    if (expectedType.kind === "instance") {
      expect(expectedType.className).toBe("Promise");
      expect(expectedType.result?.kind).toBe("string");
    }
  });
});
