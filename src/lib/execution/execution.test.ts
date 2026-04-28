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
import {
  createData,
  createStatement,
  isDataOfType,
  updateContextWithNarrowedTypes,
} from "@/lib/utils";
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
import { IData, IStatement, OperationType } from "../types";

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

describe("recursion support", () => {
  it("supports user-defined operation that calls another user-defined operation", async () => {
    const ctx = createTestContext({ isSync: false });

    const innerOp: OperationListItem = {
      name: "double",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [
        createStatement({
          data: testNumber(0),
          operations: [
            createData({
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
                parameters: [numberStatement(5)],
                statements: [],
              },
            }),
          ],
        }),
      ],
    };

    ctx.variables.set("double", {
      data: testOperation(
        [numberStatement(0, "n")],
        innerOp.statements!,
        "double"
      ),
    });

    const data = testNumber(10);
    const result = await executeOperation(innerOp, data, [], ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(5);
  });

  it("returns runtime error when maxCallDepth is exceeded", async () => {
    const ctx = createTestContext({ isSync: false, maxCallDepth: 1 });

    const infiniteOp: OperationListItem = {
      name: "infinite",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [
        createStatement({
          data: testReference("n", "ref1"),
          operations: [
            createData({
              type: {
                kind: "operation",
                parameters: [{ type: { kind: "number" } }],
                result: { kind: "number" },
              },
              value: { name: "infinite", parameters: [], statements: [] },
            }),
          ],
        }),
      ],
    };

    ctx.variables.set("infinite", {
      data: testOperation(
        [numberStatement(0, "n")],
        infiniteOp.statements!,
        "infinite"
      ),
    });

    const data = testNumber(1);
    const result = await executeOperation(infiniteOp, data, [], ctx);
    expect(result.type.kind).toBe("error");
    if (isDataOfType(result, "error")) {
      expect(result.type.errorType).toBe("runtime_error");
      expect(result.value.reason).toContain("Maximum recursion depth");
    }
  });

  it("returns runtime error when maxCallDepth is exceeded (sync)", () => {
    const ctx = createTestContext({ maxCallDepth: 1 });

    const infiniteOp: OperationListItem = {
      name: "infiniteSync",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [
        createStatement({
          data: testReference("n", "ref1"),
          operations: [
            createData({
              type: {
                kind: "operation",
                parameters: [{ type: { kind: "number" } }],
                result: { kind: "number" },
              },
              value: { name: "infiniteSync", parameters: [], statements: [] },
            }),
          ],
        }),
      ],
    };

    ctx.variables.set("infiniteSync", {
      data: testOperation(
        [numberStatement(0, "n")],
        infiniteOp.statements!,
        "infiniteSync"
      ),
    });

    const data = testNumber(1);
    const result = executeOperationSync(infiniteOp, data, [], ctx);
    expect(result.type.kind).toBe("error");
    if (isDataOfType(result, "error")) {
      expect(result.type.errorType).toBe("runtime_error");
      expect(result.value.reason).toContain("Maximum recursion depth");
    }
  });

  it("allows recursion up to maxCallDepth without error", async () => {
    const ctx = createTestContext({ isSync: false, maxCallDepth: 3 });

    const echoOp: OperationListItem = {
      name: "echo",
      parameters: [{ type: { kind: "string" }, name: "s" }],
      statements: [createStatement({ data: testString("done") })],
    };

    ctx.variables.set("echo", {
      data: testOperation(
        [stringStatement("s", "s")],
        echoOp.statements!,
        "echo"
      ),
    });

    const data = testString("hello");
    const result = await executeOperation(echoOp, data, [], ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("done");
  });

  it("does not limit depth when maxCallDepth is 0 (unlimited)", async () => {
    const ctx = createTestContext({ isSync: false, maxCallDepth: 0 });

    const simpleOp: OperationListItem = {
      name: "simple",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [createStatement({ data: testNumber(42) })],
    };

    ctx.variables.set("simple", {
      data: testOperation(
        [numberStatement(0, "n")],
        simpleOp.statements!,
        "simple"
      ),
    });

    const data = testNumber(1);
    const result = await executeOperation(simpleOp, data, [], ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(42);
  });

  it("increments callDepth in nested user-defined operations", async () => {
    const ctx = createTestContext({ isSync: false, maxCallDepth: 2 });

    const innerOp: OperationListItem = {
      name: "inner",
      parameters: [{ type: { kind: "number" }, name: "x" }],
      statements: [createStatement({ data: testNumber(99) })],
    };

    const outerOp: OperationListItem = {
      name: "outer",
      parameters: [{ type: { kind: "number" }, name: "x" }],
      statements: [
        createStatement({
          data: testNumber(1),
          operations: [
            createData({
              type: {
                kind: "operation",
                parameters: [{ type: { kind: "number" } }],
                result: { kind: "number" },
              },
              value: { name: "inner", parameters: [], statements: [] },
            }),
          ],
        }),
      ],
    };

    ctx.variables.set("inner", {
      data: testOperation(
        [numberStatement(0, "x")],
        innerOp.statements!,
        "inner"
      ),
    });
    ctx.variables.set("outer", {
      data: testOperation(
        [numberStatement(0, "x")],
        outerOp.statements!,
        "outer"
      ),
    });

    const data = testNumber(1);
    const result = await executeOperation(outerOp, data, [], ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(99);
  });
});

describe("type narrowing bug fixes", () => {
  it("does not remove context variable when thenElse branch receives no narrowing", () => {
    const original = new Map([["x", { data: testNumber(10) }]]);
    const narrowedTypes = new Map<string, { data: IData }>();
    const ctx = createTestContext({
      variables: original,
      narrowedTypes,
    });

    const trueBranchCtx = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "thenElse",
      0
    );
    expect(trueBranchCtx.variables.get("x")).toBeDefined();
    expect(trueBranchCtx.variables.get("x")?.data.type.kind).toBe("number");

    const falseBranchCtx = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "thenElse",
      1
    );
    expect(falseBranchCtx.variables.get("x")).toBeDefined();
    expect(falseBranchCtx.variables.get("x")?.data.type.kind).toBe("number");
  });
});

describe("lazy operations context variable access", () => {
  function findBuiltIn(name: string): OperationListItem {
    const op = builtInOperations.find((o) => o.name === name);
    if (!op) throw new Error(`Operation "${name}" not found`);
    return op;
  }

  function operationBranch(
    statements: IStatement[],
    parameters?: OperationType["parameters"],
    name?: string
  ): IStatement {
    const opType: OperationType = {
      kind: "operation",
      parameters: parameters ?? [],
      result:
        statements.length > 0
          ? statements[statements.length - 1].data.type
          : { kind: "undefined" },
    };
    return createStatement({
      data: createData({
        type: opType,
        value: { parameters: [], statements, name },
      }),
    });
  }

  describe("thenElse", () => {
    it("accesses outer context variable in true branch", () => {
      const ctx = createTestContext();
      ctx.variables.set("x", { data: testNumber(10) });

      const branch = operationBranch([
        createStatement({ data: testReference("x", "ref1") }),
      ]);
      const op = findBuiltIn("thenElse");
      const data = testBoolean(true);
      const result = executeOperationSync(op, data, [branch], ctx);
      expect(result.type.kind).toBe("number");
      expect(result.value).toBe(10);
    });

    it("accesses outer context variable in false branch", () => {
      const ctx = createTestContext();
      ctx.variables.set("x", { data: testNumber(20) });

      const trueBranch = operationBranch([
        createStatement({ data: testString("yes") }),
      ]);
      const falseBranch = operationBranch([
        createStatement({ data: testReference("x", "ref1") }),
      ]);
      const op = findBuiltIn("thenElse");
      const data = testBoolean(false);
      const result = executeOperationSync(
        op,
        data,
        [trueBranch, falseBranch],
        ctx
      );
      expect(result.type.kind).toBe("number");
      expect(result.value).toBe(20);
    });

    it("accesses outer context variable in both branches", () => {
      const ctx = createTestContext();
      ctx.variables.set("x", { data: testNumber(10) });

      const trueBranch = operationBranch([
        createStatement({ data: testReference("x", "ref1") }),
      ]);
      const falseBranch = operationBranch([
        createStatement({ data: testReference("x", "ref2") }),
      ]);
      const op = findBuiltIn("thenElse");
      const result1 = executeOperationSync(
        op,
        testBoolean(true),
        [trueBranch, falseBranch],
        ctx
      );
      expect(result1.value).toBe(10);

      const result2 = executeOperationSync(
        op,
        testBoolean(false),
        [trueBranch, falseBranch],
        ctx
      );
      expect(result2.value).toBe(10);
    });

    it("returns undefined when false branch is omitted and condition is false", () => {
      const ctx = createTestContext();
      const trueBranch = operationBranch([
        createStatement({ data: testString("yes") }),
      ]);
      const op = findBuiltIn("thenElse");
      const result = executeOperationSync(
        op,
        testBoolean(false),
        [trueBranch],
        ctx
      );
      expect(isDataOfType(result, "undefined")).toBe(true);
    });

    it("accesses outer context variable asynchronously in true branch", async () => {
      const ctx = createTestContext({ isSync: false });
      ctx.variables.set("x", { data: testNumber(42) });

      const branch = operationBranch([
        createStatement({ data: testReference("x", "ref1") }),
      ]);
      const op = findBuiltIn("thenElse");
      const result = await executeOperation(
        op,
        testBoolean(true),
        [branch],
        ctx
      );
      expect(result.type.kind).toBe("number");
      expect(result.value).toBe(42);
    });
  });

  describe("and", () => {
    it("accesses outer context variable in branch when condition is true", () => {
      const ctx = createTestContext();
      ctx.variables.set("x", { data: testNumber(5) });

      const branch = operationBranch([
        createStatement({ data: testReference("x", "ref1") }),
      ]);
      const op = findBuiltIn("and");
      const data = testBoolean(true);
      const result = executeOperationSync(op, data, [branch], ctx);
      expect(result.value).toBe(5);
    });

    it("short-circuits when condition is false", () => {
      const ctx = createTestContext();
      const branch = operationBranch([
        createStatement({ data: testString("should not reach") }),
      ]);
      const op = findBuiltIn("and");
      const data = testBoolean(false);
      const result = executeOperationSync(op, data, [branch], ctx);
      expect(result.value).toBe(false);
    });

    it("accesses outer context variable asynchronously in branch", async () => {
      const ctx = createTestContext({ isSync: false });
      ctx.variables.set("x", { data: testNumber(7) });

      const branch = operationBranch([
        createStatement({ data: testReference("x", "ref1") }),
      ]);
      const op = findBuiltIn("and");
      const result = await executeOperation(
        op,
        testBoolean(true),
        [branch],
        ctx
      );
      expect(result.value).toBe(7);
    });
  });

  describe("or", () => {
    it("accesses outer context variable in branch when condition is false", () => {
      const ctx = createTestContext();
      ctx.variables.set("x", { data: testNumber(3) });

      const branch = operationBranch([
        createStatement({ data: testReference("x", "ref1") }),
      ]);
      const op = findBuiltIn("or");
      const data = testBoolean(false);
      const result = executeOperationSync(op, data, [branch], ctx);
      expect(result.value).toBe(3);
    });

    it("short-circuits when condition is true", () => {
      const ctx = createTestContext();
      const branch = operationBranch([
        createStatement({ data: testString("should not reach") }),
      ]);
      const op = findBuiltIn("or");
      const data = testBoolean(true);
      const result = executeOperationSync(op, data, [branch], ctx);
      expect(result.value).toBe(true);
    });

    it("accesses outer context variable asynchronously in branch", async () => {
      const ctx = createTestContext({ isSync: false });
      ctx.variables.set("x", { data: testNumber(9) });

      const branch = operationBranch([
        createStatement({ data: testReference("x", "ref1") }),
      ]);
      const op = findBuiltIn("or");
      const result = await executeOperation(
        op,
        testBoolean(false),
        [branch],
        ctx
      );
      expect(result.value).toBe(9);
    });
  });
});

describe("memoization", () => {
  it("caches and returns same object reference for identical inputs", async () => {
    const ctx = createTestContext({
      isSync: false,
      operationCache: new Map(),
    });

    const op: OperationListItem = {
      id: "passthrough",
      name: "passthrough",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [numberStatement(0)],
    };

    const result1 = await executeOperation(op, testNumber(42), [], ctx);
    const result2 = await executeOperation(op, testNumber(42), [], ctx);

    expect(result1.value).toBe(0);
    expect(result2.value).toBe(0);
    expect(result1.value).toBe(result2.value);
  });

  it("does not return cached result for different inputs", async () => {
    const ctx = createTestContext({
      isSync: false,
      operationCache: new Map(),
    });

    const op: OperationListItem = {
      id: "passthrough2",
      name: "passthrough",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [numberStatement(0)],
    };

    const result1 = await executeOperation(op, testNumber(10), [], ctx);
    const result2 = await executeOperation(op, testNumber(20), [], ctx);

    expect(ctx.operationCache?.size).toBe(2);
    expect(result1.value).toBe(0);
    expect(result2.value).toBe(0);
  });

  it("caches along sync path", () => {
    const ctx = createTestContext({ operationCache: new Map() });

    const op: OperationListItem = {
      id: "passthrough3",
      name: "passthrough",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [numberStatement(0)],
    };

    const result1 = executeOperationSync(op, testNumber(7), [], ctx);
    const result2 = executeOperationSync(op, testNumber(7), [], ctx);

    expect(result1.value).toBe(0);
    expect(result2.value).toBe(0);
    expect(ctx.operationCache?.size).toBe(1);
  });

  it("skips caching when operation has no id", async () => {
    const ctx = createTestContext({
      isSync: false,
      operationCache: new Map(),
    });

    const op = {
      name: "noIdOp",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [numberStatement(99)],
    } as OperationListItem;

    await executeOperation(op, testNumber(1), [], ctx);
    await executeOperation(op, testNumber(1), [], ctx);

    expect(ctx.operationCache?.size).toBe(0);
  });

  it("skips caching for non-memoizable param types (instance with unsupported arg)", async () => {
    const ctx = createTestContext({
      isSync: false,
      operationCache: new Map(),
    });

    const op: OperationListItem = {
      id: "handleError",
      name: "processError",
      parameters: [
        { type: { kind: "error", errorType: "custom_error" }, name: "e" },
      ],
      statements: [stringStatement("done")],
    };

    await executeOperation(op, testError("boom"), [], ctx);
    await executeOperation(op, testError("boom"), [], ctx);

    expect(ctx.operationCache?.size).toBe(0);
  });

  it("caches instance with memoizable constructor args", async () => {
    const ctx = createTestContext({
      isSync: false,
      operationCache: new Map(),
    });
    ctx.isSync = false;

    const op: OperationListItem = {
      id: "greet",
      name: "greet",
      parameters: [
        {
          type: {
            kind: "instance",
            className: "Person",
            constructorArgs: [
              { type: { kind: "string" } },
              { type: { kind: "number" } },
            ],
          },
          name: "person",
        },
      ],
      statements: [stringStatement("hello")],
    };

    const person = createData({
      type: {
        kind: "instance",
        className: "Person",
        constructorArgs: [
          { type: { kind: "string" } },
          { type: { kind: "number" } },
        ],
      },
      value: {
        className: "Person",
        constructorArgs: [stringStatement("Alice"), numberStatement(30)],
        instanceId: "inst1",
      },
    });

    const person2 = createData({
      type: {
        kind: "instance",
        className: "Person",
        constructorArgs: [
          { type: { kind: "string" } },
          { type: { kind: "number" } },
        ],
      },
      value: {
        className: "Person",
        constructorArgs: [stringStatement("Alice"), numberStatement(30)],
        instanceId: "inst2",
      },
    });

    await executeOperation(op, person, [], ctx);
    await executeOperation(op, person2, [], ctx);

    expect(ctx.operationCache?.size).toBe(1);
  });

  it("does not cache handler-based operations", async () => {
    const ctx = createTestContext({
      isSync: false,
      operationCache: new Map(),
    });

    const add = builtInOperations.find((o) => o.name === "add")!;
    await executeOperation(add, testNumber(2), [numberStatement(3)], ctx);
    await executeOperation(add, testNumber(2), [numberStatement(3)], ctx);

    expect(ctx.operationCache?.size).toBe(0);
  });

  it("clears cache when context is replaced (removeAll simulation)", async () => {
    const ctx = createTestContext({
      isSync: false,
      operationCache: new Map(),
    });

    const op: OperationListItem = {
      id: "passthrough5",
      name: "passthrough",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [numberStatement(0)],
    };

    await executeOperation(op, testNumber(1), [], ctx);
    expect(ctx.operationCache?.size).toBe(1);

    ctx.operationCache = new Map();

    await executeOperation(op, testNumber(1), [], ctx);
    expect(ctx.operationCache?.size).toBe(1);
  });

  it("de-duplicates repeated calls", async () => {
    const ctx = createTestContext({
      isSync: false,
      operationCache: new Map(),
    });

    const simpleOp: OperationListItem = {
      id: "identity",
      name: "identity",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [numberStatement(0)],
    };

    await executeOperation(simpleOp, testNumber(1), [], ctx);
    await executeOperation(simpleOp, testNumber(1), [], ctx);
    await executeOperation(simpleOp, testNumber(2), [], ctx);
    await executeOperation(simpleOp, testNumber(2), [], ctx);
    await executeOperation(simpleOp, testNumber(1), [], ctx);

    expect(ctx.operationCache?.size).toBe(2);
  });
});

describe("abort signal", () => {
  it("skips all statements when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const ctx = createTestContext({
      isSync: false,
      abortSignal: controller.signal,
    });

    const stmt = stringStatement("hello", "x");
    const op = testOperation([], [stmt]);

    await setOperationResults(op, ctx);

    // No context should be stored for the statement since it was never executed
    expect(ctx.getContext(stmt.id).scopeId).toBe("_root_");
  });

  it("executes all statements when signal is not aborted", async () => {
    const controller = new AbortController();

    const ctx = createTestContext({
      isSync: false,
      abortSignal: controller.signal,
    });

    const stmt = stringStatement("hello", "x");
    const op = testOperation([], [stmt]);

    await setOperationResults(op, ctx);

    // The statement context should have x stored via executeStatement
    const stmtCtx = ctx.getContext(stmt.id);
    expect(stmtCtx.variables.has("x")).toBe(true);
  });

  it("abort signal does not affect sync path", () => {
    const controller = new AbortController();
    controller.abort();

    const ctx = createTestContext({
      isSync: true,
      abortSignal: controller.signal,
    });

    const stmt = stringStatement("hello", "x");
    const op = testOperation([], [stmt]);

    setOperationResults(op, ctx);

    const stmtCtx = ctx.getContext(stmt.id);
    expect(stmtCtx.variables.has("x")).toBe(true);
  });

  it("stops deep execution when signal aborts mid-recursion", async () => {
    const controller = new AbortController();

    const ctx = createTestContext({
      isSync: false,
      abortSignal: controller.signal,
      callDepth: 0,
    });

    const selfCallingOp: OperationListItem = {
      name: "recurse",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [
        createStatement({
          data: testNumber(0),
          operations: [
            createData({
              type: {
                kind: "operation",
                parameters: [{ type: { kind: "number" } }],
                result: { kind: "number" },
              },
              value: {
                name: "recurse",
                parameters: [numberStatement(0)],
                statements: [],
              },
            }),
          ],
        }),
      ],
    };

    ctx.variables.set("recurse", {
      data: testOperation(
        [numberStatement(0, "n")],
        selfCallingOp.statements!,
        "recurse"
      ),
    });

    setTimeout(() => controller.abort(), 0);

    const thenable = setOperationResults(
      testOperation([numberStatement(1, "n")], selfCallingOp.statements!),
      { ...ctx, maxCallDepth: 100 }
    );

    await thenable;
    // If we get here without throwing, the abort was handled
  });
});

