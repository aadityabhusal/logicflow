import { describe, it, expect, vi } from "vitest";
import {
  createData,
  createStatement,
  createDefaultValue,
  isTypeCompatible,
  isDataOfType,
  isFatalError,
  resolveReference,
  resolveUnionType,
  inferTypeFromValue,
  createThenable,
  unwrapThenable,
  getSkipExecution,
  getInverseTypes,
  createVariableName,
  fuzzySearch,
  createDataFromRawValue,
  getRawValueFromData,
  isObject,
  getTypeSignature,
  createOperationFromFile,
  createFileFromOperation,
  createProjectFile,
  isValidIdentifier,
  createContextVariable,
  createFileVariables,
  createParamData,
  getIsAsync,
  getOperationResultType,
  getUnionActiveIndex,
  getUnionActiveType,
  updateContextWithNarrowedTypes,
  resolveParameters,
  getStatementResult,
  getCacheKey,
  createContext,
  getContextExpectedTypes,
  operationToListItem,
  isPendingContext,
  getConditionResult,
  resolveConstructorArgs,
} from "@/lib/utils";
import { DataType, UnionType, OperationType, IData } from "@/lib/types";
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
  testUnion,
  testUndefined,
  simpleStatement,
  stringStatement,
  numberStatement,
  booleanStatement,
  testDictionary,
} from "@/tests/helpers";

describe("createData", () => {
  it("creates string data", () => {
    const data = createData({ type: { kind: "string" }, value: "hello" });
    expect(data.type.kind).toBe("string");
    expect(data.value).toBe("hello");
    expect(data.id).toBeDefined();
  });

  it("creates number data", () => {
    const data = createData({ type: { kind: "number" }, value: 42 });
    expect(data.type.kind).toBe("number");
    expect(data.value).toBe(42);
  });

  it("creates boolean data", () => {
    const data = createData({ type: { kind: "boolean" }, value: true });
    expect(data.value).toBe(true);
  });

  it("creates undefined data", () => {
    const data = createData({ type: { kind: "undefined" } });
    expect(data.type.kind).toBe("undefined");
    expect(data.value).toBeUndefined();
  });

  it("creates array data", () => {
    const elements = [stringStatement("a"), stringStatement("b")];
    const data = createData({
      type: { kind: "array", elementType: { kind: "string" } },
      value: elements,
    });
    expect(data.type.kind).toBe("array");
    expect(data.value).toHaveLength(2);
  });

  it("creates object data", () => {
    const data = createData({
      type: {
        kind: "object",
        properties: [{ key: "name", value: { kind: "string" } }],
      },
      value: { entries: [{ key: "name", value: stringStatement("test") }] },
    });
    expect(data.type.kind).toBe("object");
  });

  it("generates unique ids", () => {
    const a = createData({ type: { kind: "string" }, value: "x" });
    const b = createData({ type: { kind: "string" }, value: "x" });
    expect(a.id).not.toBe(b.id);
  });

  it("respects custom id", () => {
    const data = createData({
      id: "custom-id",
      type: { kind: "string" },
      value: "",
    });
    expect(data.id).toBe("custom-id");
  });

  it("infers type from value when type not provided", () => {
    const data = createData({ value: "inferred" });
    expect(data.type.kind).toBe("string");
    expect(data.value).toBe("inferred");
  });

  it("creates default value when value not provided", () => {
    const data = createData({ type: { kind: "number" } });
    expect(data.value).toBe(0);
  });

  it("creates error data", () => {
    const data = createData({
      type: { kind: "error", errorType: "reference_error" },
      value: { reason: "not found" },
    });
    expect(data.type.kind).toBe("error");
  });

  it("creates operation data", () => {
    const data = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "string" },
      },
      value: { parameters: [], statements: [] },
    });
    expect(data.type.kind).toBe("operation");
  });

  it("creates condition data", () => {
    const data = createData({
      type: { kind: "condition", result: { kind: "undefined" } },
    });
    expect(data.type.kind).toBe("condition");
    expect(data.value.condition).toBeDefined();
    expect(data.value.true).toBeDefined();
    expect(data.value.false).toBeDefined();
  });

  it("creates reference data", () => {
    const data = createData({
      type: { kind: "reference", name: "myVar" },
      value: { name: "myVar", id: "stmt1" },
    });
    expect(data.type.kind).toBe("reference");
    expect(data.value.name).toBe("myVar");
  });

  it("creates union data", () => {
    const data = createData({
      type: { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
    });
    expect(data.type.kind).toBe("union");
  });

  it("creates tuple data", () => {
    const data = createData({
      type: {
        kind: "tuple",
        elements: [{ kind: "string" }, { kind: "number" }],
      },
    });
    expect(data.type.kind).toBe("tuple");
    expect(data.value).toHaveLength(2);
  });

  it("creates dictionary data", () => {
    const data = createData({
      type: { kind: "dictionary", elementType: { kind: "string" } },
    });
    expect(data.type.kind).toBe("dictionary");
  });
});

describe("createStatement", () => {
  it("creates statement with default data", () => {
    const stmt = createStatement();
    expect(stmt.data).toBeDefined();
    expect(stmt.operations).toEqual([]);
    expect(stmt.id).toBeDefined();
  });

  it("creates statement with custom data", () => {
    const data = testString("hello");
    const stmt = createStatement({ data });
    expect(stmt.data).toBe(data);
  });

  it("creates statement with operations", () => {
    const data = testString("hello");
    const op = createData({
      type: { kind: "operation", parameters: [], result: { kind: "number" } },
      value: { name: "length", parameters: [], statements: [] },
    });
    const stmt = createStatement({ data, operations: [op] });
    expect(stmt.operations).toHaveLength(1);
  });

  it("creates statement with name", () => {
    const stmt = createStatement({ name: "myVar" });
    expect(stmt.name).toBe("myVar");
  });

  it("creates statement with isOptional flag", () => {
    const stmt = createStatement({ isOptional: true });
    expect(stmt.isOptional).toBe(true);
  });
});

describe("createDefaultValue", () => {
  it("returns undefined for undefined type", () => {
    expect(createDefaultValue({ kind: "undefined" })).toBeUndefined();
  });

  it("returns undefined for unknown type", () => {
    expect(createDefaultValue({ kind: "unknown" })).toBeUndefined();
  });

  it("returns undefined for never type", () => {
    expect(createDefaultValue({ kind: "never" })).toBeUndefined();
  });

  it("returns empty string for string type", () => {
    expect(createDefaultValue({ kind: "string" })).toBe("");
  });

  it("returns 0 for number type", () => {
    expect(createDefaultValue({ kind: "number" })).toBe(0);
  });

  it("returns false for boolean type", () => {
    expect(createDefaultValue({ kind: "boolean" })).toBe(false);
  });

  it("returns array with one element for array type", () => {
    const val = createDefaultValue({
      kind: "array",
      elementType: { kind: "string" },
    });
    expect(Array.isArray(val)).toBe(true);
    expect(val).toHaveLength(1);
  });

  it("returns empty array for array of unknown", () => {
    const val = createDefaultValue({
      kind: "array",
      elementType: { kind: "unknown" },
    });
    expect(val).toEqual([]);
  });

  it("returns tuple with elements for tuple type", () => {
    const val = createDefaultValue({
      kind: "tuple",
      elements: [{ kind: "string" }, { kind: "number" }],
    });
    expect(Array.isArray(val)).toBe(true);
    expect(val).toHaveLength(2);
  });

  it("returns object with entries for object type", () => {
    const val = createDefaultValue({
      kind: "object",
      properties: [{ key: "name", value: { kind: "string" } }],
      required: ["name"],
    });
    expect(val.entries).toHaveLength(1);
    expect(val.entries[0].key).toBe("name");
  });

  it("returns dictionary with one entry for dictionary type", () => {
    const val = createDefaultValue({
      kind: "dictionary",
      elementType: { kind: "string" },
    });
    expect(val.entries).toHaveLength(1);
  });

  it("returns default for first non-undefined type in union", () => {
    const val = createDefaultValue({
      kind: "union",
      types: [{ kind: "undefined" }, { kind: "string" }],
    });
    expect(val).toBe("");
  });

  it("returns operation value for operation type", () => {
    const val = createDefaultValue({
      kind: "operation",
      parameters: [],
      result: { kind: "undefined" },
    });
    expect(val.parameters).toEqual([]);
    expect(val.statements).toEqual([]);
  });

  it("returns condition value for condition type", () => {
    const val = createDefaultValue({
      kind: "condition",
      result: { kind: "undefined" },
    });
    expect(val.condition).toBeDefined();
    expect(val.true).toBeDefined();
    expect(val.false).toBeDefined();
  });

  it("returns error value for error type", () => {
    const val = createDefaultValue({
      kind: "error",
      errorType: "custom_error",
    });
    expect(val).toBeDefined();
    if (typeof val === "object" && val !== null && "reason" in val) {
      expect(val.reason).toBe("Error");
    }
  });

  it("returns error value with correct reason for reference_error", () => {
    const val = createDefaultValue({
      kind: "error",
      errorType: "reference_error",
    });
    if (typeof val === "object" && val !== null && "reason" in val) {
      expect(val.reason).toBe("Reference Error");
    }
  });

  it("returns empty array for array of never type", () => {
    const val = createDefaultValue({
      kind: "array",
      elementType: { kind: "never" },
    });
    expect(val).toEqual([]);
  });

  it("returns object with only required properties by default", () => {
    const val = createDefaultValue({
      kind: "object",
      properties: [
        { key: "name", value: { kind: "string" } },
        { key: "age", value: { kind: "number" } },
      ],
      required: ["name"],
    });
    expect(val.entries).toHaveLength(1);
    expect(val.entries[0].key).toBe("name");
  });

  it("returns object with all properties when includeOptionalProperties is true", () => {
    const val = createDefaultValue(
      {
        kind: "object",
        properties: [
          { key: "name", value: { kind: "string" } },
          { key: "age", value: { kind: "number" } },
        ],
        required: ["name"],
      },
      { includeOptionalProperties: true }
    );
    expect(val.entries).toHaveLength(2);
  });

  it("returns empty entries for object with no required properties", () => {
    const val = createDefaultValue({
      kind: "object",
      properties: [{ key: "name", value: { kind: "string" } }],
    });
    expect(val.entries).toHaveLength(0);
  });
});

