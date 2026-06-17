import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  executeOperation,
  executeStatement,
  getFilteredOperations,
} from "@/lib/execution/execution";
import { coreOperations } from "@/lib/operations/built-in";
import { operations as rowguardOperations } from "@/lib/operations/rowguard";
import { operations as fakerOperations } from "@/lib/operations/faker";
import { operations as dateFnsOperations } from "@/lib/operations/date-fns";
import { operations as supabaseOperations } from "@/lib/operations/supabase";
import { operations as comfyuiOperations } from "@/lib/operations/comfyui";
import * as comfyuiSDK from "@saintno/comfyui-sdk";
import {
  createData,
  getRawValueFromData,
  isDataOfType,
  createDataFromRawValue,
  createStatement,
  createInstance,
} from "@/lib/utils";
import { Context, OperationListItem } from "@/lib/execution/types";
import { IData, InstanceDataType } from "../types";
import {
  createTestContext,
  testString,
  stringStatement,
  testBoolean,
  testOperation,
} from "@/tests/helpers";
import { syncPackageRegistry } from "@/lib/operations/built-in";

describe("Rowguard structural condition operations", () => {
  const findRgOp = (name: string) =>
    rowguardOperations.find((op) => op.name === name)!;

  it("auth.uid returns ContextValue instance", async () => {
    const op = findRgOp("auth.uid");
    const ctx = createTestContext();
    const result = await executeOperation(op, createData(), [], ctx);
    expect(result.type.kind).toBe("instance");
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("rowguard.ContextValue");
    }
  });

  it("session.get returns ContextValue instance", async () => {
    const op = findRgOp("session.get");
    const ctx = createTestContext();
    const result = await executeOperation(
      op,
      testString("org_id"),
      [stringStatement("uuid")],
      ctx
    );
    expect(result.type.kind).toBe("instance");
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("rowguard.ContextValue");
    }
  });

  it("auth.uid raw value has toSQL", async () => {
    const op = findRgOp("auth.uid");
    const ctx = createTestContext();
    const result = await executeOperation(op, createData(), [], ctx);
    const raw = getRawValueFromData(result, ctx);
    expect(typeof (raw as { toSQL?: () => string }).toSQL).toBe("function");
  });

  it("session.get raw value has key and sessionType", async () => {
    const op = findRgOp("session.get");
    const ctx = createTestContext();
    const result = await executeOperation(
      op,
      testString("org_id"),
      [stringStatement("uuid")],
      ctx
    );
    const raw = getRawValueFromData(result, ctx) as Record<string, unknown>;
    expect(raw.key).toBe("org_id");
    expect(raw.sessionType).toBe("uuid");
  });

  it("get after session.get accesses properties", async () => {
    const sessionOp = findRgOp("session.get");
    const ctx = createTestContext();
    const result = await executeOperation(
      sessionOp,
      testString("org_id"),
      [stringStatement("uuid")],
      ctx
    );
    const getOp = coreOperations.find((op) => op.name === "get")!;
    const getResult = await executeOperation(
      getOp,
      result,
      [stringStatement("key")],
      ctx
    );
    expect(getRawValueFromData(getResult, ctx)).toBe("org_id");
  });

  it("has after session.get checks property existence", async () => {
    const sessionOp = findRgOp("session.get");
    const ctx = createTestContext();
    const result = await executeOperation(
      sessionOp,
      testString("org_id"),
      [stringStatement("uuid")],
      ctx
    );
    const hasOp = coreOperations.find((op) => op.name === "has")!;
    const hasResult = await executeOperation(
      hasOp,
      result,
      [stringStatement("key")],
      ctx
    );
    expect(getRawValueFromData(hasResult, ctx)).toBe(true);
  });

  it("toSQL on ContextValue returns SQL string", async () => {
    const ctx = createTestContext();
    const authOp = findRgOp("auth.uid");
    const authResult = await executeOperation(authOp, createData(), [], ctx);
    const toSQLOps = rowguardOperations.filter((op) => op.name === "toSQL");
    const ctxValToSQLOp = toSQLOps.find((op) => {
      const params =
        typeof op.parameters === "function"
          ? op.parameters(createData())
          : op.parameters;
      const firstType = params[0]?.type;
      return (
        firstType &&
        firstType.kind === "instance" &&
        (firstType as InstanceDataType).className === "rowguard.ContextValue"
      );
    });
    expect(ctxValToSQLOp).toBeDefined();
    const sqlResult = await executeOperation(
      ctxValToSQLOp!,
      authResult,
      [],
      ctx
    );
    expect(getRawValueFromData(sqlResult, ctx)).toBe("auth.uid()");
  });
});