describe("yield counter", () => {
  it("yieldCounter is not set on sync contexts", () => {
    const ctx = createTestContext({ isSync: true });

    const op = testOperation([], [stringStatement("hello", "x")]);
    setOperationResults(op, ctx);

    expect(ctx.yieldCounter).toBeUndefined();
  });

  it("yieldCounter is not incremented at callDepth 0", async () => {
    const ctx = createTestContext({
      isSync: false,
      callDepth: 0,
      yieldCounter: { calls: 0 },
    });

    const op = testOperation([], [stringStatement("hello", "x")]);
    await setOperationResults(op, ctx);

    // At callDepth 0, the yield check in executeStatement is skipped
    expect(ctx.yieldCounter?.calls).toBe(0);
  });

  it("yieldCounter increments during recursive async execution", async () => {
    const ctx = createTestContext({
      isSync: false,
      callDepth: 0,
      maxCallDepth: 250,
      yieldCounter: { calls: 0 },
    });

    const calleeOp: OperationListItem = {
      name: "callee",
      parameters: [{ type: { kind: "number" }, name: "n" }],
      statements: [stringStatement("done")],
    };

    const callerOp: OperationListItem = {
      name: "caller",
      parameters: [],
      statements: [
        createStatement({
          data: testNumber(0),
          operations: [
            createData({
              type: {
                kind: "operation",
                parameters: [{ type: { kind: "number" } }],
                result: { kind: "string" },
              },
              value: {
                name: "callee",
                parameters: [numberStatement(42)],
                statements: [],
              },
            }),
          ],
        }),
      ],
    };

    ctx.variables.set("callee", {
      data: testOperation(
        [numberStatement(0, "n")],
        calleeOp.statements!,
        "callee"
      ),
    });

    await setOperationResults(testOperation([], callerOp.statements!), ctx);

    // The callee operation increments callDepth to 1 in executeOperationCore,
    // and executeStatement checks callDepth > 0 at that level
    expect(ctx.yieldCounter?.calls).toBeGreaterThan(0);
  });
});

describe("buffered setResult/getResult", () => {
  it("getResult returns value set by setResult within same execution", async () => {
    const ctx = createTestContext({ isSync: false });

    const stmt = stringStatement("hello", "x");
    const op = testOperation([], [stmt]);
    await setOperationResults(op, ctx);

    const stmtCtx = ctx.getContext(stmt.id);
    expect(stmtCtx.variables.has("x")).toBe(true);
  });

  it("results from one statement are visible to the next in the same execution", async () => {
    const ctx = createTestContext({
      isSync: false,
      yieldCounter: { calls: 0 },
    });

    const stmt1 = stringStatement("value1", "var1");
    const stmt2 = createStatement({
      data: testReference("var1", "ref1"),
    });

    const op = testOperation([], [stmt1, stmt2]);
    await setOperationResults(op, ctx);

    const stmtCtx = ctx.getContext(stmt1.id);
    expect(stmtCtx.variables.has("var1")).toBe(true);
    expect(stmtCtx.variables.get("var1")?.data.type.kind).toBe("string");
  });
});