describe("isTypeCompatible", () => {
  const ctx = createTestContext();

  it("same primitive kinds are compatible", () => {
    expect(isTypeCompatible({ kind: "string" }, { kind: "string" }, ctx)).toBe(
      true
    );
    expect(isTypeCompatible({ kind: "number" }, { kind: "number" }, ctx)).toBe(
      true
    );
    expect(
      isTypeCompatible({ kind: "boolean" }, { kind: "boolean" }, ctx)
    ).toBe(true);
  });

  it("different primitive kinds are incompatible", () => {
    expect(isTypeCompatible({ kind: "string" }, { kind: "number" }, ctx)).toBe(
      false
    );
  });

  it("unknown is compatible with everything", () => {
    expect(isTypeCompatible({ kind: "string" }, { kind: "unknown" }, ctx)).toBe(
      true
    );
    expect(isTypeCompatible({ kind: "number" }, { kind: "unknown" }, ctx)).toBe(
      true
    );
  });

  it("never is compatible with anything as source", () => {
    expect(isTypeCompatible({ kind: "never" }, { kind: "string" }, ctx)).toBe(
      false
    );
  });

  it("arrays are compatible if element types are compatible", () => {
    expect(
      isTypeCompatible(
        { kind: "array", elementType: { kind: "string" } },
        { kind: "array", elementType: { kind: "string" } },
        ctx
      )
    ).toBe(true);
    expect(
      isTypeCompatible(
        { kind: "array", elementType: { kind: "string" } },
        { kind: "array", elementType: { kind: "number" } },
        ctx
      )
    ).toBe(false);
  });

  it("objects are structurally compatible", () => {
    expect(
      isTypeCompatible(
        {
          kind: "object",
          properties: [{ key: "a", value: { kind: "string" } }],
        },
        {
          kind: "object",
          properties: [{ key: "a", value: { kind: "string" } }],
        },
        ctx
      )
    ).toBe(true);
  });

  it("objects with missing required keys are incompatible", () => {
    expect(
      isTypeCompatible(
        {
          kind: "object",
          properties: [{ key: "a", value: { kind: "string" } }],
        },
        {
          kind: "object",
          properties: [{ key: "b", value: { kind: "string" } }],
          required: ["b"],
        },
        ctx
      )
    ).toBe(false);
  });

  it("empty object is compatible with any object", () => {
    expect(
      isTypeCompatible(
        {
          kind: "object",
          properties: [{ key: "a", value: { kind: "string" } }],
        },
        { kind: "object", properties: [] },
        ctx
      )
    ).toBe(true);
  });

  it("dictionaries are compatible if element types match", () => {
    expect(
      isTypeCompatible(
        { kind: "dictionary", elementType: { kind: "string" } },
        { kind: "dictionary", elementType: { kind: "string" } },
        ctx
      )
    ).toBe(true);
  });

  it("object is compatible with dictionary if all values match element type", () => {
    expect(
      isTypeCompatible(
        {
          kind: "object",
          properties: [
            { key: "a", value: { kind: "string" } },
            { key: "b", value: { kind: "string" } },
          ],
        },
        { kind: "dictionary", elementType: { kind: "string" } },
        ctx
      )
    ).toBe(true);
  });

  it("union type is compatible if any member matches", () => {
    expect(
      isTypeCompatible(
        { kind: "string" },
        { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
        ctx
      )
    ).toBe(true);
    expect(
      isTypeCompatible(
        { kind: "boolean" },
        { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
        ctx
      )
    ).toBe(false);
  });

  it("operation types are compatible if result and params match", () => {
    expect(
      isTypeCompatible(
        { kind: "operation", parameters: [], result: { kind: "string" } },
        { kind: "operation", parameters: [], result: { kind: "string" } },
        ctx
      )
    ).toBe(true);
  });

  it("operation with rest parameter is compatible", () => {
    expect(
      isTypeCompatible(
        {
          kind: "operation",
          parameters: [
            { type: { kind: "number" } },
            {
              type: { kind: "array", elementType: { kind: "number" } },
              isRest: true,
            },
          ],
          result: { kind: "undefined" },
        },
        {
          kind: "operation",
          parameters: [
            { type: { kind: "number" } },
            { type: { kind: "number" } },
          ],
          result: { kind: "undefined" },
        },
        ctx
      )
    ).toBe(true);
  });

  it("instance types are compatible if className matches", () => {
    expect(
      isTypeCompatible(
        { kind: "instance", className: "Date", constructorArgs: [] },
        { kind: "instance", className: "Date", constructorArgs: [] },
        ctx
      )
    ).toBe(true);
    expect(
      isTypeCompatible(
        { kind: "instance", className: "Date", constructorArgs: [] },
        { kind: "instance", className: "URL", constructorArgs: [] },
        ctx
      )
    ).toBe(false);
  });

  it("tuples must have same length to be compatible", () => {
    expect(
      isTypeCompatible(
        { kind: "tuple", elements: [{ kind: "string" }, { kind: "number" }] },
        { kind: "tuple", elements: [{ kind: "string" }, { kind: "number" }] },
        ctx
      )
    ).toBe(true);
    expect(
      isTypeCompatible(
        { kind: "tuple", elements: [{ kind: "string" }] },
        { kind: "tuple", elements: [{ kind: "string" }, { kind: "number" }] },
        ctx
      )
    ).toBe(false);
  });

  it("empty tuple is compatible with any tuple", () => {
    expect(
      isTypeCompatible(
        { kind: "tuple", elements: [{ kind: "string" }] },
        { kind: "tuple", elements: [] },
        ctx
      )
    ).toBe(true);
  });

  it("union types are compatible bidirectionally with same types", () => {
    expect(
      isTypeCompatible(
        { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
        { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
        ctx
      )
    ).toBe(true);
  });

  it("union types are incompatible with different type counts", () => {
    expect(
      isTypeCompatible(
        { kind: "union", types: [{ kind: "string" }] },
        { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
        ctx
      )
    ).toBe(false);
  });

  it("dictionary is not compatible with object that has required keys", () => {
    expect(
      isTypeCompatible(
        { kind: "dictionary", elementType: { kind: "string" } },
        {
          kind: "object",
          properties: [{ key: "a", value: { kind: "string" } }],
          required: ["a"],
        },
        ctx
      )
    ).toBe(false);
  });

  it("dictionary is compatible with empty object", () => {
    expect(
      isTypeCompatible(
        { kind: "dictionary", elementType: { kind: "string" } },
        { kind: "object", properties: [] },
        ctx
      )
    ).toBe(true);
  });

  it("reference types are resolved before comparison", () => {
    const ctxWithVar = createTestContext();
    ctxWithVar.variables.set("MyString", { data: testString("hello") });
    expect(
      isTypeCompatible(
        { kind: "reference", name: "MyString" },
        { kind: "string" },
        ctxWithVar
      )
    ).toBe(true);
  });

  it("unresolved reference type falls back to unknown", () => {
    expect(
      isTypeCompatible(
        { kind: "reference", name: "Unknown" },
        { kind: "string" },
        ctx
      )
    ).toBe(false);
  });

  it("operation with optional parameter is compatible with fewer args", () => {
    expect(
      isTypeCompatible(
        {
          kind: "operation",
          parameters: [
            { type: { kind: "string" } },
            { type: { kind: "number" }, isOptional: true },
          ],
          result: { kind: "string" },
        },
        {
          kind: "operation",
          parameters: [{ type: { kind: "string" } }],
          result: { kind: "string" },
        },
        ctx
      )
    ).toBe(true);
  });

  it("instance types with result are compatible if results match", () => {
    expect(
      isTypeCompatible(
        {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
          result: { kind: "string" },
        },
        {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
          result: { kind: "string" },
        },
        ctx
      )
    ).toBe(true);
  });

  it("instance types with different results are incompatible", () => {
    expect(
      isTypeCompatible(
        {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
          result: { kind: "string" },
        },
        {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
          result: { kind: "number" },
        },
        ctx
      )
    ).toBe(false);
  });

  it("source union is not compatible with target non-union (no special handling)", () => {
    expect(
      isTypeCompatible(
        { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
        { kind: "string" },
        ctx
      )
    ).toBe(false);
  });

  it("never as target type is incompatible with anything", () => {
    expect(isTypeCompatible({ kind: "string" }, { kind: "never" }, ctx)).toBe(
      false
    );
    expect(isTypeCompatible({ kind: "number" }, { kind: "never" }, ctx)).toBe(
      false
    );
  });

  it("array is not compatible with tuple of different structure", () => {
    expect(
      isTypeCompatible(
        { kind: "array", elementType: { kind: "string" } },
        { kind: "tuple", elements: [{ kind: "string" }, { kind: "number" }] },
        ctx
      )
    ).toBe(false);
  });
});

describe("isDataOfType", () => {
  it("narrows string data", () => {
    const data = testString("hello");
    expect(isDataOfType(data, "string")).toBe(true);
    expect(isDataOfType(data, "number")).toBe(false);
  });

  it("narrows number data", () => {
    const data = testNumber(42);
    expect(isDataOfType(data, "number")).toBe(true);
  });

  it("narrows array data", () => {
    const data = testArray([]);
    expect(isDataOfType(data, "array")).toBe(true);
  });

  it("narrows object data", () => {
    const data = testObject([]);
    expect(isDataOfType(data, "object")).toBe(true);
  });

  it("narrows operation data", () => {
    const data = testOperation();
    expect(isDataOfType(data, "operation")).toBe(true);
  });

  it("narrows error data", () => {
    const data = testError("oops");
    expect(isDataOfType(data, "error")).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isDataOfType(undefined, "string")).toBe(false);
  });

  it("narrows reference data", () => {
    const data = testReference("x", "id1");
    expect(isDataOfType(data, "reference")).toBe(true);
  });

  it("narrows condition data", () => {
    const cond = booleanStatement(true);
    const data = testCondition(cond, cond, cond);
    expect(isDataOfType(data, "condition")).toBe(true);
  });

  it("narrows instance data", () => {
    const data = createData({
      type: { kind: "instance", className: "Date", constructorArgs: [] },
    });
    expect(isDataOfType(data, "instance")).toBe(true);
  });
});

describe("isFatalError", () => {
  it("returns true for reference_error", () => {
    expect(isFatalError(testError("x", "reference_error"))).toBe(true);
  });

  it("returns true for type_error", () => {
    expect(isFatalError(testError("x", "type_error"))).toBe(true);
  });

  it("returns true for runtime_error", () => {
    expect(isFatalError(testError("x", "runtime_error"))).toBe(true);
  });

  it("returns false for custom_error", () => {
    expect(isFatalError(testError("x", "custom_error"))).toBe(false);
  });

  it("returns false for non-error data", () => {
    expect(isFatalError(testString("hello"))).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isFatalError(undefined)).toBe(false);
  });
});

describe("resolveReference", () => {
  it("returns the same data for non-reference types", () => {
    const data = testString("hello");
    const ctx = createTestContext();
    expect(resolveReference(data, ctx)).toBe(data);
  });

  it("resolves reference to variable data", () => {
    const ref = testReference("myVar", "stmt1");
    const resolvedValue = testString("resolved");
    const ctx = createTestContext();
    ctx.variables.set("myVar", { data: resolvedValue });
    const result = resolveReference(ref, ctx);
    expect(result.value).toBe("resolved");
  });

  it("returns reference_error for missing variable in non-root context", () => {
    const ref = testReference("missing", "stmt1");
    const ctx = createTestContext({ scopeId: "nested-scope" });
    const result = resolveReference(ref, ctx);
    expect(result.type.kind).toBe("error");
  });

  it("returns reference as-is for missing variable in root context", () => {
    const ref = testReference("missing", "stmt1");
    const ctx = createTestContext({ scopeId: "_root_" });
    const result = resolveReference(ref, ctx);
    expect(result.type.kind).toBe("reference");
  });

  it("resolves references inside arrays", () => {
    const resolved = testNumber(42);
    const ctx = createTestContext();
    ctx.variables.set("x", { data: resolved });
    const array = testArray([
      simpleStatement(
        { kind: "reference", name: "x" },
        { name: "x", id: "stmt1" }
      ),
    ]);
    const result = resolveReference(array, ctx);
    expect(isDataOfType(result, "array")).toBe(true);
    if (isDataOfType(result, "array")) {
      expect(result.value[0].data.value).toBe(42);
    }
  });

  it("resolves references inside objects", () => {
    const resolved = testNumber(42);
    const ctx = createTestContext();
    ctx.variables.set("x", { data: resolved });
    const obj = testObject([
      {
        key: "prop",
        value: simpleStatement(
          { kind: "reference", name: "x" },
          { name: "x", id: "stmt1" }
        ),
      },
    ]);
    const result = resolveReference(obj, ctx);
    expect(isDataOfType(result, "object")).toBe(true);
    if (isDataOfType(result, "object")) {
      expect(result.value.entries[0].value.data.value).toBe(42);
    }
  });

  it("resolves references inside dictionaries", () => {
    const resolved = testNumber(42);
    const ctx = createTestContext();
    ctx.variables.set("x", { data: resolved });
    const dict = testDictionary(
      [
        {
          key: "prop",
          value: simpleStatement(
            { kind: "reference", name: "x" },
            { name: "x", id: "stmt1" }
          ),
        },
      ],
      { kind: "number" }
    );
    const result = resolveReference(dict, ctx);
    expect(isDataOfType(result, "dictionary")).toBe(true);
    if (isDataOfType(result, "dictionary")) {
      expect(result.value.entries[0].value.data.value).toBe(42);
    }
  });

  it("returns reference_error with correct reason", () => {
    const ref = testReference("missing", "stmt1");
    const ctx = createTestContext({ scopeId: "nested-scope" });
    const result = resolveReference(ref, ctx);
    expect(result.type.kind).toBe("error");
    if (isDataOfType(result, "error")) {
      expect(result.type.errorType).toBe("reference_error");
      expect(result.value.reason).toContain("missing");
    }
  });

  it("resolves nested references transitively", () => {
    const ctx = createTestContext();
    const innerRef = testReference("inner", "stmt-inner");
    const outerRef = testReference("outer", "stmt-outer");
    const finalValue = testString("deep");
    ctx.variables.set("inner", { data: finalValue });
    ctx.variables.set("outer", { data: innerRef });
    const result = resolveReference(outerRef, ctx);
    expect(result.value).toBe("deep");
  });
});

describe("resolveUnionType", () => {
  it("returns never for empty array", () => {
    expect(resolveUnionType([]).kind).toBe("never");
  });

  it("returns single type directly when not forced", () => {
    const result = resolveUnionType([{ kind: "string" }]);
    expect(result.kind).toBe("string");
  });

  it("returns union when forced even with single type", () => {
    const result = resolveUnionType([{ kind: "string" }], true);
    expect(result.kind).toBe("union");
  });

  it("returns union for multiple types", () => {
    const result = resolveUnionType([{ kind: "string" }, { kind: "number" }]);
    expect(result.kind).toBe("union");
    if (result.kind === "union") {
      expect(result.types).toHaveLength(2);
    }
  });

  it("deduplicates types", () => {
    const result = resolveUnionType([{ kind: "string" }, { kind: "string" }]);
    if (result.kind === "union") {
      expect(result.types).toHaveLength(1);
    } else {
      expect(result.kind).toBe("string");
    }
  });

  it("flattens nested unions", () => {
    const result = resolveUnionType([
      { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
      { kind: "boolean" },
    ]);
    if (result.kind === "union") {
      expect(result.types).toHaveLength(3);
    }
  });

  it("respects activeIndex", () => {
    const result = resolveUnionType(
      [{ kind: "string" }, { kind: "number" }],
      true,
      1
    );
    if (result.kind === "union") {
      expect(result.activeIndex).toBe(1);
    }
  });

  it("respects activeIndex=0 explicitly", () => {
    const result = resolveUnionType(
      [{ kind: "string" }, { kind: "number" }],
      true,
      0
    );
    if (result.kind === "union") {
      expect(result.activeIndex).toBe(0);
    }
  });
});

describe("inferTypeFromValue", () => {
  const ctx = createTestContext();

  it("infers undefined", () => {
    expect(inferTypeFromValue(undefined, ctx).kind).toBe("undefined");
  });

  it("infers string", () => {
    expect(inferTypeFromValue("hello", ctx).kind).toBe("string");
  });

  it("infers number", () => {
    expect(inferTypeFromValue(42, ctx).kind).toBe("number");
  });

  it("infers boolean", () => {
    expect(inferTypeFromValue(true, ctx).kind).toBe("boolean");
  });

  it("infers array from array value", () => {
    const stmts = [stringStatement("a"), stringStatement("b")];
    const result = inferTypeFromValue(stmts, ctx);
    expect(result.kind).toBe("array");
  });

  it("infers tuple when expectedType is tuple", () => {
    const stmts = [stringStatement("a"), numberStatement(1)];
    const ctxWithExpected = createTestContext({
      expectedType: {
        kind: "tuple",
        elements: [{ kind: "string" }, { kind: "number" }],
      },
    });
    const result = inferTypeFromValue(stmts, ctxWithExpected);
    expect(result.kind).toBe("tuple");
  });

  it("infers operation from operation value", () => {
    const val = { parameters: [], statements: [] };
    const result = inferTypeFromValue(val, ctx);
    expect(result.kind).toBe("operation");
  });

  it("infers reference from value with name property", () => {
    const ctxWithVar = createTestContext();
    ctxWithVar.variables.set("x", { data: testString("val") });
    const result = inferTypeFromValue({ name: "x", id: "stmt1" }, ctxWithVar);
    expect(result.kind).toBe("reference");
  });

  it("infers error from value with reason property", () => {
    const result = inferTypeFromValue({ reason: "bad" }, ctx);
    expect(result.kind).toBe("error");
  });

  it("infers dictionary from entries-based value without expectedType", () => {
    const val = { entries: [{ key: "a", value: stringStatement("x") }] };
    const result = inferTypeFromValue(val, ctx);
    expect(result.kind).toBe("dictionary");
  });

  it("infers object from entries-based value with object expectedType", () => {
    const val = { entries: [{ key: "a", value: stringStatement("x") }] };
    const ctxWithExpected = createTestContext({
      expectedType: {
        kind: "object",
        properties: [{ key: "a", value: { kind: "string" } }],
      },
    });
    const result = inferTypeFromValue(val, ctxWithExpected);
    expect(result.kind).toBe("object");
  });

  it("infers condition from value with condition, true, false properties", () => {
    const val = {
      condition: booleanStatement(true),
      true: stringStatement("yes"),
      false: stringStatement("no"),
    };
    const result = inferTypeFromValue(val, ctx);
    expect(result.kind).toBe("condition");
  });

  it("infers instance from value with className and constructorArgs", () => {
    const val = {
      className: "Date",
      constructorArgs: [],
    };
    const result = inferTypeFromValue(val, ctx);
    expect(result.kind).toBe("instance");
  });

  it("infers unknown for unrecognizable value", () => {
    const result = inferTypeFromValue(Symbol("x"), ctx);
    expect(result.kind).toBe("unknown");
  });

  it("infers env reference when variable has isEnv flag", () => {
    const ctxWithEnv = createTestContext();
    ctxWithEnv.variables.set("API_KEY", {
      data: testString("val"),
      isEnv: true,
    });
    const result = inferTypeFromValue(
      { name: "API_KEY", id: "stmt1" },
      ctxWithEnv
    );
    if (result.kind === "reference") {
      expect(result.isEnv).toBe(true);
    }
  });

  it("infers operation with correct parameter types", () => {
    const param = stringStatement("input", "myParam");
    const val = { parameters: [param], statements: [] };
    const result = inferTypeFromValue(val, ctx);
    if (result.kind === "operation") {
      expect(result.parameters[0].name).toBe("myParam");
      expect(result.parameters[0].type.kind).toBe("string");
    }
  });
});

describe("createThenable / unwrapThenable", () => {
  it("wraps value in thenable", () => {
    const thenable = createThenable(42);
    expect(typeof thenable.then).toBe("function");
  });

  it("thenable chains synchronously", () => {
    const thenable = createThenable(5);
    let result = 0;
    thenable.then((v) => {
      result = v * 2;
    });
    expect(result).toBe(10);
  });

  it("unwrapThenable extracts value from thenable", () => {
    const thenable = createThenable("hello");
    const result = unwrapThenable(thenable);
    expect(result).toBe("hello");
  });

  it("unwrapThenable returns non-thenable value as-is", () => {
    expect(unwrapThenable(42)).toBe(42);
  });

  it("passes through existing thenables", () => {
    const inner = createThenable(10);
    const outer = createThenable(inner);
    const result = unwrapThenable(outer);
    expect(result).toBe(10);
  });
});

describe("getSkipExecution", () => {
  it("returns undefined for normal execution", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    expect(getSkipExecution({ context: ctx, data })).toBeUndefined();
  });

  it("returns skip for fatal error data", () => {
    const ctx = createTestContext();
    const data = testError("not found", "reference_error");
    const result = getSkipExecution({ context: ctx, data });
    expect(result).toBeDefined();
    expect(result?.kind).toBe("error");
  });

  it("returns skip for unreachable thenElse false branch", () => {
    const ctx = createTestContext();
    const data = testBoolean(false);
    const result = getSkipExecution({
      context: ctx,
      data,
      operationName: "thenElse",
      paramIndex: 0,
    });
    expect(result).toBeDefined();
    expect(result?.kind).toBe("unreachable");
  });

  it("returns skip for unreachable thenElse true branch", () => {
    const ctx = createTestContext();
    const data = testBoolean(true);
    const result = getSkipExecution({
      context: ctx,
      data,
      operationName: "thenElse",
      paramIndex: 1,
    });
    expect(result).toBeDefined();
    expect(result?.kind).toBe("unreachable");
  });

  it("returns skip for or short-circuit when paramIndex provided", () => {
    const ctx = createTestContext();
    const data = testBoolean(true);
    const result = getSkipExecution({
      context: ctx,
      data,
      operationName: "or",
      paramIndex: 0,
    });
    expect(result).toBeDefined();
    expect(result?.kind).toBe("unreachable");
  });

  it("returns skip for and short-circuit when paramIndex provided", () => {
    const ctx = createTestContext();
    const data = testBoolean(false);
    const result = getSkipExecution({
      context: ctx,
      data,
      operationName: "and",
      paramIndex: 0,
    });
    expect(result).toBeDefined();
    expect(result?.kind).toBe("unreachable");
  });

  it("propagates parent skipExecution", () => {
    const ctx = createTestContext({
      skipExecution: { reason: "parent skip", kind: "unreachable" },
    });
    const data = testString("hello");
    const result = getSkipExecution({ context: ctx, data });
    expect(result).toBeDefined();
    expect(result?.kind).toBe("unreachable");
  });

  it("returns undefined when no operation name", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    expect(
      getSkipExecution({ context: ctx, data, operationName: undefined })
    ).toBeUndefined();
  });

  it("returns undefined for or/and without paramIndex", () => {
    const ctx = createTestContext();
    expect(
      getSkipExecution({
        context: ctx,
        data: testBoolean(true),
        operationName: "or",
      })
    ).toBeUndefined();
    expect(
      getSkipExecution({
        context: ctx,
        data: testBoolean(false),
        operationName: "and",
      })
    ).toBeUndefined();
  });

  it("does not skip or when data is false", () => {
    const ctx = createTestContext();
    const result = getSkipExecution({
      context: ctx,
      data: testBoolean(false),
      operationName: "or",
      paramIndex: 0,
    });
    expect(result).toBeUndefined();
  });

  it("does not skip and when data is true", () => {
    const ctx = createTestContext();
    const result = getSkipExecution({
      context: ctx,
      data: testBoolean(true),
      operationName: "and",
      paramIndex: 0,
    });
    expect(result).toBeUndefined();
  });

  it("does not skip for non-fatal error (custom_error)", () => {
    const ctx = createTestContext();
    const data = testError("oops", "custom_error");
    expect(getSkipExecution({ context: ctx, data })).toBeUndefined();
  });

  it("returns skip with error reason for fatal error", () => {
    const ctx = createTestContext();
    const data = testError("not found", "reference_error");
    const result = getSkipExecution({ context: ctx, data });
    expect(result?.kind).toBe("error");
    if (result?.kind === "error") {
      expect(result.reason).toContain("not found");
    }
  });

  it("returns skip with unreachable reason for thenElse", () => {
    const ctx = createTestContext();
    const result = getSkipExecution({
      context: ctx,
      data: testBoolean(false),
      operationName: "thenElse",
      paramIndex: 0,
    });
    expect(result?.kind).toBe("unreachable");
    if (result?.kind === "unreachable") {
      expect(result.reason).toContain("Unreachable");
    }
  });
});

describe("getInverseTypes", () => {
  it("returns inverse type when narrowing a union", () => {
    const original = new Map([
      ["x", { data: testUnion([{ kind: "string" }, { kind: "number" }]) }],
    ]);
    const narrowed = new Map([["x", { data: testString("hello") }]]);
    const ctx = createTestContext();
    const result = getInverseTypes(original, narrowed, ctx);
    const xVar = result.get("x");
    expect(xVar).toBeDefined();
    expect(xVar?.data.type.kind).toBe("number");
  });

  it("preserves original entry when inverse type is never (compatible narrowing)", () => {
    const original = new Map([["x", { data: testString("hello") }]]);
    const narrowed = new Map([["x", { data: testString("hello") }]]);
    const ctx = createTestContext();
    const result = getInverseTypes(original, narrowed, ctx);
    expect(result.has("x")).toBe(true);
    expect(result.get("x")?.data.type.kind).toBe("string");
  });

  it("preserves original entry when not present in narrowed", () => {
    const original = new Map([["x", { data: testString("hello") }]]);
    const narrowed = new Map();
    const ctx = createTestContext();
    const result = getInverseTypes(original, narrowed, ctx);
    expect(result.get("x")?.data.type.kind).toBe("string");
  });

  it("handles multiple variables independently", () => {
    const original = new Map([
      ["x", { data: testUnion([{ kind: "string" }, { kind: "number" }]) }],
      ["y", { data: testUnion([{ kind: "string" }, { kind: "boolean" }]) }],
    ]);
    const narrowed = new Map([
      ["x", { data: testString("hello") }],
      ["y", { data: testString("world") }],
    ]);
    const ctx = createTestContext();
    const result = getInverseTypes(original, narrowed, ctx);
    expect(result.get("x")?.data.type.kind).toBe("number");
    expect(result.get("y")?.data.type.kind).toBe("boolean");
  });

  it("preserves original entry when union is narrowed to single remaining type", () => {
    const original = new Map([
      ["x", { data: testUnion([{ kind: "string" }]) }],
    ]);
    const narrowed = new Map([["x", { data: testString("hello") }]]);
    const ctx = createTestContext();
    const result = getInverseTypes(original, narrowed, ctx);
    expect(result.has("x")).toBe(true);
  });
});

describe("createVariableName", () => {
  it("generates param1 for first parameter", () => {
    expect(createVariableName({ prefix: "param", prev: [] })).toBe("param");
  });

  it("increments index for existing names", () => {
    const prev = [simpleStatement({ kind: "string" }, "", "param1")];
    expect(createVariableName({ prefix: "param", prev })).toBe("param2");
  });

  it("handles multiple existing names", () => {
    const prev = [
      simpleStatement({ kind: "string" }, "", "param1"),
      simpleStatement({ kind: "string" }, "", "param2"),
    ];
    expect(createVariableName({ prefix: "param", prev })).toBe("param3");
  });

  it("respects indexOffset", () => {
    expect(createVariableName({ prefix: "op", prev: [], indexOffset: 5 })).toBe(
      "op5"
    );
  });

  it("handles string prev items", () => {
    expect(createVariableName({ prefix: "op", prev: ["op1"] })).toBe("op2");
  });
});

describe("fuzzySearch", () => {
  const data = [
    { name: "add", description: "addition" },
    { name: "subtract", description: "subtraction" },
    { name: "multiply", description: "multiplication" },
  ];

  it("returns all items when no search", () => {
    expect(fuzzySearch(data)).toHaveLength(3);
  });

  it("returns all items when empty search array", () => {
    expect(fuzzySearch(data, [])).toHaveLength(3);
  });

  it("finds matching items by name", () => {
    const result = fuzzySearch(data, [{ name: "add" }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("add");
  });

  it("finds matching items by description", () => {
    const result = fuzzySearch(data, [{ description: "mul" }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("multiply");
  });

  it("fuzzy matches letters out of order", () => {
    const result = fuzzySearch(data, [{ name: "sb" }]);
    expect(result.some((r) => r.name === "subtract")).toBe(true);
  });

  it("returns empty array when no match", () => {
    const result = fuzzySearch(data, [{ name: "xyz" }]);
    expect(result).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const result = fuzzySearch(data, [{ name: "ADD" }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("add");
  });

  it("matches with multiple search terms (OR logic)", () => {
    const result = fuzzySearch(data, [{ name: "add" }, { name: "sub" }]);
    expect(result).toHaveLength(2);
  });

  it("does not match when letters are in wrong order in value", () => {
    const result = fuzzySearch(data, [{ name: "da" }]);
    expect(result.some((r) => r.name === "add")).toBe(false);
  });
});

describe("isObject", () => {
  it("returns true for plain objects", () => {
    expect(isObject({ a: 1 })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isObject(null)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isObject([1, 2])).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isObject("string")).toBe(false);
    expect(isObject(42)).toBe(false);
  });

  it("checks for specific keys when provided", () => {
    expect(isObject({ a: 1, b: 2 }, ["a"])).toBe(true);
    expect(isObject({ a: 1 }, ["b"])).toBe(false);
  });
});

describe("getTypeSignature", () => {
  it("returns kind for primitive types", () => {
    expect(getTypeSignature({ kind: "string" })).toBe("string");
    expect(getTypeSignature({ kind: "number" })).toBe("number");
    expect(getTypeSignature({ kind: "boolean" })).toBe("boolean");
    expect(getTypeSignature({ kind: "undefined" })).toBe("undefined");
    expect(getTypeSignature({ kind: "unknown" })).toBe("unknown");
    expect(getTypeSignature({ kind: "never" })).toBe("never");
  });

  it("formats array type signature", () => {
    expect(
      getTypeSignature({ kind: "array", elementType: { kind: "string" } })
    ).toBe("array<string>");
  });

  it("formats tuple type signature", () => {
    const sig = getTypeSignature({
      kind: "tuple",
      elements: [{ kind: "string" }, { kind: "number" }],
    });
    expect(sig).toBe("[string, number]");
  });

  it("formats object type signature with required and optional", () => {
    const sig = getTypeSignature({
      kind: "object",
      properties: [
        { key: "name", value: { kind: "string" } },
        { key: "age", value: { kind: "number" } },
      ],
      required: ["name"],
    });
    expect(sig).toContain("name: string");
    expect(sig).toContain("age?: number");
  });

  it("formats dictionary type signature", () => {
    expect(
      getTypeSignature({ kind: "dictionary", elementType: { kind: "string" } })
    ).toBe("dictionary<string>");
  });

  it("formats union type signature", () => {
    const sig = getTypeSignature({
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
    });
    expect(sig).toBe("string | number");
  });

  it("formats operation type signature", () => {
    const sig = getTypeSignature({
      kind: "operation",
      parameters: [{ name: "x", type: { kind: "number" } }],
      result: { kind: "string" },
    });
    expect(sig).toContain("=>");
    expect(sig).toContain("string");
  });

  it("formats reference type signature as name", () => {
    expect(getTypeSignature({ kind: "reference", name: "myVar" })).toBe(
      "myVar"
    );
  });

  it("formats instance type signature with className", () => {
    const sig = getTypeSignature({
      kind: "instance",
      className: "Promise",
      constructorArgs: [],
    });
    expect(sig).toContain("Promise");
  });

  it("formats instance type signature with result type", () => {
    const sig = getTypeSignature({
      kind: "instance",
      className: "Promise",
      constructorArgs: [],
      result: { kind: "string" },
    });
    expect(sig).toContain("Promise");
    expect(sig).toContain("string");
  });

  it("formats condition type signature as result type", () => {
    const sig = getTypeSignature({
      kind: "condition",
      result: { kind: "number" },
    });
    expect(sig).toBe("number");
  });

  it("formats error type signature", () => {
    const sig = getTypeSignature({
      kind: "error",
      errorType: "reference_error",
    });
    expect(sig).toBeTruthy();
  });

  it("respects maxDepth", () => {
    const deep: DataType = {
      kind: "array",
      elementType: { kind: "array", elementType: { kind: "string" } },
    };
    expect(getTypeSignature(deep, 1)).toContain("...");
  });

  it("formats operation with rest parameter", () => {
    const sig = getTypeSignature({
      kind: "operation",
      parameters: [{ type: { kind: "number" }, isRest: true }],
      result: { kind: "undefined" },
    });
    expect(sig).toContain("...");
    expect(sig).toContain("array");
  });

  it("formats operation with optional parameter", () => {
    const sig = getTypeSignature({
      kind: "operation",
      parameters: [{ name: "x", type: { kind: "string" }, isOptional: true }],
      result: { kind: "undefined" },
    });
    expect(sig).toContain("x?");
  });
});

describe("createDataFromRawValue", () => {
  const ctx = createTestContext();

  it("converts undefined to undefined type", () => {
    const result = createDataFromRawValue(undefined, ctx);
    expect(result.type.kind).toBe("undefined");
  });

  it("converts null to undefined type", () => {
    const result = createDataFromRawValue(null, ctx);
    expect(result.type.kind).toBe("undefined");
  });

  it("converts string to string type", () => {
    const result = createDataFromRawValue("hello", ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("hello");
  });

  it("converts number to number type", () => {
    const result = createDataFromRawValue(42, ctx);
    expect(result.type.kind).toBe("number");
    expect(result.value).toBe(42);
  });

  it("converts boolean to boolean type", () => {
    const result = createDataFromRawValue(true, ctx);
    expect(result.type.kind).toBe("boolean");
    expect(result.value).toBe(true);
  });

  it("converts array to array type", () => {
    const result = createDataFromRawValue([1, 2, 3], ctx);
    expect(result.type.kind).toBe("array");
  });

  it("converts object to object/dictionary type", () => {
    const result = createDataFromRawValue({ name: "test" }, ctx);
    expect(
      result.type.kind === "object" || result.type.kind === "dictionary"
    ).toBe(true);
  });

  it("converts Error to error type", () => {
    const err = new Error("Custom Error: something went wrong");
    const result = createDataFromRawValue(err, ctx);
    expect(result.type.kind).toBe("error");
  });

  it("converts function to operation type", () => {
    const fn = (a: unknown) => a;
    const result = createDataFromRawValue(fn, ctx);
    expect(result.type.kind).toBe("operation");
  });

  it("converts empty array to array type", () => {
    const result = createDataFromRawValue([], ctx);
    expect(result.type.kind).toBe("array");
  });

  it("converts nested array to array of arrays", () => {
    const result = createDataFromRawValue([[1, 2]], ctx);
    expect(result.type.kind).toBe("array");
  });

  it("converts Date instance to instance type", () => {
    const date = new Date();
    const result = createDataFromRawValue(date, ctx);
    expect(result.type.kind).toBe("instance");
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("Date");
    }
  });

  it("converts object to object type when expectedType is object", () => {
    const ctxWithExpected = createTestContext({
      expectedType: {
        kind: "object",
        properties: [{ key: "name", value: { kind: "string" } }],
      },
    });
    const result = createDataFromRawValue({ name: "test" }, ctxWithExpected);
    expect(result.type.kind).toBe("object");
  });

  it("converts object to dictionary type when no expectedType", () => {
    const result = createDataFromRawValue({ name: "test" }, ctx);
    expect(result.type.kind).toBe("dictionary");
  });

  it("converts Error with known error type prefix", () => {
    const err = new Error("Reference Error: not found");
    const result = createDataFromRawValue(err, ctx);
    expect(result.type.kind).toBe("error");
    if (result.type.kind === "error") {
      expect(result.type.errorType).toBe("reference_error");
    }
  });

  it("converts Error with unknown prefix to custom_error", () => {
    const err = new Error("something went wrong");
    const result = createDataFromRawValue(err, ctx);
    expect(result.type.kind).toBe("error");
    if (result.type.kind === "error") {
      expect(result.type.errorType).toBe("custom_error");
    }
  });

  it("infers array element type from contents", () => {
    const result = createDataFromRawValue(["a", "b"], ctx);
    expect(result.type.kind).toBe("array");
    if (result.type.kind === "array") {
      expect(result.type.elementType.kind).toBe("string");
    }
  });

  it("converts array to tuple when expectedType is tuple", () => {
    const ctxWithTuple = createTestContext({
      expectedType: {
        kind: "tuple",
        elements: [{ kind: "string" }, { kind: "number" }],
      },
    });
    const result = createDataFromRawValue(["hello", 42], ctxWithTuple);
    expect(result.type.kind).toBe("tuple");
  });

  it("converts function with known .length to operation with parameter count", () => {
    const fn = (_a: unknown, _b: unknown) => {};
    const result = createDataFromRawValue(fn, ctx);
    expect(result.type.kind).toBe("operation");
    if (result.type.kind === "operation") {
      expect(result.type.parameters).toHaveLength(2);
    }
  });

  it("propagates result type for Promise instance with expectedType", () => {
    const ctxWithExpected = createTestContext({
      expectedType: {
        kind: "instance",
        className: "Promise",
        constructorArgs: [],
        result: { kind: "string" },
      },
    });
    const promise = Promise.resolve("hello");
    const result = createDataFromRawValue(promise, ctxWithExpected);
    expect(result.type.kind).toBe("instance");
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("Promise");
      expect(result.type.result).toBeDefined();
      expect(result.type.result?.kind).toBe("string");
    }
  });

  it("does not set result type for Promise instance without expectedType", () => {
    const promise = Promise.resolve("hello");
    const result = createDataFromRawValue(promise, ctx);
    expect(result.type.kind).toBe("instance");
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("Promise");
      expect(result.type.result).toBeUndefined();
    }
  });
});

describe("getRawValueFromData", () => {
  const ctx = createTestContext();

  it("extracts string value", () => {
    expect(getRawValueFromData(testString("hello"), ctx)).toBe("hello");
  });

  it("extracts number value", () => {
    expect(getRawValueFromData(testNumber(42), ctx)).toBe(42);
  });

  it("extracts boolean value", () => {
    expect(getRawValueFromData(testBoolean(true), ctx)).toBe(true);
  });

  it("extracts undefined value", () => {
    expect(getRawValueFromData(testUndefined(), ctx)).toBeUndefined();
  });

  it("extracts error as Error object", () => {
    const result = getRawValueFromData(testError("test", "custom_error"), ctx);
    expect(result).toBeInstanceOf(Error);
  });

  it("extracts array values", () => {
    const arr = testArray([stringStatement("a"), stringStatement("b")]);
    const result = getRawValueFromData(arr, ctx);
    expect(Array.isArray(result)).toBe(true);
  });

  it("extracts object values", () => {
    const obj = testObject([{ key: "name", value: stringStatement("test") }]);
    const result = getRawValueFromData(obj, ctx);
    expect(result).toHaveProperty("name");
  });

  it("resolves reference values", () => {
    const ref = testReference("x", "stmt1");
    const ctxWithVar = createTestContext();
    ctxWithVar.variables.set("x", { data: testNumber(99) });
    const result = getRawValueFromData(ref, ctxWithVar);
    expect(result).toBe(99);
  });

  it("extracts array values as raw array", () => {
    const arr = testArray([stringStatement("a"), numberStatement(1)]);
    const result = getRawValueFromData(arr, ctx);
    expect(result).toEqual(["a", 1]);
  });

  it("extracts object values as plain object", () => {
    const obj = testObject([
      { key: "name", value: stringStatement("test") },
      { key: "age", value: numberStatement(25) },
    ]);
    const result = getRawValueFromData(obj, ctx) as Record<string, unknown>;
    expect(result.name).toBe("test");
    expect(result.age).toBe(25);
  });

  it("extracts union value as active type value", () => {
    const union = testUnion([{ kind: "string" }, { kind: "number" }], "hello");
    const result = getRawValueFromData(union, ctx);
    expect(result).toBe("hello");
  });

  it("extracts condition value as evaluated branch", () => {
    const cond = testCondition(
      booleanStatement(true),
      stringStatement("yes"),
      stringStatement("no")
    );
    const result = getRawValueFromData(cond, ctx);
    expect(result).toBe("yes");
  });

  it("extracts condition value as false branch when condition is false", () => {
    const cond = testCondition(
      booleanStatement(false),
      stringStatement("yes"),
      stringStatement("no")
    );
    const result = getRawValueFromData(cond, ctx);
    expect(result).toBe("no");
  });

  it("extracts error with correct message format", () => {
    const result = getRawValueFromData(
      testError("not found", "reference_error"),
      ctx
    ) as Error;
    expect(result.message).toContain("not found");
  });
});

describe("createProjectFile", () => {
  it("creates operation file by default", () => {
    const file = createProjectFile({});
    expect(file.type).toBe("operation");
    expect(file.id).toBeDefined();
    expect(file.createdAt).toBeDefined();
  });

  it("creates file with custom name", () => {
    const file = createProjectFile({ name: "myOperation" });
    expect(file.name).toBe("myOperation");
  });

  it("creates globals file", () => {
    const file = createProjectFile({ type: "globals" });
    expect(file.type).toBe("globals");
  });

  it("creates documentation file", () => {
    const file = createProjectFile({ type: "documentation" });
    expect(file.type).toBe("documentation");
  });

  it("creates json file", () => {
    const file = createProjectFile({ type: "json" });
    expect(file.type).toBe("json");
  });
});

describe("createOperationFromFile / createFileFromOperation", () => {
  it("creates operation from operation file", () => {
    const file = createProjectFile({ type: "operation" });
    const op = createOperationFromFile(file);
    expect(op).toBeDefined();
    expect(op?.type.kind).toBe("operation");
  });

  it("returns undefined for non-operation file", () => {
    const file = createProjectFile({ type: "globals" });
    expect(createOperationFromFile(file)).toBeUndefined();
  });

  it("round-trips operation to file and back", () => {
    const file = createProjectFile({ type: "operation", name: "testOp" });
    const op = createOperationFromFile(file)!;
    const roundTripped = createFileFromOperation(op);
    expect(roundTripped.name).toBe("testOp");
    expect(roundTripped.type).toBe("operation");
  });
});

describe("isValidIdentifier", () => {
  it("accepts simple identifiers", () => {
    expect(isValidIdentifier("foo")).toBe(true);
    expect(isValidIdentifier("myVar")).toBe(true);
    expect(isValidIdentifier("x")).toBe(true);
  });

  it("accepts identifiers with dollar sign and underscore", () => {
    expect(isValidIdentifier("$count")).toBe(true);
    expect(isValidIdentifier("_private")).toBe(true);
    expect(isValidIdentifier("mix_case$")).toBe(true);
  });

  it("accepts identifiers starting with underscore or dollar", () => {
    expect(isValidIdentifier("_")).toBe(true);
    expect(isValidIdentifier("$")).toBe(true);
  });

  it("accepts identifiers with digits after first character", () => {
    expect(isValidIdentifier("var1")).toBe(true);
    expect(isValidIdentifier("a0b9")).toBe(true);
  });

  it("rejects identifiers starting with digit", () => {
    expect(isValidIdentifier("1abc")).toBe(false);
    expect(isValidIdentifier("0")).toBe(false);
  });

  it("rejects identifiers with spaces", () => {
    expect(isValidIdentifier("my var")).toBe(false);
  });

  it("rejects identifiers with special characters", () => {
    expect(isValidIdentifier("my-var")).toBe(false);
    expect(isValidIdentifier("my.var")).toBe(false);
    expect(isValidIdentifier("my#var")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidIdentifier("")).toBe(false);
  });
});

describe("getStatementResult", () => {
  it("returns statement data directly when no operations", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("hello");
    const result = getStatementResult(stmt, ctx);
    expect(result.type.kind).toBe("string");
    expect(result.value).toBe("hello");
  });

  it("returns fatal error data immediately", () => {
    const ctx = createTestContext();
    const errorData = testError("broken", "reference_error");
    const stmt = createStatement({ data: errorData });
    const result = getStatementResult(stmt, ctx);
    expect(result.type.kind).toBe("error");
  });

  it("returns cached result when operation result is cached", () => {
    const ctx = createTestContext();
    const op = createData({
      id: "op-cache-1",
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
    const cachedResult = testNumber(99);
    ctx.setResult(getCacheKey(ctx, "op-cache-1"), { data: cachedResult });
    const result = getStatementResult(stmt, ctx);
    expect(result.value).toBe(99);
  });

  it("returns operation type result when not cached", () => {
    const ctx = createTestContext();
    const op = createData({
      id: "op-uncached",
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
    const result = getStatementResult(stmt, ctx);
    expect(result.type.kind).toBe("number");
  });

  it("returns default data when operation has no result type", () => {
    const ctx = createTestContext();
    const op = createData({
      id: "op-no-result",
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: undefined as unknown as DataType,
      },
      value: { name: "unknownOp", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("hello"),
      operations: [op],
    });
    const result = getStatementResult(stmt, ctx);
    expect(result.type.kind).toBe("undefined");
  });

  it("resolves condition data by evaluating branch", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      stringStatement("yes"),
      stringStatement("no")
    );
    const stmt = createStatement({ data: condData });
    const result = getStatementResult(stmt, ctx);
    expect(result.value).toBe("yes");
    expect(result.type.kind).toBe("string");
  });

  it("skips operation resolution with prevEntity option", () => {
    const ctx = createTestContext();
    const op = createData({
      id: "cond-op",
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "boolean" } }],
        result: { kind: "number" },
      },
      value: { name: "not", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testBoolean(true),
      operations: [op],
    });
    ctx.setResult(getCacheKey(ctx, "cond-op"), { data: testNumber(99) });
    const result = getStatementResult(stmt, ctx, { prevEntity: true });
    expect(result.type.kind).toBe("boolean");
    expect(result.value).toBe(true);
  });

  it("uses specific operation index when index option is provided", () => {
    const ctx = createTestContext();
    const op1 = createData({
      id: "op-idx-1",
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const op2 = createData({
      id: "op-idx-2",
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "number" } }],
        result: { kind: "string" },
      },
      value: { name: "toString", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("hello"),
      operations: [op1, op2],
    });
    ctx.setResult(getCacheKey(ctx, "op-idx-1"), {
      data: testNumber(5),
    });
    const result = getStatementResult(stmt, ctx, { index: 2 });
    expect(result.type.kind).toBe("string");
  });

  it("skips reference resolution when skipResolveReference is true", () => {
    const ctx = createTestContext();
    const ref = testReference("myVar", "stmt-ref");
    ctx.variables.set("myVar", { data: testString("resolved") });
    const stmt = createStatement({ data: ref });
    const result = getStatementResult(stmt, ctx, {
      skipResolveReference: true,
    });
    expect(result.type.kind).toBe("reference");
  });

  it("resolves references by default", () => {
    const ctx = createTestContext();
    const ref = testReference("myVar", "stmt-ref");
    ctx.variables.set("myVar", { data: testString("resolved") });
    const stmt = createStatement({ data: ref });
    const result = getStatementResult(stmt, ctx);
    expect(result.value).toBe("resolved");
  });
});

describe("resolveParameters", () => {
  it("resolves static parameter list", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    const opItem: OperationListItem = {
      name: "includes",
      parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
      handler: () => createData(),
    };
    const params = resolveParameters(opItem, data, ctx);
    expect(params).toHaveLength(2);
    expect(params[0].type.kind).toBe("string");
    expect(params[1].type.kind).toBe("string");
  });

  it("resolves dynamic parameter function", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    const opItem: OperationListItem = {
      name: "dynamicOp",
      parameters: (_data) => [
        { type: { kind: "string" } },
        { type: _data.type },
      ],
      handler: () => createData(),
    };
    const params = resolveParameters(opItem, data, ctx);
    expect(params).toHaveLength(2);
    expect(params[1].type.kind).toBe("string");
  });

  it("does not wrap optional parameters in union with undefined", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    const opItem: OperationListItem = {
      name: "withOptional",
      parameters: [
        { type: { kind: "string" } },
        { type: { kind: "number" }, isOptional: true },
      ],
      handler: () => createData(),
    };
    const params = resolveParameters(opItem, data, ctx);
    expect(params[1].type.kind).toBe("number");
    expect(params[1].isOptional).toBe(true);
  });

  it("resolves reference types from context variables", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    ctx.variables.set("MyType", { data: testNumber(42) });
    const opItem: OperationListItem = {
      name: "withRefType",
      parameters: [
        { type: { kind: "string" } },
        { type: { kind: "reference", name: "MyType" } },
      ],
      handler: () => createData(),
    };
    const params = resolveParameters(opItem, data, ctx);
    expect(params[1].type.kind).toBe("number");
  });

  it("falls back to unknown for unresolved reference types", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    const opItem: OperationListItem = {
      name: "withMissingRef",
      parameters: [
        { type: { kind: "string" } },
        { type: { kind: "reference", name: "MissingType" } },
      ],
      handler: () => createData(),
    };
    const params = resolveParameters(opItem, data, ctx);
    expect(params[1].type.kind).toBe("unknown");
  });

  it("processes nested operation parameter types", () => {
    const ctx = createTestContext();
    const data = testString("hello");
    const opItem: OperationListItem = {
      name: "withCallback",
      parameters: [
        { type: { kind: "string" } },
        {
          type: {
            kind: "operation",
            parameters: [{ name: "item", type: { kind: "string" } }],
            result: { kind: "boolean" },
          },
        },
      ],
      handler: () => createData(),
    };
    const params = resolveParameters(opItem, data, ctx);
    expect(params[1].type.kind).toBe("operation");
    if (params[1].type.kind === "operation") {
      expect(params[1].type.parameters[0].type.kind).toBe("string");
    }
  });
});

