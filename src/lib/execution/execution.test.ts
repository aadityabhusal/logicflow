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
import { slice } from "@/lib/operations/runtime";
import {
  createData,
  createStatement,
  isDataOfType,
  getRawValueFromData,
  updateContextWithNarrowedTypes,
  operationToListItem,
  resolveConstructorArgs,
} from "@/lib/utils";
import { InstanceTypes } from "@/lib/data";
import { builtInOperations } from "@/lib/operations/built-in";
import { OperationListItem, Context } from "@/lib/execution/types";
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
  testDictionary,
  testTuple,
  stringStatement,
  numberStatement,
  booleanStatement,
  testUndefined,
} from "@/tests/helpers";
import {
  ArrayType,
  IData,
  IStatement,
  InstanceDataType,
  OperationType,
} from "../types";

function findBuiltIn(name: string): OperationListItem {
  const op = builtInOperations.find((o) => o.name === name);
  if (!op) throw new Error(`Operation "${name}" not found`);
  return op;
}

function testBuiltInOperation(
  name: string,
  parameters: OperationType["parameters"],
  result: OperationType["result"],
  args: IStatement[] = []
) {
  const operation = testOperation(args, [], name);
  operation.type.parameters = parameters;
  operation.type.result = result;
  return operation;
}

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

  it("resolves references asynchronously", async () => {
    const ctx = createTestContext({ isSync: false });
    const resolvedValue = testNumber(99);
    ctx.variables.set("x", { data: resolvedValue });
    const ref = testReference("x", "stmt1");
    const stmt = createStatement({ data: ref });
    const result = await executeStatement(stmt, ctx);
    expect(result.value).toBe(99);
  });

  it("executes nested array data child elements asynchronously", async () => {
    const ctx = createTestContext({ isSync: false });
    const arrData = testArray([stringStatement("a"), stringStatement("b")]);
    const stmt = createStatement({ data: arrData });
    const result = await executeStatement(stmt, ctx);
    expect(isDataOfType(result, "array")).toBe(true);
    expect(result.value).toHaveLength(2);
  });

  it("executes nested object data entries asynchronously", async () => {
    const ctx = createTestContext({ isSync: false });
    const objData = testObject([
      { key: "name", value: stringStatement("Alice") },
    ]);
    const stmt = createStatement({ data: objData });
    const result = await executeStatement(stmt, ctx);
    expect(isDataOfType(result, "object")).toBe(true);
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

  it("evaluates condition and returns branch result when no operations", async () => {
    const ctx = createTestContext({ isSync: false });
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("yes");
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

  it("evaluates condition and returns branch result (sync)", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const result = executeStatementSync(stmt, ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("yes");
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

  it("executes condition data synchronously", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const result = executeStatementSync(stmt, ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("yes");
  });

  it("executes false branch of condition synchronously", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(false),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const result = executeStatementSync(stmt, ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("no");
  });

  it("propagates error from chained operations in sync path", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    const badOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "nonExistentOp", parameters: [], statements: [] },
    });
    const stmt = createStatement({ data, operations: [badOp] });
    const result = executeStatementSync(stmt, ctx);
    expect(result.type.kind).toBe("error");
    if (result.type.kind === "error") {
      expect(result.type.errorType).toBe("type_error");
    }
  });

  it("executes statement with union data synchronously", () => {
    const ctx = createTestContext();
    const unionData = createData({
      type: {
        kind: "union",
        types: [{ kind: "string" }, { kind: "number" }],
        activeIndex: 0,
      },
      value: "active",
    });
    const stmt = createStatement({ data: unionData });
    const result = executeStatementSync(stmt, ctx);
    expect(isDataOfType(result, "union")).toBe(true);
  });

  it("executes statement with dictionary data synchronously", () => {
    const ctx = createTestContext();
    const dictData = testDictionary(
      [{ key: "x", value: stringStatement("val") }],
      { kind: "string" }
    );
    const stmt = createStatement({ data: dictData });
    const result = executeStatementSync(stmt, ctx);
    expect(isDataOfType(result, "dictionary")).toBe(true);
  });

  it("executes statement with tuple data synchronously", () => {
    const ctx = createTestContext();
    const tupleData = testTuple([stringStatement("a"), numberStatement(1)]);
    const stmt = createStatement({ data: tupleData });
    const result = executeStatementSync(stmt, ctx);
    expect(isDataOfType(result, "tuple")).toBe(true);
  });
});