describe("faker operations", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "faker" }]);
  });

  function findFakerOp(name: string): OperationListItem {
    const op = fakerOperations.find((o) => o.name === name);
    if (!op) throw new Error(`Faker operation "${name}" not found`);
    return op;
  }

  it("firstName returns a non-empty string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("person.firstName");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
    const value = getRawValueFromData(result, ctx);
    expect(typeof value).toBe("string");
    expect((value as string).length).toBeGreaterThan(0);
  });

  it("uuid returns a UUID-formatted string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("string.uuid");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
    const value = getRawValueFromData(result, ctx) as string;
    expect(value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("number.int returns a number", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("number.int");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "number")).toBe(true);
  });

  it("company.name returns a non-empty string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("company.name");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
    const value = getRawValueFromData(result, ctx) as string;
    expect(value.length).toBeGreaterThan(0);
  });

  it("date.past returns a Date instance", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("date.past");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    const value = getRawValueFromData(result, ctx);
    expect(value).toBeInstanceOf(Date);
  });

  it("datatype.boolean returns a boolean", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("datatype.boolean");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "boolean")).toBe(true);
  });

  it("internet.ip returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("internet.ip");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("animal.dog returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("animal.dog");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("music.genre returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("music.genre");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("git.commitSha returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("git.commitSha");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("system.semver returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("system.semver");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("vehicle.vin returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("vehicle.vin");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("database.mongodbObjectId returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("database.mongodbObjectId");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("book.title returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("book.title");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("food.fruit returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("food.fruit");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("hacker.phrase returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("hacker.phrase");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });

  it("number.octal returns a string", async () => {
    const ctx = createTestContext();
    const op = findFakerOp("number.octal");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
  });
});

describe("supabase operations", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "supabase" }]);
  });

  function findOp(name: string): OperationListItem {
    const op = supabaseOperations.find((o) => o.name === name);
    if (!op) throw new Error(`Supabase operation "${name}" not found`);
    return op;
  }

  function findOpForInput(name: string, className: string): OperationListItem {
    const op = supabaseOperations.find((o) => {
      if (o.name !== name) return false;
      const params =
        typeof o.parameters === "function"
          ? o.parameters(createData())
          : o.parameters;
      const firstType = params[0]?.type;
      return firstType.kind === "instance" && firstType.className === className;
    });
    if (!op)
      throw new Error(
        `Supabase operation "${name}" for "${className}" not found`
      );
    return op;
  }

  function operationContext(ctx: Context, id: string) {
    const opContext = { ...ctx };
    opContext._currentOperationId = id;
    return opContext;
  }

  it("createClient returns a Supabase client instance", async () => {
    const ctx = createTestContext();
    const op = findOp("createClient");
    const urlData = testString("https://example.supabase.co");
    const keyData = testString("dummy-key");
    const result = await executeOperation(
      op,
      urlData,
      [createStatement({ data: keyData, operations: [] })],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("supabase.SupabaseClient");
    }
    const raw = getRawValueFromData(result, ctx);
    expect(raw).toBeDefined();
    expect(typeof (raw as { from: unknown }).from).toBe("function");
    expect(typeof (raw as { functions: unknown }).functions).toBe("object");
  });

  it("from returns a query builder instance", async () => {
    const ctx = createTestContext();
    const createOp = findOp("createClient");
    const clientResult = await executeOperation(
      createOp,
      testString("https://example.supabase.co"),
      [createStatement({ data: testString("dummy-key"), operations: [] })],
      ctx
    );

    const fromOp = findOp("from");
    const result = await executeOperation(
      fromOp,
      clientResult,
      [stringStatement("todos")],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("supabase.PostgrestQueryBuilder");
    }
  });

  it("select returns a builder instance", async () => {
    const ctx = createTestContext();
    const createOp = findOp("createClient");
    const clientResult = await executeOperation(
      createOp,
      testString("https://example.supabase.co"),
      [createStatement({ data: testString("dummy-key"), operations: [] })],
      ctx
    );

    const fromResult = await executeOperation(
      findOp("from"),
      clientResult,
      [stringStatement("todos")],
      ctx
    );

    const selectOp = findOp("select");
    const result = await executeOperation(
      selectOp,
      fromResult,
      [stringStatement("*")],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("supabase.PostgrestFilterBuilder");
    }
  });

  it("eq returns a builder instance", async () => {
    const ctx = createTestContext();
    const clientResult = await executeOperation(
      findOp("createClient"),
      testString("https://example.supabase.co"),
      [createStatement({ data: testString("dummy-key"), operations: [] })],
      ctx
    );

    const fromResult = await executeOperation(
      findOp("from"),
      clientResult,
      [stringStatement("todos")],
      ctx
    );

    const selectResult = await executeOperation(
      findOp("select"),
      fromResult,
      [stringStatement("*")],
      ctx
    );

    const eqOp = findOp("eq");
    const result = await executeOperation(
      eqOp,
      selectResult,
      [
        stringStatement("done"),
        createStatement({ data: testBoolean(false), operations: [] }),
      ],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("supabase.PostgrestFilterBuilder");
    }
  });

  it("single returns a builder instance", async () => {
    const ctx = createTestContext();
    const clientResult = await executeOperation(
      findOp("createClient"),
      testString("https://example.supabase.co"),
      [createStatement({ data: testString("dummy-key"), operations: [] })],
      ctx
    );

    const fromResult = await executeOperation(
      findOp("from"),
      clientResult,
      [stringStatement("todos")],
      ctx
    );

    const selectResult = await executeOperation(
      findOp("select"),
      fromResult,
      [],
      ctx
    );

    const singleOp = findOp("single");
    const result = await executeOperation(singleOp, selectResult, [], ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("supabase.PostgrestFilterBuilder");
    }
    expect(
      getFilteredOperations(result, ctx).some((op) => op.name === "await")
    ).toBe(false);
  });

  it("includes the missing PostgREST builder operations", () => {
    const expectedNames = [
      "select",
      "likeAllOf",
      "likeAnyOf",
      "ilikeAllOf",
      "ilikeAnyOf",
      "regexMatch",
      "regexIMatch",
      "isDistinct",
      "notIn",
      "rangeGt",
      "rangeGte",
      "rangeLt",
      "rangeLte",
      "rangeAdjacent",
      "textSearch",
      "geojson",
      "explain",
      "rollback",
      "maxAffected",
      "stripNulls",
      "retry",
      "then",
    ];

    for (const name of expectedNames) {
      expect(
        findOpForInput(name, "supabase.PostgrestFilterBuilder")
      ).toBeDefined();
    }
  });

  it("select after insert returns a builder instance", async () => {
    const ctx = createTestContext();
    const clientResult = await executeOperation(
      findOp("createClient"),
      testString("https://example.supabase.co"),
      [createStatement({ data: testString("dummy-key"), operations: [] })],
      ctx
    );
    const fromResult = await executeOperation(
      findOp("from"),
      clientResult,
      [stringStatement("todos")],
      ctx
    );
    const insertResult = await executeOperation(
      findOp("insert"),
      fromResult,
      [
        createStatement({
          data: createData({ value: { title: "new todo" } }),
          operations: [],
        }),
      ],
      ctx
    );

    const result = await executeOperation(
      findOpForInput("select", "supabase.PostgrestFilterBuilder"),
      insertResult,
      [stringStatement("*")],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("supabase.PostgrestFilterBuilder");
    }
  });

  it("then returns a Promise instance for Supabase builders", async () => {
    const ctx = createTestContext();
    const builder = {
      url: new URL("https://example.supabase.co/rest/v1/todos"),
      then(callback?: (value: unknown) => unknown) {
        const request = Promise.resolve({ data: [{ id: 1 }], error: null });
        return callback ? request.then(callback) : request;
      },
    };
    const builderData = createDataFromRawValue(builder, {
      ...ctx,
      expectedType: {
        kind: "instance",
        className: "supabase.PostgrestFilterBuilder",
        constructorArgs: [],
      },
    });
    const callback = createData({
      type: {
        kind: "operation",
        parameters: [{ name: "value", type: { kind: "unknown" } }],
        result: { kind: "unknown" },
      },
    });
    callback.value.statements = [
      createStatement({ data: testString("resolved") }),
    ];

    const result = await executeOperation(
      findOpForInput("then", "supabase.PostgrestFilterBuilder"),
      builderData,
      [createStatement({ data: callback })],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("Promise");
    }
    await expect(getRawValueFromData(result, ctx)).resolves.toBe("resolved");
  });

  it("then accepts no callback and returns the base request Promise", async () => {
    const ctx = createTestContext();
    const builder = {
      url: new URL("https://example.supabase.co/rest/v1/todos"),
      then() {
        return Promise.resolve({ data: [{ id: 1 }], error: null });
      },
    };
    const builderData = createDataFromRawValue(builder, {
      ...ctx,
      expectedType: {
        kind: "instance",
        className: "supabase.PostgrestFilterBuilder",
        constructorArgs: [],
      },
    });

    const thenResult = await executeOperation(
      findOpForInput("then", "supabase.PostgrestFilterBuilder"),
      builderData,
      [],
      ctx
    );

    expect(isDataOfType(thenResult, "instance")).toBe(true);
    if (thenResult.type.kind === "instance") {
      expect(thenResult.type.className).toBe("Promise");
    }

    const awaitOp = coreOperations.find((op) => op.name === "await")!;
    const awaited = await executeOperation(awaitOp, thenResult, [], ctx);
    expect(getRawValueFromData(awaited, ctx)).toEqual({
      data: [{ id: 1 }],
      error: undefined,
    });
  });

  it("caches Supabase then network execution by builder dependency", async () => {
    const ctx = createTestContext();
    const request = vi.fn(() => Promise.resolve({ data: [{ id: 1 }] }));
    const callback = vi.fn((value: unknown) => value);
    const client = {
      from: () => ({
        url: new URL("https://example.supabase.co/rest/v1/todos"),
        insert: () => undefined,
        select: (columns: string) => ({
          url: new URL(
            `https://example.supabase.co/rest/v1/todos?select=${columns}`
          ),
          then: request,
        }),
      }),
      rpc: () => undefined,
      functions: {},
    };
    const clientData = createDataFromRawValue(client, {
      ...ctx,
      expectedType: {
        kind: "instance",
        className: "supabase.SupabaseClient",
        constructorArgs: [],
      },
    });
    const queryData = await executeOperation(
      findOpForInput("from", "supabase.SupabaseClient"),
      clientData,
      [stringStatement("todos")],
      ctx
    );
    const builderData = await executeOperation(
      findOpForInput("select", "supabase.PostgrestQueryBuilder"),
      queryData,
      [stringStatement("*")],
      ctx
    );
    const callbackData = createDataFromRawValue(callback, {
      ...ctx,
      expectedType: {
        kind: "operation",
        parameters: [{ name: "value", type: { kind: "unknown" } }],
        result: { kind: "unknown" },
      },
    });
    const thenOp = findOpForInput("then", "supabase.PostgrestFilterBuilder");
    const executeThen = () =>
      executeOperation(
        thenOp,
        builderData,
        [createStatement({ data: callbackData })],
        operationContext(ctx, "then-request")
      );

    const first = await executeThen();
    const second = await executeThen();

    await getRawValueFromData(first, ctx);
    await getRawValueFromData(second, ctx);
    expect(request).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("does not reuse Supabase then cache after a changed request", async () => {
    const ctx = createTestContext();
    const request = vi.fn(() => Promise.resolve({ data: [] }));
    const queryData = createDataFromRawValue(
      {
        url: new URL("https://example.supabase.co/rest/v1/todos"),
        insert: () => undefined,
        select: (columns: string) => ({
          url: new URL(
            `https://example.supabase.co/rest/v1/todos?select=${columns}`
          ),
          then: request,
        }),
      },
      {
        ...ctx,
        expectedType: {
          kind: "instance",
          className: "supabase.PostgrestQueryBuilder",
          constructorArgs: [],
        },
      }
    );
    const createBuilderData = (dependencyKey: string) =>
      executeOperation(
        findOpForInput("select", "supabase.PostgrestQueryBuilder"),
        queryData,
        [stringStatement(dependencyKey)],
        ctx
      );
    const thenOp = findOpForInput("then", "supabase.PostgrestFilterBuilder");
    const executeThen = (data: IData) =>
      executeOperation(thenOp, data, [], operationContext(ctx, "then-request"));
    const firstBuilder = await createBuilderData("select-1");
    const secondBuilder = await createBuilderData("select-2");
    const firstRequest = getRawValueFromData(firstBuilder, ctx) as {
      url: URL;
    };
    const secondRequest = getRawValueFromData(secondBuilder, ctx) as {
      url: URL;
    };
    expect(String(firstRequest.url)).toContain("select-1");
    expect(String(secondRequest.url)).toContain("select-2");

    await executeThen(firstBuilder);
    await executeThen(secondBuilder);
    await executeThen(await createBuilderData("select-1"));

    expect(request).toHaveBeenCalledTimes(3);
  });

  it("functions.invoke operation exists as a method", () => {
    const invokeOp = findOp("functions.invoke");
    expect(invokeOp.source?.name).toBe("supabaseFunctions");
    expect(invokeOp.source?.callStyle).toBe("method");
  });

  it("functions.invoke caches result for same inputs", async () => {
    const ctx = createTestContext();
    const invokeMock = vi.fn(() =>
      Promise.resolve({ data: { message: "hello" }, error: null })
    );
    const client = {
      functions: { invoke: invokeMock },
      from: vi.fn(),
      rpc: vi.fn(),
    };

    const clientData = createDataFromRawValue(client, {
      ...ctx,
      expectedType: {
        kind: "instance",
        className: "supabase.SupabaseClient",
        constructorArgs: [],
      },
    });
    const functionName = stringStatement("hello");
    const options = createDataFromRawValue({ body: { name: "world" } }, ctx);
    const optionsStmt = createStatement({ data: options });

    const op1 = testOperation(
      [functionName, optionsStmt],
      [],
      "supabase.functions.invoke"
    );
    op1.id = "invoke-cache-1";

    const result1 = await executeStatement(
      createStatement({ data: clientData, operations: [op1] }),
      ctx
    );
    const result2 = await executeStatement(
      createStatement({ data: clientData, operations: [op1] }),
      ctx
    );

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("hello", {
      body: { name: "world" },
    });
    expect(result1).toBe(result2);
  });

  it("functions.invoke does not reuse cache after input changes", async () => {
    const ctx = createTestContext();
    const invokeMock = vi.fn(() =>
      Promise.resolve({ data: { message: "hello" }, error: null })
    );
    const client = {
      functions: { invoke: invokeMock },
      from: vi.fn(),
      rpc: vi.fn(),
    };

    const clientData = createDataFromRawValue(client, {
      ...ctx,
      expectedType: {
        kind: "instance",
        className: "supabase.SupabaseClient",
        constructorArgs: [],
      },
    });

    const helloParam = stringStatement("hello");
    const op1 = testOperation([helloParam], [], "supabase.functions.invoke");
    op1.id = "invoke-cache-2";
    const op2 = testOperation(
      [stringStatement("world")],
      [],
      "supabase.functions.invoke"
    );
    op2.id = "invoke-cache-3";
    const op3 = testOperation([helloParam], [], "supabase.functions.invoke");
    op3.id = "invoke-cache-2";

    const result1 = await executeStatement(
      createStatement({ data: clientData, operations: [op1] }),
      ctx
    );
    const _result2 = await executeStatement(
      createStatement({ data: clientData, operations: [op2] }),
      ctx
    );
    const result3 = await executeStatement(
      createStatement({ data: clientData, operations: [op3] }),
      ctx
    );

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "hello", undefined);
    expect(invokeMock).toHaveBeenNthCalledWith(2, "world", undefined);
    expect(result1).toBe(result3);
  });
});