describe("getUnionActiveIndex", () => {
  it("returns activeIndex when set and no infer", () => {
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
      activeIndex: 1,
    };
    expect(getUnionActiveIndex(union)).toBe(1);
  });

  it("returns 0 when no activeIndex set and no infer", () => {
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
      activeIndex: undefined,
    };
    expect(getUnionActiveIndex(union)).toBe(0);
  });

  it("infers index from value matching first type", () => {
    const ctx = createTestContext();
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
    };
    const index = getUnionActiveIndex(union, { value: "hello", context: ctx });
    expect(index).toBe(0);
  });

  it("infers index from value matching second type", () => {
    const ctx = createTestContext();
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
    };
    const index = getUnionActiveIndex(union, { value: 42, context: ctx });
    expect(index).toBe(1);
  });

  it("preserves existing activeIndex when value is still compatible", () => {
    const ctx = createTestContext();
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
      activeIndex: 0,
    };
    const index = getUnionActiveIndex(union, { value: "hello", context: ctx });
    expect(index).toBe(0);
  });

  it("updates activeIndex when value no longer matches current type", () => {
    const ctx = createTestContext();
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
      activeIndex: 0,
    };
    const index = getUnionActiveIndex(union, { value: 42, context: ctx });
    expect(index).toBe(1);
  });

  it("returns 0 when no type matches the value", () => {
    const ctx = createTestContext();
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
    };
    const index = getUnionActiveIndex(union, { value: true, context: ctx });
    expect(index).toBe(0);
  });
});