describe("executeOperation", () => {
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

  it("includes the full inner error message for non-call parameter mismatches", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("add");
    const data = testNumber(10);
    const invalidLengthParam = createStatement({
      data: testNumber(1),
      operations: [
        testBuiltInOperation("length", [{ type: { kind: "string" } }], {
          kind: "number",
        }),
      ],
    });

    const result = await executeOperation(op, data, [invalidLengthParam], ctx);

    expect(isDataOfType(result, "error")).toBe(true);
    if (!isDataOfType(result, "error")) return;
    expect(result.type.errorType).toBe("type_error");
    expect(result.value.reason).toContain(
      "Type Error: Cannot chain 'length' after 'number' type"
    );
    expect(result.value.reason).not.toContain("but is of type: `Type Error`");
  });

  it("propagates inner type errors through call parameters", async () => {
    const ctx = createTestContext({ isSync: false });
    const callOp = findBuiltIn("call");
    const callee = testOperation(
      [createStatement({ name: "input", data: testNumber(0) })],
      [numberStatement(0)]
    );
    const invalidLengthParam = createStatement({
      data: testNumber(1),
      operations: [
        testBuiltInOperation("length", [{ type: { kind: "string" } }], {
          kind: "number",
        }),
      ],
    });

    const result = await executeOperation(
      callOp,
      callee,
      [invalidLengthParam],
      ctx
    );

    expect(isDataOfType(result, "error")).toBe(true);
    if (!isDataOfType(result, "error")) return;
    expect(result.type.errorType).toBe("type_error");
    expect(result.value.reason).toBe(
      "Cannot chain 'length' after 'number' type"
    );
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

  it("returns error when input data type is never (not filtered before execution)", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("length");
    const neverData = createData({ type: { kind: "never" } });
    const result = await executeOperation(op, neverData, [], ctx);
    expect(result.type.kind).toBe("error");
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

  it("passes empty slice results into call with the source array type", async () => {
    const ctx = createTestContext({ isSync: false });
    const arrayOfNumbers: ArrayType = {
      kind: "array",
      elementType: { kind: "number" },
    };

    const paramStatement = createStatement({
      id: "param",
      name: "param",
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(0)],
      }),
    });

    const userOp = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ name: "param", type: arrayOfNumbers }],
        result: arrayOfNumbers,
      },
      value: {
        parameters: [paramStatement],
        statements: [
          createStatement({
            data: createData({
              type: { kind: "reference", name: "param" },
              value: { name: "param", id: paramStatement.id },
            }),
            operations: [
              createData<OperationType>({
                type: {
                  kind: "operation",
                  parameters: [
                    {
                      type: { kind: "array", elementType: { kind: "unknown" } },
                    },
                    {
                      type: { kind: "array", elementType: { kind: "unknown" } },
                    },
                  ],
                  result: arrayOfNumbers,
                },
                value: {
                  name: "concat",
                  parameters: [
                    createStatement({
                      data: createData({
                        type: arrayOfNumbers,
                        value: [numberStatement(100)],
                      }),
                    }),
                  ],
                  statements: [],
                },
              }),
            ],
          }),
        ],
      },
    });

    const result = await executeOperation(
      findBuiltIn("call"),
      userOp,
      [
        createStatement({
          data: createData({
            type: arrayOfNumbers,
            value: [numberStatement(12)],
          }),
          operations: [
            createData<OperationType>({
              type: {
                kind: "operation",
                parameters: [
                  { type: { kind: "array", elementType: { kind: "unknown" } } },
                  { type: { kind: "number" }, isOptional: true },
                  { type: { kind: "number" }, isOptional: true },
                ],
                result: arrayOfNumbers,
              },
              value: {
                name: "slice",
                parameters: [numberStatement(1)],
                statements: [],
              },
            }),
          ],
        }),
      ],
      ctx
    );

    expect(isDataOfType(result, "error")).toBe(false);
    expect(result.type.kind).toBe("array");
    if (result.type.kind === "array") {
      expect(result.type.elementType.kind).toBe("number");
    }
    expect(getRawValueFromData(result, ctx)).toEqual([100]);
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
    expect(result.type.kind).toBe("undefined");
  });

  it("returns type error when parameter count differs from expected", async () => {
    const ctx = createTestContext({ isSync: false });
    const op = findBuiltIn("add");
    const data = testNumber(10);
    const result = await executeOperation(op, data, [], ctx);
    expect(result.type.kind).toBe("error");
    if (result.type.kind === "error") {
      expect(result.type.errorType).toBe("type_error");
    }
  });
});

describe("executeOperationSync", () => {
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

  it("propagates error through chained user-defined operation synchronously", () => {
    const ctx = createTestContext();
    const causeErrorOp: OperationListItem = {
      name: "causeError",
      parameters: [],
      statements: [createStatement({ data: testError("inner failure") })],
    };
    const result = executeOperationSync(
      causeErrorOp,
      testString("unused"),
      [],
      ctx
    );
    expect(result.type.kind).toBe("error");
  });

  it("executes thenElse with true condition synchronously (short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("thenElse");
    const data = testBoolean(true);
    const trueBranch = testOperation([], [stringStatement("yes")]);
    const falseBranch = testOperation([], [stringStatement("no")]);
    const result = executeOperationSync(
      op,
      data,
      [
        createStatement({ data: trueBranch }),
        createStatement({ data: falseBranch }),
      ],
      ctx
    );
    expect(result.value).toBe("yes");
  });

  it("executes thenElse with false condition synchronously (short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("thenElse");
    const data = testBoolean(false);
    const trueBranch = testOperation([], [stringStatement("yes")]);
    const falseBranch = testOperation([], [stringStatement("no")]);
    const result = executeOperationSync(
      op,
      data,
      [
        createStatement({ data: trueBranch }),
        createStatement({ data: falseBranch }),
      ],
      ctx
    );
    expect(result.value).toBe("no");
  });

  it("executes and operation with false synchronously (short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("and");
    const data = testBoolean(false);
    const result = executeOperationSync(
      op,
      data,
      [createStatement({ data: testOperation([], []) })],
      ctx
    );
    expect(result.type.kind).toBe("boolean");
    expect(result.value).toBe(false);
  });

  it("executes or operation with true synchronously (short-circuit)", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("or");
    const data = testBoolean(true);
    const result = executeOperationSync(
      op,
      data,
      [createStatement({ data: testOperation([], []) })],
      ctx
    );
    expect(result.type.kind).toBe("boolean");
    expect(result.value).toBe(true);
  });

  it("executes greaterThan operation synchronously", () => {
    const ctx = createTestContext();
    const op = findBuiltIn("greaterThan");
    const data = testNumber(10);
    const result = executeOperationSync(op, data, [numberStatement(5)], ctx);
    expect(result.value).toBe(true);
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
  it("falls back to the first compatible operation when requested name is invalid", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testString("hello");
    const firstCompatible = getFilteredOperations(data, ctx)[0];
    const result = await createOperationCall({
      data,
      name: "nonExistentOp",
      operationId: "non-existent-op",
      context: ctx,
    });
    expect(result.type.kind).toBe("operation");
    expect(result.value.name).toBe(firstCompatible.name);
  });

  it("creates operation call using first compatible operation when name is undefined", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testString("hello");
    const result = await createOperationCall({
      data,
      name: undefined,
      context: ctx,
    });
    expect(result.type.kind).toBe("operation");
    expect(result.value.name).toBeDefined();
  });

  it("preserves existing parameter values when types are compatible", async () => {
    const ctx = createTestContext({ isSync: false });
    const data = testNumber(10);
    const existingParam = numberStatement(5);
    const result = await createOperationCall({
      data,
      name: "add",
      parameters: [existingParam],
      operationId: "preserve-param",
      context: ctx,
    });
    expect(result.value.parameters).toHaveLength(1);
    expect(result.value.parameters[0].data.value).toBe(5);
  });

  it("regenerates existing parameters when their result type is incompatible", async () => {
    const ctx = createTestContext({ isSync: false });
    const result = await createOperationCall({
      data: testNumber(10),
      name: "add",
      parameters: [stringStatement("bad")],
      context: ctx,
    });

    expect(result.value.parameters).toHaveLength(1);
    expect(result.value.parameters[0].data.type.kind).toBe("number");
    expect(result.value.parameters[0].data.value).toBe(0);
  });
});