describe("date-fns operations", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "dateFns" }]);
  });

  function findOp(name: string): OperationListItem {
    const op = dateFnsOperations.find((o) => o.name === name);
    if (!op) throw new Error(`date-fns operation "${name}" not found`);
    return op;
  }

  const testDate = new Date("2024-06-15T12:00:00.000Z");
  const testDate2 = new Date("2024-07-20T12:00:00.000Z");

  function dateData(d: Date, ctx: Context) {
    return createDataFromRawValue(d, ctx);
  }

  it("format returns a formatted string", async () => {
    const ctx = createTestContext();
    const op = findOp("format");
    const src = dateData(testDate, ctx);
    const result = await executeOperation(
      op,
      src,
      [stringStatement("yyyy-MM-dd")],
      ctx
    );

    expect(isDataOfType(result, "string")).toBe(true);
    expect(getRawValueFromData(result, ctx)).toBe("2024-06-15");
  });

  it("addDays returns a Date", async () => {
    const ctx = createTestContext();
    const op = findOp("addDays");
    const src = dateData(testDate, ctx);
    const result = await executeOperation(
      op,
      src,
      [{ data: createData({ value: 5 }), id: "num", operations: [] }],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    const value = getRawValueFromData(result, ctx);
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString()).toBe("2024-06-20T12:00:00.000Z");
  });

  it("isAfter returns a boolean", async () => {
    const ctx = createTestContext();
    const op = findOp("isAfter");
    const src = dateData(testDate2, ctx);
    const result = await executeOperation(
      op,
      src,
      [{ data: dateData(testDate, ctx), id: "other", operations: [] }],
      ctx
    );

    expect(isDataOfType(result, "boolean")).toBe(true);
    expect(getRawValueFromData(result, ctx)).toBe(true);
  });

  it("isBefore returns false when date is after", async () => {
    const ctx = createTestContext();
    const op = findOp("isBefore");
    const src = dateData(testDate2, ctx);
    const result = await executeOperation(
      op,
      src,
      [{ data: dateData(testDate, ctx), id: "other", operations: [] }],
      ctx
    );

    expect(isDataOfType(result, "boolean")).toBe(true);
    expect(getRawValueFromData(result, ctx)).toBe(false);
  });

  it("differenceInDays returns a number", async () => {
    const ctx = createTestContext();
    const op = findOp("differenceInDays");
    const src = dateData(testDate2, ctx);
    const result = await executeOperation(
      op,
      src,
      [{ data: dateData(testDate, ctx), id: "other", operations: [] }],
      ctx
    );

    expect(isDataOfType(result, "number")).toBe(true);
    expect(getRawValueFromData(result, ctx)).toBe(35);
  });

  it("getYear returns the year", async () => {
    const ctx = createTestContext();
    const op = findOp("getYear");
    const src = dateData(testDate, ctx);
    const result = await executeOperation(op, src, [], ctx);

    expect(isDataOfType(result, "number")).toBe(true);
    expect(getRawValueFromData(result, ctx)).toBe(2024);
  });

  it("startOfMonth returns the first day of the month", async () => {
    const ctx = createTestContext();
    const op = findOp("startOfMonth");
    const src = dateData(testDate, ctx);
    const result = await executeOperation(op, src, [], ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    const value = getRawValueFromData(result, ctx);
    expect(value).toBeInstanceOf(Date);
    // startOfMonth should be on or before the input date
    expect((value as Date).getTime()).toBeLessThanOrEqual(testDate.getTime());
  });

  it("parseISO creates a Date from string", async () => {
    const ctx = createTestContext();
    const op = findOp("parseISO");
    const src = createData({ value: "2024-06-15T12:00:00.000Z" });
    const result = await executeOperation(op, src, [], ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    const value = getRawValueFromData(result, ctx);
    expect(value).toBeInstanceOf(Date);
  });

  it("isPast returns true for past dates", async () => {
    const ctx = createTestContext();
    const op = findOp("isPast");
    const src = dateData(testDate, ctx);
    const result = await executeOperation(op, src, [], ctx);

    expect(isDataOfType(result, "boolean")).toBe(true);
    expect(getRawValueFromData(result, ctx)).toBe(true);
  });

  it("isFuture returns false for past dates", async () => {
    const ctx = createTestContext();
    const op = findOp("isFuture");
    const src = dateData(testDate, ctx);
    const result = await executeOperation(op, src, [], ctx);

    expect(isDataOfType(result, "boolean")).toBe(true);
    expect(getRawValueFromData(result, ctx)).toBe(false);
  });
});