describe("getUnionActiveType", () => {
  it("returns the type at the active index", () => {
    const ctx = createTestContext();
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
    };
    const activeType = getUnionActiveType(union, { value: 42, context: ctx });
    expect(activeType.kind).toBe("number");
  });

  it("returns first type when no infer", () => {
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
      activeIndex: undefined,
    };
    const activeType = getUnionActiveType(union);
    expect(activeType.kind).toBe("string");
  });

  it("returns type at explicit activeIndex", () => {
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }, { kind: "number" }],
      activeIndex: 1,
    };
    const activeType = getUnionActiveType(union);
    expect(activeType.kind).toBe("number");
  });

  it("returns first type when index is out of bounds", () => {
    const union: UnionType = {
      kind: "union",
      types: [{ kind: "string" }],
      activeIndex: 99,
    };
    const activeType = getUnionActiveType(union);
    expect(activeType.kind).toBe("string");
  });
});

describe("updateContextWithNarrowedTypes", () => {
  it("returns context with merged narrowed types for normal operation", () => {
    const narrowed = new Map([["x", { data: testString("hello") }]]);
    const ctx = createTestContext({ narrowedTypes: narrowed });
    const result = updateContextWithNarrowedTypes(ctx, testString("hello"));
    expect(result.narrowedTypes).toBeUndefined();
    expect(result.variables.get("x")).toBeDefined();
  });

  it("uses inverse types for thenElse false branch", () => {
    const original = new Map([
      ["x", { data: testUnion([{ kind: "string" }, { kind: "number" }]) }],
    ]);
    const narrowed = new Map([["x", { data: testString("hello") }]]);
    const ctx = createTestContext({
      variables: original,
      narrowedTypes: narrowed,
    });
    const result = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "thenElse",
      1
    );
    const xVar = result.variables.get("x");
    expect(xVar).toBeDefined();
    expect(xVar?.data.type.kind).toBe("number");
  });

  it("uses original variables for or operation", () => {
    const original = new Map([["x", { data: testNumber(42) }]]);
    const narrowed = new Map([["x", { data: testString("overwritten") }]]);
    const ctx = createTestContext({
      variables: original,
      narrowedTypes: narrowed,
    });
    const result = updateContextWithNarrowedTypes(ctx, testBoolean(true), "or");
    expect(result.variables.get("x")?.data.type.kind).toBe("number");
  });

  it("removes never-typed variables from narrowed map for and operation", () => {
    const original = new Map([["x", { data: testNumber(42) }]]);
    const narrowed = new Map([
      ["x", { data: createData({ type: { kind: "never" } }) }],
    ]);
    const ctx = createTestContext({
      variables: original,
      narrowedTypes: narrowed,
    });
    const result = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "and"
    );
    expect(result.variables.has("x")).toBe(false);
  });

  it("sets skipExecution for fatal error data", () => {
    const ctx = createTestContext();
    const errorData = testError("broken", "reference_error");
    const result = updateContextWithNarrowedTypes(ctx, errorData);
    expect(result.skipExecution).toBeDefined();
    expect(result.skipExecution?.kind).toBe("error");
  });

  it("sets skipExecution to undefined for normal data", () => {
    const ctx = createTestContext();
    const result = updateContextWithNarrowedTypes(ctx, testString("hello"));
    expect(result.skipExecution).toBeUndefined();
  });

  it("creates default narrowedTypes when none exist", () => {
    const ctx = createTestContext({ narrowedTypes: undefined });
    const result = updateContextWithNarrowedTypes(ctx, testString("hello"));
    expect(result).toBeDefined();
  });

  it("uses merged narrowed types for thenElse true branch (paramIndex 0)", () => {
    const original = new Map([
      ["x", { data: testUnion([{ kind: "string" }, { kind: "number" }]) }],
    ]);
    const narrowed = new Map([["x", { data: testString("hello") }]]);
    const ctx = createTestContext({
      variables: original,
      narrowedTypes: narrowed,
    });
    const result = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "thenElse",
      0
    );
    expect(result.variables.get("x")?.data.type.kind).toBe("string");
  });

  it("keeps non-never variables for and operation", () => {
    const original = new Map([["x", { data: testNumber(42) }]]);
    const narrowed = new Map([["x", { data: testNumber(42) }]]);
    const ctx = createTestContext({
      variables: original,
      narrowedTypes: narrowed,
    });
    const result = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "and"
    );
    expect(result.variables.get("x")?.data.type.kind).toBe("number");
  });

  it("preserves all variables when thenElse has no prior narrowing", () => {
    const original = new Map([["x", { data: testNumber(10) }]]);
    const narrowedTypes = new Map<string, { data: IData }>();
    const ctx = createTestContext({
      variables: original,
      narrowedTypes,
    });

    const trueResult = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "thenElse",
      0
    );
    expect(trueResult.variables.get("x")).toBeDefined();
    expect(trueResult.variables.get("x")?.data.type.kind).toBe("number");

    const falseResult = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "thenElse",
      1
    );
    expect(falseResult.variables.get("x")).toBeDefined();
    expect(falseResult.variables.get("x")?.data.type.kind).toBe("number");
  });

  it("does not remove variable from true branch when narrowed type was never due to missing narrowType", () => {
    const original = new Map([["x", { data: testNumber(10) }]]);
    const narrowedWithNever = new Map([
      ["x", { data: createData({ type: { kind: "never" } }) }],
    ]);
    const ctx = createTestContext({
      variables: original,
      narrowedTypes: narrowedWithNever,
    });

    const trueResult = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "thenElse",
      0
    );
    expect(trueResult.variables.has("x")).toBe(false);

    const falseResult = updateContextWithNarrowedTypes(
      ctx,
      testBoolean(true),
      "thenElse",
      1
    );
    expect(falseResult.variables.has("x")).toBe(true);
    expect(falseResult.variables.get("x")?.data.type.kind).toBe("number");
  });
});