describe("call operation with async operations", () => {
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

describe("call with empty slice preserves parameter types in recursion", () => {
  const arrayOfNumbers: ArrayType = {
    kind: "array",
    elementType: { kind: "number" },
  };

  it("preserves array<number> when sliced param becomes empty in recursive call", async () => {
    const ctx = createTestContext({ isSync: false });

    const arrParam = createStatement({
      id: "recur-arr-param",
      name: "arr",
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(99)],
      }),
    });

    const otherParam = createStatement({
      id: "recur-other-param",
      name: "other",
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(7)],
      }),
    });

    const baseCase = testOperation(
      [],
      [createStatement({ data: testReference("arr", arrParam.id) })]
    );

    const recursiveCase = testOperation(
      [],
      [
        createStatement({
          data: testReference("recur_op", "recur-self-ref"),
          operations: [
            testOperation(
              [
                createStatement({
                  data: testReference("arr", arrParam.id),
                }),
                createStatement({
                  data: testReference("other", otherParam.id),
                  operations: [
                    testOperation([numberStatement(1)], [], "slice"),
                  ],
                }),
              ],
              [],
              "call"
            ),
          ],
        }),
      ]
    );

    const bodyStmt = createStatement({
      data: testReference("other", otherParam.id),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [
              {
                type: { kind: "array", elementType: { kind: "unknown" } },
              },
            ],
            result: { kind: "number" },
          },
          value: { name: "length", parameters: [], statements: [] },
        }),
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [
              { type: { kind: "unknown" } },
              { type: { kind: "unknown" } },
            ],
            result: { kind: "boolean" },
          },
          value: {
            name: "isShallowEqual",
            parameters: [numberStatement(0)],
            statements: [],
          },
        }),
        testOperation(
          [
            createStatement({ data: baseCase }),
            createStatement({ data: recursiveCase }),
          ],
          [],
          "thenElse"
        ),
      ],
    });

    const recurOpIData = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [
          { name: "arr", type: arrayOfNumbers },
          { name: "other", type: arrayOfNumbers },
        ],
        result: arrayOfNumbers,
      },
      value: {
        parameters: [arrParam, otherParam],
        statements: [bodyStmt],
        name: "recur_op",
      },
    });

    ctx.variables.set("recur_op", { data: recurOpIData });

    const recurOpItem = operationToListItem(recurOpIData, "recur_op");
    const arrData = createData({
      type: arrayOfNumbers,
      value: [numberStatement(99)],
    });
    const otherStatement = createStatement({
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(7)],
      }),
    });

    const result = await executeOperation(
      recurOpItem,
      arrData,
      [otherStatement],
      ctx
    );

    expect(isDataOfType(result, "error")).toBe(false);
    expect(result.type.kind).toBe("array");
    if (result.type.kind === "array") {
      expect(result.type.elementType.kind).toBe("number");
    }
    expect(getRawValueFromData(result, ctx)).toEqual([99]);
  });

  it("preserves array<number> when sliced param is source data in recursive call", async () => {
    const ctx = createTestContext({ isSync: false });

    const arrParam = createStatement({
      id: "recur2-arr-param",
      name: "arr",
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(99)],
      }),
    });

    const otherParam = createStatement({
      id: "recur2-other-param",
      name: "other",
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(7)],
      }),
    });

    const baseCase = testOperation(
      [],
      [createStatement({ data: testReference("other", otherParam.id) })]
    );

    const recursiveCase = testOperation(
      [],
      [
        createStatement({
          data: testReference("recur_op2", "recur2-self-ref"),
          operations: [
            testOperation(
              [
                createStatement({
                  data: testReference("arr", arrParam.id),
                  operations: [
                    testOperation([numberStatement(1)], [], "slice"),
                  ],
                }),
                createStatement({
                  data: testReference("other", otherParam.id),
                }),
              ],
              [],
              "call"
            ),
          ],
        }),
      ]
    );

    const bodyStmt = createStatement({
      data: testReference("arr", arrParam.id),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [
              {
                type: { kind: "array", elementType: { kind: "unknown" } },
              },
            ],
            result: { kind: "number" },
          },
          value: { name: "length", parameters: [], statements: [] },
        }),
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [
              { type: { kind: "unknown" } },
              { type: { kind: "unknown" } },
            ],
            result: { kind: "boolean" },
          },
          value: {
            name: "isShallowEqual",
            parameters: [numberStatement(0)],
            statements: [],
          },
        }),
        testOperation(
          [
            createStatement({ data: baseCase }),
            createStatement({ data: recursiveCase }),
          ],
          [],
          "thenElse"
        ),
      ],
    });

    const recurOp2IData = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [
          { name: "arr", type: arrayOfNumbers },
          { name: "other", type: arrayOfNumbers },
        ],
        result: arrayOfNumbers,
      },
      value: {
        parameters: [arrParam, otherParam],
        statements: [bodyStmt],
        name: "recur_op2",
      },
    });

    ctx.variables.set("recur_op2", { data: recurOp2IData });

    const recurOp2Item = operationToListItem(recurOp2IData, "recur_op2");
    const arrStatement = createStatement({
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(99)],
      }),
    });
    const otherData = createData({
      type: arrayOfNumbers,
      value: [numberStatement(7)],
    });

    const result = await executeOperation(
      recurOp2Item,
      arrStatement.data,
      [createStatement({ data: otherData })],
      ctx
    );

    expect(isDataOfType(result, "error")).toBe(false);
    expect(result.type.kind).toBe("array");
    if (result.type.kind === "array") {
      expect(result.type.elementType.kind).toBe("number");
    }
    expect(getRawValueFromData(result, ctx)).toEqual([7]);
  });

  it("keeps outer cached values isolated across recursive concat calls", async () => {
    const ctx = createTestContext({ isSync: false });

    const arrParam = createStatement({
      id: "copy-arr-param",
      name: "arr",
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(1), numberStatement(2), numberStatement(3)],
      }),
    });

    const baseCase = testOperation(
      [],
      [createStatement({ data: testReference("arr", arrParam.id) })]
    );

    const recursiveCase = testOperation(
      [],
      [
        createStatement({
          data: createData({
            type: arrayOfNumbers,
            value: [
              createStatement({
                data: testReference("arr", arrParam.id),
                operations: [testOperation([numberStatement(0)], [], "at")],
              }),
            ],
          }),
          operations: [
            testOperation(
              [
                createStatement({
                  data: testReference("copy_op", "copy-self-ref"),
                  operations: [
                    testOperation(
                      [
                        createStatement({
                          data: testReference("arr", arrParam.id),
                          operations: [
                            testOperation([numberStatement(1)], [], "slice"),
                          ],
                        }),
                      ],
                      [],
                      "call"
                    ),
                  ],
                }),
              ],
              [],
              "concat"
            ),
          ],
        }),
      ]
    );

    const bodyStmt = createStatement({
      data: testReference("arr", arrParam.id),
      operations: [
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [
              {
                type: { kind: "array", elementType: { kind: "unknown" } },
              },
            ],
            result: { kind: "number" },
          },
          value: { name: "length", parameters: [], statements: [] },
        }),
        createData<OperationType>({
          type: {
            kind: "operation",
            parameters: [
              { type: { kind: "unknown" } },
              { type: { kind: "unknown" } },
            ],
            result: { kind: "boolean" },
          },
          value: {
            name: "isShallowEqual",
            parameters: [numberStatement(0)],
            statements: [],
          },
        }),
        testOperation(
          [
            createStatement({ data: baseCase }),
            createStatement({ data: recursiveCase }),
          ],
          [],
          "thenElse"
        ),
      ],
    });

    const copyOpIData = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ name: "arr", type: arrayOfNumbers }],
        result: arrayOfNumbers,
      },
      value: {
        parameters: [arrParam],
        statements: [bodyStmt],
        name: "copy_op",
      },
    });

    ctx.variables.set("copy_op", { data: copyOpIData });

    const copyOpItem = operationToListItem(copyOpIData, "copy_op");
    const arrData = createData({
      type: arrayOfNumbers,
      value: [numberStatement(1), numberStatement(2), numberStatement(3)],
    });

    const result = await executeOperation(copyOpItem, arrData, [], ctx);

    expect(isDataOfType(result, "error")).toBe(false);
    expect(getRawValueFromData(result, ctx)).toEqual([1, 2, 3]);
  });

  it("preserves the base error message across recursive call nesting", async () => {
    const ctx = createTestContext({ isSync: false });
    const numberType = { kind: "number" } as const;

    const nParam = createStatement({
      id: "recur-error-n-param",
      name: "n",
      data: createData({ type: numberType, value: 2 }),
    });

    const baseCase = testOperation(
      [],
      [
        createStatement({
          data: testNumber(1),
          operations: [
            testBuiltInOperation(
              "length",
              [{ type: { kind: "string" } }],
              numberType
            ),
          ],
        }),
      ]
    );

    const recursiveCase = testOperation(
      [],
      [
        createStatement({
          data: testReference("recur_error", "recur-error-self-ref"),
          operations: [
            testOperation(
              [
                createStatement({
                  data: testReference(
                    "recur_error",
                    "recur-error-inner-self-ref"
                  ),
                  operations: [
                    testOperation(
                      [
                        createStatement({
                          data: testReference("n", nParam.id),
                          operations: [
                            testBuiltInOperation(
                              "subtract",
                              [{ type: numberType }, { type: numberType }],
                              numberType,
                              [numberStatement(1)]
                            ),
                          ],
                        }),
                      ],
                      [],
                      "call"
                    ),
                  ],
                }),
              ],
              [],
              "call"
            ),
          ],
        }),
      ]
    );

    const bodyStmt = createStatement({
      data: testReference("n", nParam.id),
      operations: [
        testBuiltInOperation(
          "lessThanOrEqual",
          [{ type: numberType }, { type: numberType }],
          { kind: "boolean" },
          [numberStatement(0)]
        ),
        testOperation(
          [
            createStatement({ data: baseCase }),
            createStatement({ data: recursiveCase }),
          ],
          [],
          "thenElse"
        ),
      ],
    });

    const recurOpIData = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ name: "n", type: numberType }],
        result: numberType,
      },
      value: {
        parameters: [nParam],
        statements: [bodyStmt],
        name: "recur_error",
      },
    });

    ctx.variables.set("recur_error", { data: recurOpIData });

    const result = await executeOperation(
      operationToListItem(recurOpIData, "recur_error"),
      testNumber(2),
      [],
      ctx
    );

    expect(isDataOfType(result, "error")).toBe(true);
    if (!isDataOfType(result, "error")) return;
    expect(result.type.errorType).toBe("type_error");
    expect(result.value.reason).toBe(
      "Type Error: Cannot chain 'length' after 'number' type"
    );
    expect(result.value.reason).not.toContain("Parameter #1 should be of type");
  });
});

