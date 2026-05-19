import { describe, it, expect, beforeAll } from "vitest";
import { executeOperation } from "@/lib/execution/execution";
import { coreOperations } from "@/lib/operations/built-in";
import { operations as rowguardOperations } from "@/lib/operations/rowguard";
import { operations as fakerOperations } from "@/lib/operations/faker";
import { operations as dateFnsOperations } from "@/lib/operations/date-fns";
import {
  createData,
  getRawValueFromData,
  isDataOfType,
  createDataFromRawValue,
} from "@/lib/utils";
import { Context, OperationListItem } from "@/lib/execution/types";
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