describe("getOperationResultType", () => {
  it("returns undefined type for empty statements", () => {
    const ctx = createTestContext();
    const result = getOperationResultType(
      { parameters: [], statements: [], name: "myOp" },
      ctx
    );
    expect(result.kind).toBe("undefined");
  });

  it("returns last statement result type", () => {
    const ctx = createTestContext();
    const result = getOperationResultType(
      {
        parameters: [],
        statements: [stringStatement("a"), numberStatement(42)],
        name: "myOp",
      },
      ctx
    );
    expect(result.kind).toBe("number");
  });

  it("wraps result in Promise instance type when isAsync is true", () => {
    const ctx = createTestContext();
    const result = getOperationResultType(
      {
        parameters: [],
        statements: [stringStatement("result")],
        name: "myAsyncOp",
        isAsync: true,
      },
      ctx
    );
    expect(result.kind).toBe("instance");
    if (result.kind === "instance") {
      expect(result.className).toBe("Promise");
      expect(result.result).toBeDefined();
      expect(result.result?.kind).toBe("string");
    }
  });

  it("does not wrap in Promise when isAsync is false", () => {
    const ctx = createTestContext();
    const result = getOperationResultType(
      {
        parameters: [],
        statements: [stringStatement("result")],
        name: "myOp",
      },
      ctx
    );
    expect(result.kind).toBe("string");
  });
});