describe("slice data-last (pipe-style) usage", () => {
  it("slice() with no args returns a function that clones the array", () => {
    const fn = slice() as (arr: unknown[]) => unknown[];
    expect(typeof fn).toBe("function");
    expect(fn([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("slice(start) with one arg returns a function that slices from start", () => {
    const fn = slice(1) as (arr: unknown[]) => unknown[];
    expect(typeof fn).toBe("function");
    expect(fn([1, 2, 3])).toEqual([2, 3]);
  });

  it("slice(start, end) with two args returns a function that slices range", () => {
    const fn = slice(1, 3) as (arr: unknown[]) => unknown[];
    expect(typeof fn).toBe("function");
    expect(fn([1, 2, 3, 4])).toEqual([2, 3]);
  });

  it("slice(arr) with array arg calls data-first mode", () => {
    expect(slice([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("slice(arr, start) with array and start calls data-first mode", () => {
    expect(slice([1, 2, 3], 1)).toEqual([2, 3]);
  });

  it("slice(arr, start, end) with all three args calls data-first mode", () => {
    expect(slice([1, 2, 3, 4], 1, 3)).toEqual([2, 3]);
  });
});

describe("manual Promise instances", () => {
  it("resolves then/await chains for manually created Promise instances", async () => {
    const ctx = createTestContext({ isSync: false });
    const promiseType: OperationType["result"] = {
      kind: "instance",
      className: "Promise",
      constructorArgs: resolveConstructorArgs(
        InstanceTypes.Promise.constructorArgs,
        { kind: "string" }
      ),
      result: { kind: "string" },
    };
    const promiseData = createData({ type: promiseType });

    expect(isDataOfType(promiseData, "instance")).toBe(true);
    if (!isDataOfType(promiseData, "instance")) return;

    const executor = promiseData.value.constructorArgs[0]?.data;
    expect(isDataOfType(executor, "operation")).toBe(true);
    if (!isDataOfType(executor, "operation")) return;

    executor.value.statements = [
      createStatement({
        data: testReference("resolve", executor.value.parameters[0].id),
        operations: [
          createData({
            type: {
              kind: "operation",
              parameters: [
                { type: executor.type.parameters[0].type },
                { type: { kind: "string" } },
              ],
              result: { kind: "unknown" },
            },
            value: {
              name: "call",
              parameters: [stringStatement("hello")],
              statements: [],
            },
          }),
        ],
      }),
    ];

    const callbackType: OperationType = {
      kind: "operation",
      parameters: [{ name: "value", type: { kind: "string" } }],
      result: { kind: "string" },
    };
    const callback = createData({ type: callbackType });
    callback.value.statements = [
      createStatement({
        data: testReference("value", callback.value.parameters[0].id),
      }),
    ];

    const statement = createStatement({
      data: promiseData,
      operations: [
        createData({
          type: {
            kind: "operation",
            parameters: [{ type: promiseType }, { type: callbackType }],
            result: {
              kind: "instance",
              className: "Promise",
              constructorArgs: [],
              result: { kind: "string" },
            },
          },
          value: {
            name: "then",
            parameters: [createStatement({ data: callback })],
            statements: [],
          },
        }),
        createData({
          type: {
            kind: "operation",
            parameters: [
              {
                type: {
                  kind: "instance",
                  className: "Promise",
                  constructorArgs: [],
                  result: { kind: "string" },
                },
              },
            ],
            result: { kind: "string" },
          },
          value: { name: "await", parameters: [], statements: [] },
        }),
      ],
    });

    const resultPromise = executeStatement(statement, ctx);
    const timeoutPromise = new Promise<IData>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timed out waiting for manual Promise to resolve"));
      }, 200);
      resultPromise.finally(() => clearTimeout(timeoutId));
    });

    const result = await Promise.race([resultPromise, timeoutPromise]);

    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("hello");
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

  it("isolates block condition scopes across recursive invocations", async () => {
    const ctx = createTestContext({ isSync: false });
    const arrayOfNumbers: ArrayType = {
      kind: "array",
      elementType: { kind: "number" },
    };

    const arrParam = createStatement({
      id: "copy-block-arr-param",
      name: "arr",
      data: createData({
        type: arrayOfNumbers,
        value: [numberStatement(1), numberStatement(2), numberStatement(3)],
      }),
    });

    const recursiveResult = createStatement({
      data: createData({
        type: arrayOfNumbers,
        value: [
          createStatement({
            data: testReference("arr", arrParam.id),
            operations: [testOperation([numberStatement(0)], [], "at")],
          }),
        ],
      }),
      operations: [
        testOperation(
          [
            createStatement({
              data: testReference("copy_block", "copy-block-self-ref"),
              operations: [
                testOperation(
                  [
                    createStatement({
                      data: testReference("arr", arrParam.id),
                      operations: [
                        testOperation([numberStatement(1)], [], "slice"),
                      ],
                    }),
                  ],
                  [],
                  "call"
                ),
              ],
            }),
          ],
          [],
          "concat"
        ),
      ],
    });

    const bodyStmt = createStatement({
      data: testCondition(
        createStatement({
          data: testReference("arr", arrParam.id),
          operations: [
            createData<OperationType>({
              type: {
                kind: "operation",
                parameters: [
                  {
                    type: { kind: "array", elementType: { kind: "unknown" } },
                  },
                ],
                result: { kind: "number" },
              },
              value: { name: "length", parameters: [], statements: [] },
            }),
            createData<OperationType>({
              type: {
                kind: "operation",
                parameters: [
                  { type: { kind: "unknown" } },
                  { type: { kind: "unknown" } },
                ],
                result: { kind: "boolean" },
              },
              value: {
                name: "isShallowEqual",
                parameters: [numberStatement(0)],
                statements: [],
              },
            }),
          ],
        }),
        [createStatement({ data: testReference("arr", arrParam.id) })],
        [stringStatement("entered-branch"), recursiveResult]
      ),
    });

    const copyBlockIData = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ name: "arr", type: arrayOfNumbers }],
        result: arrayOfNumbers,
      },
      value: {
        parameters: [arrParam],
        statements: [bodyStmt],
        name: "copy_block",
      },
    });

    ctx.variables.set("copy_block", { data: copyBlockIData });

    const result = await executeOperation(
      operationToListItem(copyBlockIData, "copy_block"),
      createData({
        type: arrayOfNumbers,
        value: [numberStatement(1), numberStatement(2), numberStatement(3)],
      }),
      [],
      ctx
    );

    expect(isDataOfType(result, "error")).toBe(false);
    expect(getRawValueFromData(result, ctx)).toEqual([1, 2, 3]);
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

  it("short-circuits chain when operation returns fatal error (async)", async () => {
    const ctx = createTestContext({ isSync: false, maxCallDepth: 1 });

    const recursiveOp: OperationListItem = {
      name: "recurseChainAsync",
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
              value: {
                name: "recurseChainAsync",
                parameters: [],
                statements: [],
              },
            }),
          ],
        }),
      ],
    };

    ctx.variables.set("recurseChainAsync", {
      data: testOperation(
        [numberStatement(0, "n")],
        recursiveOp.statements!,
        "recurseChainAsync"
      ),
    });

    const stmt = createStatement({
      data: testNumber(0),
      operations: [
        createData({
          type: {
            kind: "operation",
            parameters: [{ type: { kind: "number" } }],
            result: { kind: "number" },
          },
          value: {
            name: "recurseChainAsync",
            parameters: [],
            statements: [],
          },
        }),
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
            parameters: [numberStatement(3)],
            statements: [],
          },
        }),
      ],
    });

    const result = await executeStatement(stmt, ctx);

    expect(result.type.kind).toBe("error");
    if (isDataOfType(result, "error")) {
      expect(result.type.errorType).toBe("runtime_error");
      expect(result.value.reason).toContain("Maximum recursion depth");
    }
  });

  it("short-circuits chain when operation returns fatal error (sync)", () => {
    const ctx = createTestContext({ maxCallDepth: 1 });

    const recursiveOp: OperationListItem = {
      name: "recurseChainSync",
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
              value: {
                name: "recurseChainSync",
                parameters: [],
                statements: [],
              },
            }),
          ],
        }),
      ],
    };

    ctx.variables.set("recurseChainSync", {
      data: testOperation(
        [numberStatement(0, "n")],
        recursiveOp.statements!,
        "recurseChainSync"
      ),
    });

    const stmt = createStatement({
      data: testNumber(0),
      operations: [
        createData({
          type: {
            kind: "operation",
            parameters: [{ type: { kind: "number" } }],
            result: { kind: "number" },
          },
          value: {
            name: "recurseChainSync",
            parameters: [],
            statements: [],
          },
        }),
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
            parameters: [numberStatement(3)],
            statements: [],
          },
        }),
      ],
    });

    const result = executeStatementSync(stmt, ctx);

    expect(result.type.kind).toBe("error");
    if (isDataOfType(result, "error")) {
      expect(result.type.errorType).toBe("runtime_error");
      expect(result.value.reason).toContain("Maximum recursion depth");
    }
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

    expect(result1).toBe(result2);
    expect(result1.value).toBe(0);
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

