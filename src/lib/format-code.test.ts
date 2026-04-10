import { describe, it, expect } from "vitest";
import {
  generateData,
  generateOperation,
  createCodeGenContext,
} from "@/lib/format-code";
import { createData, createStatement } from "@/lib/utils";
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
    expect(result).toContain("new Error");
    expect(result).toContain("oops");
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

  it("generates undefined return for empty statements", () => {
    const ctx = createTestContext();
    const op = testOperation([], [], "emptyOp");
    const result = generateOperation(op, ctx);
    expect(result).toContain("return undefined");
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
    expect(result).toContain("R.pipeAsync");
  });

  it("generates with showResult option resolving values", () => {
    const ctx = createCodeGenContext(createTestContext(), { showResult: true });
    const stmt = stringStatement("hello");
    const result = generateData(stmt.data, ctx);
    expect(result).toBe('"hello"');
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
    expect(result).toContain("he");
  });

  it("generates string with newline", () => {
    const ctx = createCodeGenContext(createTestContext());
    const result = generateData(testString("hello\nworld"), ctx);
    expect(result).toContain("hello");
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

  it("generates condition data as JSON", () => {
    const ctx = createCodeGenContext(createTestContext());
    const cond = testCondition(
      booleanStatement(true),
      stringStatement("yes"),
      stringStatement("no")
    );
    const result = generateData(cond, ctx);
    expect(result).toContain("condition");
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