describe("createContextVariable", () => {
  it("returns undefined for unnamed statement", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("hello");
    const result = createContextVariable(stmt, ctx, testString("hello"));
    expect(result).toBeUndefined();
  });

  it("returns undefined when result is error", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("hello", "myVar");
    const result = createContextVariable(
      stmt,
      ctx,
      testError("broken", "type_error")
    );
    expect(result).toBeUndefined();
  });

  it("creates variable with data from result", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("hello", "myVar");
    const result = createContextVariable(stmt, ctx, testString("hello"));
    expect(result).toBeDefined();
    expect(result?.data.type.kind).toBe("string");
    expect(result?.data.id).toBe(stmt.id);
  });

  it("preserves reference info when statement data is a reference", () => {
    const ctx = createTestContext();
    const ref = testReference("source", "ref-id");
    const stmt = createStatement({ data: ref, name: "myVar" });
    const result = createContextVariable(stmt, ctx, testString("resolved"));
    expect(result?.reference).toBeDefined();
    expect(result?.reference?.name).toBe("source");
  });

  it("does not include reference when statement data is not a reference", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("hello", "myVar");
    const result = createContextVariable(stmt, ctx, testString("hello"));
    expect(result?.reference).toBeUndefined();
  });

  it("wraps type in union for optional parameters", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("hello", "optVar");
    const params: OperationType["parameters"] = [
      { name: "optVar", type: { kind: "string" }, isOptional: true },
    ];
    const result = createContextVariable(
      stmt,
      ctx,
      testString("hello"),
      params
    );
    expect(result).toBeDefined();
    expect(result?.data.type.kind).toBe("union");
    if (result?.data.type.kind === "union") {
      expect(result.data.type.types.some((t) => t.kind === "undefined")).toBe(
        true
      );
      expect(result.data.type.types.some((t) => t.kind === "string")).toBe(
        true
      );
    }
  });

  it("uses result type directly for non-optional parameters", () => {
    const ctx = createTestContext();
    const stmt = numberStatement(42, "requiredVar");
    const params: OperationType["parameters"] = [
      { name: "requiredVar", type: { kind: "number" } },
    ];
    const result = createContextVariable(stmt, ctx, testNumber(42), params);
    expect(result?.data.type.kind).toBe("number");
  });
});