describe("fib_op recursion", () => {
  const fibValues = [0, 1, 1, 2, 3, 5, 8, 13];

  for (let n = 0; n < 8; n++) {
    it(`computes fib(${n}) = ${fibValues[n]}`, async () => {
      const ctx = createTestContext({ isSync: false });

      const trueBranch = testOperation(
        [],
        [createStatement({ data: testReference("n", "n-ref-true") })]
      );

      const falseBranch = testOperation(
        [],
        [
          createStatement({ data: testReference("n", "n-ref-false") }),
          createStatement({
            data: testReference("fib", "fib-ref"),
            operations: [
              testOperation(
                [
                  createStatement({
                    data: testReference("n", "n-ref-call1"),
                    operations: [
                      testOperation(
                        [createStatement({ data: testNumber(1) })],
                        [],
                        "subtract"
                      ),
                    ],
                  }),
                ],
                [],
                "call"
              ),
              testOperation(
                [
                  createStatement({
                    data: testReference("fib", "fib-ref-add"),
                    operations: [
                      testOperation(
                        [
                          createStatement({
                            data: testReference("n", "n-ref-call2"),
                            operations: [
                              testOperation(
                                [createStatement({ data: testNumber(2) })],
                                [],
                                "subtract"
                              ),
                            ],
                          }),
                        ],
                        [],
                        "call"
                      ),
                    ],
                  }),
                ],
                [],
                "add"
              ),
            ],
          }),
        ]
      );

      const bodyStmt = createStatement({
        data: testReference("n", "n-ref-body"),
        operations: [
          testOperation(
            [createStatement({ data: testNumber(1) })],
            [],
            "lessThanOrEqual"
          ),
          testOperation(
            [
              createStatement({ data: trueBranch }),
              createStatement({ data: falseBranch }),
            ],
            [],
            "thenElse"
          ),
        ],
      });

      const fibOpIData = createData({
        type: {
          kind: "operation",
          parameters: [{ name: "n", type: { kind: "number" } }],
          result: { kind: "number" },
        },
        value: {
          parameters: [numberStatement(0, "n")],
          statements: [bodyStmt],
          name: "fib",
        },
      });

      ctx.variables.set("fib", { data: fibOpIData });

      const fibOpItem = operationToListItem(fibOpIData, "fib");

      const result = await executeOperation(fibOpItem, testNumber(n), [], ctx);

      expect(result.type.kind).toBe("number");
      expect(result.value).toBe(fibValues[n]);
    });
  }

  for (let n = 0; n < 8; n++) {
    it(`computes fib(${n}) = ${fibValues[n]} with memoization`, async () => {
      const ctx = createTestContext({
        isSync: false,
        operationCache: new Map(),
      });

      const trueBranch = testOperation(
        [],
        [createStatement({ data: testReference("n", "n-ref-true-m") })]
      );

      const falseBranch = testOperation(
        [],
        [
          createStatement({ data: testReference("n", "n-ref-false-m") }),
          createStatement({
            data: testReference("fib", "fib-ref-m"),
            operations: [
              testOperation(
                [
                  createStatement({
                    data: testReference("n", "n-ref-call1-m"),
                    operations: [
                      testOperation(
                        [createStatement({ data: testNumber(1) })],
                        [],
                        "subtract"
                      ),
                    ],
                  }),
                ],
                [],
                "call"
              ),
              testOperation(
                [
                  createStatement({
                    data: testReference("fib", "fib-ref-add-m"),
                    operations: [
                      testOperation(
                        [
                          createStatement({
                            data: testReference("n", "n-ref-call2-m"),
                            operations: [
                              testOperation(
                                [createStatement({ data: testNumber(2) })],
                                [],
                                "subtract"
                              ),
                            ],
                          }),
                        ],
                        [],
                        "call"
                      ),
                    ],
                  }),
                ],
                [],
                "add"
              ),
            ],
          }),
        ]
      );

      const bodyStmt = createStatement({
        data: testReference("n", "n-ref-body-m"),
        operations: [
          testOperation(
            [createStatement({ data: testNumber(1) })],
            [],
            "lessThanOrEqual"
          ),
          testOperation(
            [
              createStatement({ data: trueBranch }),
              createStatement({ data: falseBranch }),
            ],
            [],
            "thenElse"
          ),
        ],
      });

      const fibOpIData = createData({
        type: {
          kind: "operation",
          parameters: [{ name: "n", type: { kind: "number" } }],
          result: { kind: "number" },
        },
        value: {
          parameters: [numberStatement(0, "n")],
          statements: [bodyStmt],
          name: "fib",
        },
      });

      ctx.variables.set("fib", { data: fibOpIData });

      const fibOpItem = operationToListItem(fibOpIData, "fib");

      const result = await executeOperation(fibOpItem, testNumber(n), [], ctx);

      expect(result.type.kind).toBe("number");
      expect(result.value).toBe(fibValues[n]);
    });
  }
});

