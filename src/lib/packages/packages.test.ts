import { describe, it, expect, beforeAll } from "vitest";
import { executeOperation } from "@/lib/execution/execution";
import { coreOperations } from "@/lib/operations/built-in";
import { operations as rowguardOperations } from "@/lib/operations/rowguard";
import { operations as fakerOperations } from "@/lib/operations/faker";
import { createData, getRawValueFromData, isDataOfType } from "@/lib/utils";
import { OperationListItem } from "@/lib/execution/types";
import { InstanceDataType } from "../types";
import {
  createTestContext,
  testString,
  stringStatement,
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