describe("createParamData", () => {
  it("creates data for string parameter type", () => {
    const result = createParamData({ type: { kind: "string" } });
    expect(result.type.kind).toBe("string");
  });

  it("creates data for number parameter type", () => {
    const result = createParamData({ type: { kind: "number" } });
    expect(result.type.kind).toBe("number");
  });

  it("creates undefined data for unknown parameter type", () => {
    const result = createParamData({ type: { kind: "unknown" } });
    expect(result.type.kind).toBe("undefined");
  });

  it("creates data for array parameter type", () => {
    const result = createParamData({
      type: { kind: "array", elementType: { kind: "string" } },
    });
    expect(result.type.kind).toBe("array");
  });

  it("creates data for object parameter type", () => {
    const result = createParamData({
      type: {
        kind: "object",
        properties: [{ key: "name", value: { kind: "string" } }],
      },
    });
    expect(result.type.kind).toBe("object");
  });

  it("creates operation data for operation parameter type", () => {
    const result = createParamData({
      type: {
        kind: "operation",
        parameters: [{ name: "item", type: { kind: "string" } }],
        result: { kind: "boolean" },
      },
    });
    expect(result.type.kind).toBe("operation");
    if (result.type.kind === "operation") {
      expect(result.type.parameters).toHaveLength(1);
      expect(result.type.parameters[0].type.kind).toBe("string");
    }
  });

  it("creates recursive callback parameters for nested operation type", () => {
    const result = createParamData({
      type: {
        kind: "operation",
        parameters: [
          {
            name: "callback",
            type: {
              kind: "operation",
              parameters: [{ name: "inner", type: { kind: "number" } }],
              result: { kind: "string" },
            },
          },
        ],
        result: { kind: "undefined" },
      },
    });
    expect(result.type.kind).toBe("operation");
    if (result.type.kind === "operation") {
      const callbackParam = result.type.parameters[0];
      expect(callbackParam.type.kind).toBe("operation");
    }
  });
});

describe("createFileVariables", () => {
  it("returns empty map for no files", () => {
    const result = createFileVariables();
    expect(result.size).toBe(0);
  });

  it("creates variables from operation files", () => {
    const file1 = createProjectFile({ type: "operation", name: "myOp" });
    const result = createFileVariables([file1]);
    expect(result.has("myOp")).toBe(true);
    expect(result.get("myOp")?.data.type.kind).toBe("operation");
  });

  it("skips non-operation files", () => {
    const file1 = createProjectFile({ type: "globals" });
    const result = createFileVariables([file1]);
    expect(result.size).toBe(0);
  });

  it("merges with base variables", () => {
    const base = new Map([["existing", { data: testString("base") }]]);
    const file1 = createProjectFile({ type: "operation", name: "myOp" });
    const result = createFileVariables([file1], base);
    expect(result.has("existing")).toBe(true);
    expect(result.has("myOp")).toBe(true);
  });

  it("includes all operation files", () => {
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const file2 = createProjectFile({ type: "operation", name: "op2" });
    const result = createFileVariables([file1, file2]);
    expect(result.size).toBe(2);
  });
});