describe("statement-level return control flow", () => {
  it("returns early from operation body", async () => {
    const ctx = createTestContext({ isSync: false });
    const unreachable = stringStatement("unreachable");
    const stmts = [
      stringStatement("first", "a"),
      createStatement({
        data: testString("early"),
        controlFlow: "return",
      }),
      unreachable,
    ];
    const op: OperationListItem = {
      name: "retOp",
      parameters: [],
      statements: stmts,
    };
    const result = await executeOperation(op, testUndefined(), [], ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("early");
    expect(ctx.getContext(unreachable.id).skipExecution?.kind).toBe(
      "unreachable"
    );
  });

  it("returns early from operation body (sync)", () => {
    const ctx = createTestContext();
    const unreachable = stringStatement("unreachable");
    const stmts = [
      stringStatement("first", "a"),
      createStatement({
        data: testString("early"),
        controlFlow: "return",
      }),
      unreachable,
    ];
    const op: OperationListItem = {
      name: "retOpSync",
      parameters: [],
      statements: stmts,
    };
    const result = executeOperationSync(op, testUndefined(), [], ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("early");
    expect(ctx.getContext(unreachable.id).skipExecution?.kind).toBe(
      "unreachable"
    );
  });

  it("return statement with chained operations returns the final piped value", async () => {
    const ctx = createTestContext({ isSync: false });
    const stmts = [
      createStatement({
        data: testString("hello"),
        operations: [
          createData({
            type: {
              kind: "operation",
              parameters: [{ type: { kind: "string" } }],
              result: { kind: "number" },
            },
            value: { name: "length", parameters: [], statements: [] },
          }),
        ],
        controlFlow: "return",
      }),
    ];
    const retOp: OperationListItem = {
      name: "chainedReturn",
      parameters: [],
      statements: stmts,
    };
    const result = await executeOperation(retOp, testUndefined(), [], ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(5);
  });
});

describe("expression condition execution", () => {
  it("executes true branch expression", async () => {
    const ctx = createTestContext({ isSync: false });
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("yes");
  });

  it("executes false branch expression", async () => {
    const ctx = createTestContext({ isSync: false });
    const condData = testCondition(
      booleanStatement(false),
      [stringStatement("yes")],
      [stringStatement("no")]
    );
    const stmt = createStatement({ data: condData });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("no");
  });

  it("executes expression condition synchronously", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(false),
      [numberStatement(42)],
      [numberStatement(99)]
    );
    const stmt = createStatement({ data: condData });
    const result = executeStatementSync(stmt, ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(99);
  });
});

describe("block condition execution", () => {
  it("executes multiple statements in true branch", async () => {
    const ctx = createTestContext({ isSync: false });
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("a"), numberStatement(42)],
      [stringStatement("b")]
    );
    const stmt = createStatement({ data: condData });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(42);
  });

  it("executes multiple statements in false branch", async () => {
    const ctx = createTestContext({ isSync: false });
    const condData = testCondition(
      booleanStatement(false),
      [stringStatement("a")],
      [stringStatement("b"), numberStatement(99)]
    );
    const stmt = createStatement({ data: condData });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(99);
  });

  it("branch-local variables are scoped inside branch only", async () => {
    const ctx = createTestContext({ isSync: false });
    const condData = testCondition(
      booleanStatement(true),
      [stringStatement("val", "inner")],
      [stringStatement("unused")]
    );
    const stmt = createStatement({ data: condData });
    const result = await executeStatement(stmt, ctx);
    expect(result.value).toBe("val");
  });

  it("outer variables are visible inside branch", async () => {
    const ctx = createTestContext({ isSync: false });
    ctx.variables.set("x", { data: testNumber(42) });
    const condData = testCondition(
      booleanStatement(true),
      [createStatement({ data: testReference("x", "ref1") })],
      [stringStatement("unused")]
    );
    const stmt = createStatement({ data: condData });
    const result = await executeStatement(stmt, ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(42);
  });

  it("block condition executes synchronously", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      [numberStatement(10), numberStatement(20)],
      [numberStatement(0)]
    );
    const stmt = createStatement({ data: condData });
    const result = executeStatementSync(stmt, ctx);
    expect(result.value).toBe(20);
  });
});