describe("comfyui operations", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "comfyui" }]);
  });

  function findOp(name: string): OperationListItem {
    const op = comfyuiOperations.find((o) => o.name === name);
    if (!op) throw new Error(`ComfyUI operation "${name}" not found`);
    return op;
  }

  it("creates ComfyApi through instance type metadata", () => {
    const ctx = createTestContext();
    const raw = createInstance(
      "comfyui.ComfyApi",
      [testString("http://localhost:8188")],
      ctx
    );
    const result = createDataFromRawValue(raw, ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.ComfyApi");
    }
    expect(raw).toBeInstanceOf(comfyuiSDK.ComfyApi);
    expect(typeof (raw as { init: unknown }).init).toBe("function");
  });

  it("ComfyApi instance type accepts optional clientId", () => {
    const ctx = createTestContext();
    const raw = createInstance(
      "comfyui.ComfyApi",
      [testString("http://localhost:8188"), testString("my-client-id")],
      ctx
    );
    const result = createDataFromRawValue(raw, ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.ComfyApi");
    }
    expect(raw).toBeInstanceOf(comfyuiSDK.ComfyApi);
  });

  it("creates PromptBuilder through instance type metadata", () => {
    const ctx = createTestContext();
    const raw = createInstance(
      "comfyui.PromptBuilder",
      [
        createDataFromRawValue(
          { "1": { inputs: {}, class_type: "Test", _meta: { title: "Test" } } },
          ctx
        ),
        createDataFromRawValue(["positive"], ctx),
        createDataFromRawValue(["images"], ctx),
      ],
      ctx
    );
    const result = createDataFromRawValue(raw, ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.PromptBuilder");
    }
    expect(raw).toBeInstanceOf(comfyuiSDK.PromptBuilder);
    expect(typeof (raw as { inputRaw: unknown }).inputRaw).toBe("function");
  });

  it("clone returns a PromptBuilder instance", async () => {
    const ctx = createTestContext();
    const op = findOp("clone");
    const raw = createInstance(
      "comfyui.PromptBuilder",
      [
        createDataFromRawValue(
          { "1": { inputs: {}, class_type: "Test", _meta: { title: "Test" } } },
          ctx
        ),
        createDataFromRawValue(["positive"], ctx),
        createDataFromRawValue(["images"], ctx),
      ],
      ctx
    );
    const source = createDataFromRawValue(raw, ctx);
    const result = await executeOperation(op, source, [], ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.PromptBuilder");
    }
    expect(getRawValueFromData(result, ctx)).toBeInstanceOf(
      comfyuiSDK.PromptBuilder
    );
  });

  it("creates ComfyPool through instance type metadata", () => {
    const ctx = createTestContext();
    const api1 = createInstance(
      "comfyui.ComfyApi",
      [testString("http://localhost:8188")],
      ctx
    );
    const api2 = createInstance(
      "comfyui.ComfyApi",
      [testString("http://localhost:8189")],
      ctx
    );
    const raw = createInstance(
      "comfyui.ComfyPool",
      [createDataFromRawValue([api1, api2], ctx)],
      ctx
    );
    const result = createDataFromRawValue(raw, ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.ComfyPool");
    }
    expect(raw).toBeInstanceOf(comfyuiSDK.ComfyPool);
    expect(typeof (raw as { addClient: unknown }).addClient).toBe("function");
  });

  it("creates WorkflowBuilder through instance type metadata", () => {
    const ctx = createTestContext();
    const raw = createInstance("comfyui.WorkflowBuilder", [], ctx);
    const result = createDataFromRawValue(raw, ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.WorkflowBuilder");
    }
    expect(raw).toBeInstanceOf(comfyuiSDK.WorkflowBuilder);
    expect(typeof (raw as { build: unknown }).build).toBe("function");
  });

  it("build returns a PromptBuilder instance", async () => {
    const ctx = createTestContext();
    const op = findOp("build");
    const builder = createInstance("comfyui.WorkflowBuilder", [], ctx);
    const source = createDataFromRawValue(builder, ctx);
    const config = createDataFromRawValue(
      { inputs: { positive: "1.inputs.text" }, outputs: { images: "2" } },
      ctx
    );
    const result = await executeOperation(
      op,
      source,
      [createStatement({ data: config })],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.PromptBuilder");
    }
    expect(getRawValueFromData(result, ctx)).toBeInstanceOf(
      comfyuiSDK.PromptBuilder
    );
  });

  it("input sets a value on PromptBuilder", async () => {
    const ctx = createTestContext();
    const op = findOp("input");
    const builder = createInstance(
      "comfyui.PromptBuilder",
      [
        createDataFromRawValue(
          {
            "1": {
              inputs: { text: "" },
              class_type: "Test",
              _meta: { title: "Test" },
            },
          },
          ctx
        ),
        createDataFromRawValue(["positive"], ctx),
        createDataFromRawValue(["images"], ctx),
      ],
      ctx
    );
    (
      builder as {
        setRawInputNode: (input: string, key: string | string[]) => unknown;
      }
    ).setRawInputNode("positive", "1.inputs.text");
    const source = createDataFromRawValue(builder, ctx);
    const key = createDataFromRawValue("positive", ctx);
    const value = createDataFromRawValue("a cute cat", ctx);
    const result = await executeOperation(
      op,
      source,
      [createStatement({ data: key }), createStatement({ data: value })],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.PromptBuilder");
    }
    const raw = getRawValueFromData(result, ctx);
    expect(raw).toBeInstanceOf(comfyuiSDK.PromptBuilder);
  });

  it("setInputNode returns a PromptBuilder instance", async () => {
    const ctx = createTestContext();
    const op = findOp("setInputNode");
    const builder = createInstance(
      "comfyui.PromptBuilder",
      [
        createDataFromRawValue(
          {
            "1": {
              inputs: { text: "" },
              class_type: "Test",
              _meta: { title: "Test" },
            },
          },
          ctx
        ),
        createDataFromRawValue(["positive"], ctx),
        createDataFromRawValue(["images"], ctx),
      ],
      ctx
    );
    const source = createDataFromRawValue(builder, ctx);
    const input = createDataFromRawValue("positive", ctx);
    const key = createDataFromRawValue("1.inputs.text", ctx);
    const result = await executeOperation(
      op,
      source,
      [createStatement({ data: input }), createStatement({ data: key })],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.PromptBuilder");
    }
  });

  it("setOutputNode returns a PromptBuilder instance", async () => {
    const ctx = createTestContext();
    const op = findOp("setOutputNode");
    const builder = createInstance(
      "comfyui.PromptBuilder",
      [
        createDataFromRawValue(
          {
            "1": {
              inputs: { text: "" },
              class_type: "Test",
              _meta: { title: "Test" },
            },
          },
          ctx
        ),
        createDataFromRawValue(["positive"], ctx),
        createDataFromRawValue(["images"], ctx),
      ],
      ctx
    );
    const source = createDataFromRawValue(builder, ctx);
    const output = createDataFromRawValue("images", ctx);
    const key = createDataFromRawValue("2", ctx);
    const result = await executeOperation(
      op,
      source,
      [createStatement({ data: output }), createStatement({ data: key })],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("comfyui.PromptBuilder");
    }
  });

  it("destroy on ComfyPool does not throw", async () => {
    const ctx = createTestContext();
    const op = findOp("destroy");
    const api = createInstance(
      "comfyui.ComfyApi",
      [testString("http://localhost:8188")],
      ctx
    );
    const pool = createInstance(
      "comfyui.ComfyPool",
      [createDataFromRawValue([api], ctx)],
      ctx
    );
    const source = createDataFromRawValue(pool, ctx);
    await expect(executeOperation(op, source, [], ctx)).resolves.toBeDefined();
  });
});