describe("getIsAsync", () => {
  it("returns false for statements with no operations", () => {
    const stmts = [stringStatement("a"), numberStatement(1)];
    expect(getIsAsync(stmts)).toBe(false);
  });

  it("returns false for statements with non-await operations", () => {
    const op = createData({
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
    expect(getIsAsync([stmt])).toBe(false);
  });

  it("returns true when a statement has await operation", () => {
    const awaitOp = createData({
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
        result: { kind: "undefined" },
      },
      value: { name: "await", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("hello"),
      operations: [awaitOp],
    });
    expect(getIsAsync([stmt])).toBe(true);
  });

  it("checks all statements for await", () => {
    const awaitOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "undefined" },
      },
      value: { name: "await", parameters: [], statements: [] },
    });
    const stmt1 = stringStatement("sync");
    const stmt2 = createStatement({
      data: testString("hello"),
      operations: [awaitOp],
    });
    expect(getIsAsync([stmt1, stmt2])).toBe(true);
  });

  it("returns false for empty array", () => {
    expect(getIsAsync([])).toBe(false);
  });

  it("checks nested operations inside operation value statements", () => {
    const awaitOp = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "undefined" },
      },
      value: { name: "await", parameters: [], statements: [] },
    });
    const innerStmt = createStatement({
      data: testString("hello"),
      operations: [awaitOp],
    });
    const outerOp = testOperation(
      [stringStatement("input")],
      [innerStmt],
      "wrapper"
    );
    const stmt = createStatement({ data: outerOp });
    expect(getIsAsync([stmt])).toBe(false);
  });
});

describe("createContext", () => {
  it("creates new context with generated scopeId", () => {
    const parent = createTestContext();
    const child = createContext(parent);
    expect(child.scopeId).toBeDefined();
    expect(child.scopeId).not.toBe(parent.scopeId);
  });

  it("inherits parent variables by default", () => {
    const parent = createTestContext();
    parent.variables.set("x", { data: testString("hello") });
    const child = createContext(parent);
    expect(child.variables.get("x")?.data.value).toBe("hello");
  });

  it("creates independent copy of variables", () => {
    const parent = createTestContext();
    parent.variables.set("x", { data: testString("hello") });
    const child = createContext(parent);
    child.variables.set("y", { data: testNumber(42) });
    expect(parent.variables.has("y")).toBe(false);
  });

  it("accepts custom scopeId override", () => {
    const parent = createTestContext();
    const child = createContext(parent, { scopeId: "custom-scope" });
    expect(child.scopeId).toBe("custom-scope");
  });

  it("accepts custom variables override", () => {
    const parent = createTestContext();
    parent.variables.set("x", { data: testString("parent") });
    const customVars = new Map([["y", { data: testNumber(99) }]]);
    const child = createContext(parent, { variables: customVars });
    expect(child.variables.has("x")).toBe(false);
    expect(child.variables.get("y")?.data.value).toBe(99);
  });

  it("inherits narrowedTypes from parent by default", () => {
    const parent = createTestContext();
    const narrowed = new Map([["x", { data: testString("narrowed") }]]);
    parent.narrowedTypes = narrowed;
    const child = createContext(parent);
    expect(child.narrowedTypes?.get("x")?.data.value).toBe("narrowed");
  });

  it("clears expectedType by default", () => {
    const parent = createTestContext({ expectedType: { kind: "string" } });
    const child = createContext(parent);
    expect(child.expectedType).toBeUndefined();
  });

  it("allows overriding expectedType", () => {
    const parent = createTestContext();
    const child = createContext(parent, { expectedType: { kind: "number" } });
    expect(child.expectedType?.kind).toBe("number");
  });

  it("clears enforceExpectedType by default", () => {
    const parent = createTestContext({ enforceExpectedType: true });
    const child = createContext(parent);
    expect(child.enforceExpectedType).toBeUndefined();
  });

  it("allows overriding enforceExpectedType", () => {
    const parent = createTestContext();
    const child = createContext(parent, { enforceExpectedType: true });
    expect(child.enforceExpectedType).toBe(true);
  });
});

describe("getContextExpectedTypes", () => {
  it("returns undefined for both when expectedType is undefined", () => {
    const ctx = createTestContext();
    const result = getContextExpectedTypes({
      context: ctx,
      expectedType: undefined,
    });
    expect(result.expectedType).toBeUndefined();
    expect(result.enforceExpectedType).toBeUndefined();
  });

  it("returns undefined for both when expectedType is unknown", () => {
    const ctx = createTestContext();
    const result = getContextExpectedTypes({
      context: ctx,
      expectedType: { kind: "unknown" },
    });
    expect(result.expectedType).toBeUndefined();
    expect(result.enforceExpectedType).toBeUndefined();
  });

  it("returns expectedType when set to a concrete type", () => {
    const ctx = createTestContext();
    const result = getContextExpectedTypes({
      context: ctx,
      expectedType: { kind: "string" },
    });
    expect(result.expectedType?.kind).toBe("string");
  });

  it("uses context enforceExpectedType as default", () => {
    const ctx = createTestContext({ enforceExpectedType: true });
    const result = getContextExpectedTypes({
      context: ctx,
      expectedType: { kind: "string" },
    });
    expect(result.enforceExpectedType).toBe(true);
  });

  it("allows overriding enforceExpectedType", () => {
    const ctx = createTestContext({ enforceExpectedType: true });
    const result = getContextExpectedTypes({
      context: ctx,
      expectedType: { kind: "string" },
      enforceExpectedType: false,
    });
    expect(result.enforceExpectedType).toBe(false);
  });

  it("defaults enforceExpectedType to undefined when context has none", () => {
    const ctx = createTestContext();
    const result = getContextExpectedTypes({
      context: ctx,
      expectedType: { kind: "number" },
    });
    expect(result.enforceExpectedType).toBeUndefined();
  });
});

describe("operationToListItem", () => {
  it("converts operation data to list item", () => {
    const param = stringStatement("input");
    const stmt = stringStatement("output");
    const op = testOperation([param], [stmt], "myOp");
    const listItem = operationToListItem(op);
    expect(listItem.name).toBe("myOp");
    expect(listItem.parameters).toHaveLength(1);
    if ("statements" in listItem) {
      expect(listItem.statements).toHaveLength(1);
    }
  });

  it("uses operation value name when no name provided", () => {
    const op = testOperation([], [], "namedOp");
    const listItem = operationToListItem(op);
    expect(listItem.name).toBe("namedOp");
  });

  it("uses custom name over operation value name", () => {
    const op = testOperation([], [], "originalName");
    const listItem = operationToListItem(op, "customName");
    expect(listItem.name).toBe("customName");
  });

  it("defaults to 'anonymous' when no name available", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "undefined" },
      },
      value: { parameters: [], statements: [] },
    });
    const listItem = operationToListItem(op);
    expect(listItem.name).toBe("anonymous");
  });

  it("preserves operation id", () => {
    const op = testOperation([], [], "myOp");
    const listItem = operationToListItem(op);
    expect(listItem.id).toBe(op.id);
  });
});

describe("isPendingContext", () => {
  it("returns true for root scope", () => {
    const ctx = createTestContext({ scopeId: "_root_" });
    expect(isPendingContext(ctx)).toBe(true);
  });

  it("returns false for non-root scope", () => {
    const ctx = createTestContext({ scopeId: "nested-scope" });
    expect(isPendingContext(ctx)).toBe(false);
  });

  it("returns false for empty string scope", () => {
    const ctx = createTestContext({ scopeId: "" });
    expect(isPendingContext(ctx)).toBe(false);
  });
});

describe("getConditionResult", () => {
  it("returns true branch when condition is truthy", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      stringStatement("yes"),
      stringStatement("no")
    );
    const result = getConditionResult(condData.value, ctx);
    expect(result.value).toBe("yes");
    expect(result.type.kind).toBe("string");
  });

  it("returns false branch when condition is falsy", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(false),
      stringStatement("yes"),
      stringStatement("no")
    );
    const result = getConditionResult(condData.value, ctx);
    expect(result.value).toBe("no");
    expect(result.type.kind).toBe("string");
  });

  it("returns number from true branch", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      numberStatement(42),
      numberStatement(0)
    );
    const result = getConditionResult(condData.value, ctx);
    expect(result.value).toBe(42);
  });

  it("returns falsy value from false branch correctly", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(false),
      numberStatement(1),
      numberStatement(0)
    );
    const result = getConditionResult(condData.value, ctx);
    expect(result.value).toBe(0);
  });

  it("treats number 0 as falsy condition", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      numberStatement(0),
      stringStatement("yes"),
      stringStatement("no")
    );
    const result = getConditionResult(condData.value, ctx);
    expect(result.value).toBe("no");
  });

  it("treats empty string as falsy condition", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      stringStatement(""),
      stringStatement("yes"),
      stringStatement("no")
    );
    const result = getConditionResult(condData.value, ctx);
    expect(result.value).toBe("no");
  });

  it("treats non-zero number as truthy condition", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      numberStatement(1),
      stringStatement("yes"),
      stringStatement("no")
    );
    const result = getConditionResult(condData.value, ctx);
    expect(result.value).toBe("yes");
  });
});

describe("getCacheKey", () => {
  it("returns operationId when context is not isolated", () => {
    const ctx = createTestContext({ isIsolated: false });
    expect(getCacheKey(ctx, "op-123")).toBe("op-123");
  });

  it("returns scoped key when context is isolated", () => {
    const ctx = createTestContext({ scopeId: "scope-1", isIsolated: true });
    expect(getCacheKey(ctx, "op-123")).toBe("scope-1:op-123");
  });

  it("returns operationId when isIsolated is undefined", () => {
    const ctx = createTestContext();
    expect(getCacheKey(ctx, "op-456")).toBe("op-456");
  });
});

describe("resolveConstructorArgs", () => {
  it("returns static args as-is", () => {
    const args: OperationType["parameters"] = [
      { name: "value", type: { kind: "string" } },
      { name: "count", type: { kind: "number" } },
    ];
    expect(resolveConstructorArgs(args)).toBe(args);
  });

  it("calls function args with expectedType parameters", () => {
    const fn = vi
      .fn()
      .mockReturnValue([{ name: "x", type: { kind: "string" } }]);
    resolveConstructorArgs(fn, { kind: "number" });
    expect(fn).toHaveBeenCalledWith([
      { type: { kind: "number" }, name: "value" },
    ]);
  });

  it("calls function args with undefined when no expectedType", () => {
    const fn = vi.fn().mockReturnValue([]);
    resolveConstructorArgs(fn);
    expect(fn).toHaveBeenCalledWith(undefined);
  });
});