describe("return inside block condition", () => {
  it("return in true branch exits enclosing operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const skippedInBranch = stringStatement("after-return");
    const skippedAfterCondition = stringStatement("unreachable");
    const stmts = [
      stringStatement("first"),
      createStatement({
        data: testCondition(
          booleanStatement(true),
          [
            createStatement({
              data: testString("early"),
              controlFlow: "return",
            }),
            skippedInBranch,
          ],
          [stringStatement("no")]
        ),
      }),
      skippedAfterCondition,
    ];
    const op: OperationListItem = {
      name: "blockRetOp",
      parameters: [],
      statements: stmts,
    };
    const result = await executeOperation(op, testUndefined(), [], ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("early");
    expect(ctx.getContext(skippedInBranch.id).skipExecution?.kind).toBe(
      "unreachable"
    );
    expect(ctx.getContext(skippedAfterCondition.id).skipExecution?.kind).toBe(
      "unreachable"
    );
  });

  it("return in false branch exits enclosing operation (sync)", () => {
    const ctx = createTestContext();
    const stmts = [
      stringStatement("first"),
      createStatement({
        data: testCondition(
          booleanStatement(false),
          [stringStatement("no")],
          [
            createStatement({
              data: testString("falseRet"),
              controlFlow: "return",
            }),
          ]
        ),
      }),
      stringStatement("unreachable"),
    ];
    const op: OperationListItem = {
      name: "blockFRetOp",
      parameters: [],
      statements: stmts,
    };
    const result = executeOperationSync(op, testUndefined(), [], ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("falseRet");
  });

  it("skipped branch return does not affect execution", async () => {
    const ctx = createTestContext({ isSync: false });
    const stmts = [
      createStatement({
        data: testCondition(
          booleanStatement(true),
          [numberStatement(42)],
          [
            createStatement({
              data: testString("never"),
              controlFlow: "return",
            }),
          ]
        ),
      }),
      stringStatement("reached"),
    ];
    const op: OperationListItem = {
      name: "skipRetOp",
      parameters: [],
      statements: stmts,
    };
    const result = await executeOperation(op, testUndefined(), [], ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("reached");
  });
});

describe("return stays local in callbacks", () => {
  it("return inside and callback does not exit outer operation", async () => {
    const ctx = createTestContext({ isSync: false });
    const body = testOperation(
      [],
      [createStatement({ data: testString("ret"), controlFlow: "return" })]
    );
    const stmts = [
      createStatement({
        data: testBoolean(true),
        operations: [
          createData({
            id: "and-call",
            type: {
              kind: "operation",
              parameters: [
                { type: { kind: "boolean" } },
                {
                  type: {
                    kind: "operation",
                    parameters: [],
                    result: { kind: "string" },
                  },
                },
              ],
              result: { kind: "boolean" },
            },
            value: {
              name: "and",
              parameters: [createStatement({ data: body })],
              statements: [],
            },
          }),
        ],
      }),
      stringStatement("still-reached"),
    ];
    const op: OperationListItem = {
      name: "callbackRetOp",
      parameters: [],
      statements: stmts,
    };
    const result = await executeOperation(op, testUndefined(), [], ctx);
    expect(result.value).toBe("still-reached");
  });
});

describe("cached instance preservation across re-executions", () => {
  it("resolves await from cached Promise when instances are seeded from prior cache", async () => {
    // Create a resolved Promise simulating fetch's return value
    const response = new Response("ok");
    const promise = Promise.resolve(response);

    // Build instance data matching what a cached fetch would store
    const instanceId = "cached-promise-id";
    const instanceType: InstanceDataType = {
      kind: "instance",
      className: "Promise",
      constructorArgs: [],
    };
    const promiseData = createData({
      type: instanceType,
      value: {
        className: "Promise",
        instanceId,
        constructorArgs: [],
      },
    });

    // First context: stores the cached fetch result
    const baseCtx = createTestContext({ isSync: false });
    baseCtx.setResult(instanceId, {
      data: promiseData,
      shouldCacheResult: true,
    });
    baseCtx.setInstance(instanceId, {
      instance: promise,
      type: instanceType,
    });

    // Create a "fresh" outer context that seeds instances from the cached result
    // (mimicking the Project.tsx fix)
    const outerResults = new Map<
      string,
      { data?: IData; shouldCacheResult?: boolean }
    >();
    const outerInstances = new Map<
      string,
      NonNullable<ReturnType<Context["getInstance"]>>
    >();

    outerResults.set(instanceId, {
      data: promiseData,
      shouldCacheResult: true,
    });
    outerInstances.set(instanceId, {
      instance: promise,
      type: instanceType,
    });

    const outerCtx: Context = {
      ...baseCtx,
      getResult: (id) => outerResults.get(id) ?? baseCtx.getResult(id),
      setResult: (id, result) => outerResults.set(id, result),
      getInstance: (id) => outerInstances.get(id) ?? baseCtx.getInstance(id),
      setInstance: (id, inst) => outerInstances.set(id, inst),
    };

    // Build await operation chained on the cached Promise data
    const awaitOp = createData({
      id: "await-op",
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "Promise",
              constructorArgs: [],
            },
          },
        ],
        result: { kind: "unknown" },
      },
      value: { name: "await", parameters: [], statements: [] },
    });

    const stmt = createStatement({
      data: promiseData,
      operations: [awaitOp],
    });

    const result = await executeStatement(stmt, outerCtx);

    // await should have resolved the Promise<Response> and created Response
    // instance data
    expect(result.type.kind).toBe("instance");
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("Response");
    }
  });
});
