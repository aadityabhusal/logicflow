import {
  IData,
  IStatement,
  DataType,
  StringType,
  NumberType,
  BooleanType,
  ArrayType,
  ObjectType,
  DictionaryType,
  OperationType,
  UnionType,
  ConditionType,
  ReferenceType,
  ErrorType,
  TupleType,
} from "@/lib/types";
import { Context } from "@/lib/execution/types";
import { createData, createStatement, createDefaultValue } from "@/lib/utils";
import {
  executeOperation,
  executeOperationSync,
  executeStatement,
  executeStatementSync,
} from "@/lib/execution/execution";

export function createTestContext(overrides?: Partial<Context>): Context {
  const results = new Map<
    string,
    { data?: IData; shouldCacheResult?: boolean }
  >();
  const contexts = new Map<string, Context>();
  const instances = new Map<
    string,
    {
      instance: InstanceType<new (...args: unknown[]) => unknown>;
      type: DataType;
    }
  >();

  const base: Context = {
    scopeId: "_root_",
    variables: new Map(),
    isSync: true,
    callDepth: 0,
    maxCallDepth: 7500,
    getResult: (id: string) => results.get(id),
    getInstance: (id: string) => instances.get(id),
    getContext: (id: string) => contexts.get(id) ?? base,
    setContext: (id: string, ctx: Context) => contexts.set(id, ctx),
    setResult: (
      id: string,
      result: { data?: IData; shouldCacheResult?: boolean }
    ) => {
      const current = results.get(id) || {};
      results.set(id, { ...current, ...result });
    },
    setInstance: (
      id: string,
      data: {
        instance: InstanceType<new (...args: unknown[]) => unknown>;
        type: DataType;
      }
    ) => instances.set(id, data),
    executeStatement,
    executeStatementSync,
    executeOperation,
    executeOperationSync,
  };

  return { ...base, ...overrides };
}

export function testString(value = ""): IData<StringType> {
  return createData({ type: { kind: "string" }, value });
}

export function testNumber(value = 0): IData<NumberType> {
  return createData({ type: { kind: "number" }, value });
}

export function testBoolean(value = false): IData<BooleanType> {
  return createData({ type: { kind: "boolean" }, value });
}

export function testUndefined(): IData<{ kind: "undefined" }> {
  return createData({ type: { kind: "undefined" } });
}

export function testArray(
  elements: IStatement[],
  elementType?: DataType
): IData<ArrayType> {
  return createData({
    type: { kind: "array", elementType: elementType ?? { kind: "unknown" } },
    value: elements,
  });
}

export function testTuple(elements: IStatement[]): IData<TupleType> {
  return createData({
    type: { kind: "tuple", elements: elements.map((e) => e.data.type) },
    value: elements,
  });
}

export function testObject(
  entries: Array<{ key: string; value: IStatement }>
): IData<ObjectType> {
  return createData({
    type: {
      kind: "object",
      properties: entries.map(({ key, value }) => ({
        key,
        value: value.data.type,
      })),
    },
    value: { entries },
  });
}

export function testDictionary(
  entries: Array<{ key: string; value: IStatement }>,
  elementType?: DataType
): IData<DictionaryType> {
  return createData({
    type: {
      kind: "dictionary",
      elementType: elementType ?? { kind: "unknown" },
    },
    value: { entries },
  });
}

export function testOperation(
  parameters: IStatement[] = [],
  statements: IStatement[] = [],
  name?: string
): IData<OperationType> {
  const opType: OperationType = {
    kind: "operation",
    parameters: parameters.map((p) => ({
      name: p.name,
      type: p.data.type,
      isOptional: p.isOptional,
      isRest: p.isRest,
    })),
    result:
      statements.length > 0
        ? statements[statements.length - 1].data.type
        : { kind: "undefined" },
  };
  return createData({
    type: opType,
    value: { parameters, statements, name },
  });
}

export function testCondition(
  condition: IStatement,
  trueBranch: IStatement,
  falseBranch: IStatement
): IData<ConditionType> {
  return createData({
    type: { kind: "condition", result: { kind: "unknown" } },
    value: { condition, true: trueBranch, false: falseBranch },
  });
}

export function testReference(name: string, id: string): IData<ReferenceType> {
  return createData({
    type: { kind: "reference", name },
    value: { name, id },
  });
}

export function testError(
  reason: string,
  errorType: ErrorType["errorType"] = "custom_error"
): IData<ErrorType> {
  return createData({
    type: { kind: "error", errorType },
    value: { reason },
  });
}

export function testUnion(
  types: DataType[],
  value?: unknown
): IData<UnionType> {
  const unionType: UnionType = { kind: "union", types };
  return createData({
    type: unionType,
    value: value ?? createDefaultValue(types[0] ?? { kind: "undefined" }),
  });
}

export function simpleStatement(
  type: DataType,
  value?: unknown,
  name?: string
): IStatement {
  return createStatement({
    name,
    data: createData({
      type,
      value: value ?? createDefaultValue(type),
    }),
  });
}

export function stringStatement(value = "", name?: string): IStatement {
  return simpleStatement({ kind: "string" }, value, name);
}

export function numberStatement(value = 0, name?: string): IStatement {
  return simpleStatement({ kind: "number" }, value, name);
}

export function booleanStatement(value = false, name?: string): IStatement {
  return simpleStatement({ kind: "boolean" }, value, name);
}

export function createTestProject(
  overrides?: Partial<
    Pick<
      import("@/lib/types").Project,
      "id" | "name" | "version" | "files" | "deployment" | "dependencies"
    >
  >
): import("@/lib/types").Project {
  return {
    id: "test-project",
    name: "Test Project",
    version: "1.0.0",
    createdAt: Date.now(),
    files: [],
    ...overrides,
  };
}

export function createTriggeredOperationFile(
  name: string
): import("@/lib/types").ProjectFile {
  return {
    id: `op-${name}`,
    name,
    type: "operation",
    createdAt: Date.now(),
    content: {
      type: { kind: "operation", parameters: [], result: { kind: "string" } },
      value: { parameters: [], statements: [] },
    },
    trigger: { type: "http" },
  };
}

export function createOperationFile(
  name: string,
  source?: import("@/lib/types").OperationSource
): import("@/lib/types").ProjectFile {
  return {
    id: `op-${name}`,
    name,
    type: "operation",
    createdAt: Date.now(),
    content: {
      type: { kind: "operation", parameters: [], result: { kind: "string" } },
      value: { parameters: [], statements: [], ...(source ? { source } : {}) },
    },
  };
}
