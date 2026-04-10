import { describe, it, expect } from "vitest";
import { updateStatements, updateFiles } from "@/lib/update";
import {
  createTestContext,
  stringStatement,
  booleanStatement,
  numberStatement,
  testArray,
  testObject,
  testCondition,
  testOperation,
  testReference,
  testError,
  testUnion,
  testDictionary,
  testTuple,
  testString,
} from "@/tests/helpers";
import {
  createProjectFile,
  createData,
  createStatement,
  isDataOfType,
} from "@/lib/utils";
import { IStatement } from "@/lib/types";

describe("updateStatements", () => {
  it("returns unchanged statements when no changedStatement", () => {
    const ctx = createTestContext();
    const stmts = [stringStatement("a"), stringStatement("b")];
    const result = updateStatements({ statements: stmts, context: ctx });
    expect(result).toHaveLength(2);
    expect(result[0].data.value).toBe("a");
    expect(result[1].data.value).toBe("b");
  });

  it("updates a changed statement", () => {
    const ctx = createTestContext();
    const original = stringStatement("old");
    const changed = stringStatement("new");
    changed.id = original.id;
    const result = updateStatements({
      statements: [original],
      context: ctx,
      changedStatement: changed,
    });
    expect(result).toHaveLength(1);
    expect(result[0].data.value).toBe("new");
  });

  it("removes a statement when removeStatement is true", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("remove-me");
    const result = updateStatements({
      statements: [stmt],
      context: ctx,
      changedStatement: stmt,
      removeStatement: true,
    });
    expect(result).toHaveLength(0);
  });

  it("keeps statements before changed one unchanged", () => {
    const ctx = createTestContext();
    const stmt1 = stringStatement("first");
    const stmt2 = stringStatement("second");
    const changed = stringStatement("new-second");
    changed.id = stmt2.id;
    const result = updateStatements({
      statements: [stmt1, stmt2],
      context: ctx,
      changedStatement: changed,
    });
    expect(result).toHaveLength(2);
    expect(result[0].data.value).toBe("first");
  });

  it("updates only the changed statement and those after it", () => {
    const ctx = createTestContext();
    const stmt1 = stringStatement("first");
    const stmt2 = stringStatement("second");
    const stmt3 = stringStatement("third");
    const changed = stringStatement("new-second");
    changed.id = stmt2.id;
    const result = updateStatements({
      statements: [stmt1, stmt2, stmt3],
      context: ctx,
      changedStatement: changed,
    });
    expect(result).toHaveLength(3);
    expect(result[0].data.value).toBe("first");
  });

  it("updates statement with array data recursively", () => {
    const ctx = createTestContext();
    const inner1 = stringStatement("a");
    const inner2 = stringStatement("b");
    const arrData = testArray([inner1, inner2]);
    const stmt = createStatement({ data: arrData });
    const changed = createStatement({
      data: testArray([stringStatement("x"), stringStatement("y")]),
    });
    changed.id = stmt.id;
    const result = updateStatements({
      statements: [stmt],
      context: ctx,
      changedStatement: changed,
    });
    expect(result).toHaveLength(1);
    expect(isDataOfType(result[0].data, "array")).toBe(true);
    if (isDataOfType(result[0].data, "array")) {
      expect(result[0].data.value).toHaveLength(2);
      expect(result[0].data.value[0].data.value).toBe("x");
      expect(result[0].data.value[1].data.value).toBe("y");
    }
  });

  it("updates statement with object data recursively", () => {
    const ctx = createTestContext();
    const objData = testObject([
      { key: "name", value: stringStatement("test") },
      { key: "age", value: numberStatement(25) },
    ]);
    const stmt = createStatement({ data: objData });
    const changedObj = testObject([
      { key: "name", value: stringStatement("updated") },
      { key: "age", value: numberStatement(30) },
    ]);
    const changed = createStatement({ data: changedObj });
    changed.id = stmt.id;
    const result = updateStatements({
      statements: [stmt],
      context: ctx,
      changedStatement: changed,
    });
    expect(result).toHaveLength(1);
    expect(isDataOfType(result[0].data, "object")).toBe(true);
    if (isDataOfType(result[0].data, "object")) {
      expect(result[0].data.value.entries).toHaveLength(2);
      expect(result[0].data.value.entries[0].value.data.value).toBe("updated");
      expect(result[0].data.value.entries[1].value.data.value).toBe(30);
    }
  });

  it("updates statement with condition data recursively", () => {
    const ctx = createTestContext();
    const condData = testCondition(
      booleanStatement(true),
      stringStatement("yes"),
      stringStatement("no")
    );
    const stmt = createStatement({ data: condData });
    const changedCond = testCondition(
      booleanStatement(false),
      stringStatement("no"),
      stringStatement("yes")
    );
    const changed = createStatement({ data: changedCond });
    changed.id = stmt.id;
    const result = updateStatements({
      statements: [stmt],
      context: ctx,
      changedStatement: changed,
    });
    expect(result).toHaveLength(1);
    expect(isDataOfType(result[0].data, "condition")).toBe(true);
  });

  it("updates reference data to point to correct variable", () => {
    const ctx = createTestContext();
    const refData = testReference("myVar", "data-ref-1");
    const stmt = createStatement({ data: refData });
    ctx.variables.set("myVar", {
      data: createData({ type: { kind: "string" }, value: "resolved" }),
    });
    const result = updateStatements({ statements: [stmt], context: ctx });
    expect(result).toHaveLength(1);
  });

  it("updates operation data with nested parameters and statements", () => {
    const ctx = createTestContext();
    const param = stringStatement("input", "myParam");
    const innerStmt = stringStatement("result");
    const opData = testOperation([param], [innerStmt], "myOp");
    const stmt = createStatement({ data: opData });
    const result = updateStatements({ statements: [stmt], context: ctx });
    expect(result).toHaveLength(1);
  });

  it("handles union data by resolving active type", () => {
    const ctx = createTestContext();
    const unionData = testUnion(
      [{ kind: "string" }, { kind: "number" }],
      "hello"
    );
    const stmt = createStatement({ data: unionData });
    const result = updateStatements({ statements: [stmt], context: ctx });
    expect(result).toHaveLength(1);
    expect(result[0].data.type.kind).toBe("union");
  });

  it("handles error data in statement", () => {
    const ctx = createTestContext();
    const errorData = testError("something broke");
    const stmt = createStatement({ data: errorData });
    const result = updateStatements({ statements: [stmt], context: ctx });
    expect(result).toHaveLength(1);
    expect(isDataOfType(result[0].data, "error")).toBe(true);
  });

  it("handles dictionary data recursively", () => {
    const ctx = createTestContext();
    const dictData = testDictionary(
      [{ key: "name", value: stringStatement("test") }],
      { kind: "string" }
    );
    const stmt = createStatement({ data: dictData });
    const result = updateStatements({ statements: [stmt], context: ctx });
    expect(result).toHaveLength(1);
    expect(isDataOfType(result[0].data, "dictionary")).toBe(true);
  });

  it("handles tuple data recursively", () => {
    const ctx = createTestContext();
    const tupleData = testTuple([stringStatement("a"), numberStatement(1)]);
    const stmt = createStatement({ data: tupleData });
    const result = updateStatements({ statements: [stmt], context: ctx });
    expect(result).toHaveLength(1);
    expect(isDataOfType(result[0].data, "tuple")).toBe(true);
  });

  it("returns empty array when removing the only statement", () => {
    const ctx = createTestContext();
    const stmt = stringStatement("only");
    const result = updateStatements({
      statements: [stmt],
      context: ctx,
      changedStatement: stmt,
      removeStatement: true,
    });
    expect(result).toHaveLength(0);
  });

  it("preserves statement name when changed statement includes it", () => {
    const ctx = createTestContext();
    const original = stringStatement("old", "myVar");
    const changed = stringStatement("new", "myVar");
    changed.id = original.id;
    const result = updateStatements({
      statements: [original],
      context: ctx,
      changedStatement: changed,
    });
    expect(result[0].name).toBe("myVar");
  });
});

describe("updateStatement - operation call updates", () => {
  it("updates operation calls when data type changes", () => {
    const ctx = createTestContext();
    const lengthOp = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const stmt: IStatement = createStatement({
      data: createData({ type: { kind: "string" }, value: "hello" }),
      operations: [lengthOp],
    });
    ctx.setContext(stmt.id, ctx);

    const changed = createStatement({
      data: createData({ type: { kind: "number" }, value: 42 }),
      operations: [lengthOp],
    });
    changed.id = stmt.id;
    const result = updateStatements({
      statements: [stmt],
      context: ctx,
      changedStatement: changed,
    });
    expect(result).toHaveLength(1);
  });

  it("preserves operation call when compatible", () => {
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
      data: createData({ type: { kind: "string" }, value: "hello" }),
      operations: [lengthOp],
    });
    ctx.setContext(stmt.id, ctx);

    const changed = createStatement({
      data: createData({ type: { kind: "string" }, value: "world" }),
      operations: [lengthOp],
    });
    changed.id = stmt.id;
    const result = updateStatements({
      statements: [stmt],
      context: ctx,
      changedStatement: changed,
    });
    expect(result[0].operations).toHaveLength(1);
    expect(result[0].operations[0].value.name).toBe("length");
  });
});

describe("updateFiles", () => {
  it("updates changed file", () => {
    const ctx = createTestContext();
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const changedFile = { ...file1, name: "op1_updated" };
    const history: Array<{ fileId: string; content: unknown }> = [];
    const pushHistory = (fileId: string, content: unknown) => {
      history.push({ fileId, content });
    };
    const result = updateFiles([file1], pushHistory, ctx, changedFile);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("op1_updated");
    expect(history).toHaveLength(1);
    expect(history[0].fileId).toBe(file1.id);
  });

  it("returns same files when no changed file", () => {
    const ctx = createTestContext();
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const pushHistory = () => {};
    const result = updateFiles([file1], pushHistory, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("op1");
  });

  it("updates dependent files when a file changes", () => {
    const ctx = createTestContext();
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const file2 = createProjectFile({ type: "operation", name: "op2" });
    const pushHistory = () => {};
    const result = updateFiles([file1, file2], pushHistory, ctx, {
      ...file1,
      name: "op1_updated",
    });
    expect(result).toHaveLength(2);
  });

  it("pushes history for the changed file before updating", () => {
    const ctx = createTestContext();
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const historyCalls: string[] = [];
    const pushHistory = (fileId: string) => {
      historyCalls.push(fileId);
    };
    const changedFile = { ...file1, name: "op1_new" };
    updateFiles([file1], pushHistory, ctx, changedFile);
    expect(historyCalls).toHaveLength(1);
    expect(historyCalls[0]).toBe(file1.id);
  });

  it("handles globals file without error", () => {
    const ctx = createTestContext();
    const globalsFile = createProjectFile({ type: "globals" });
    const pushHistory = () => {};
    const result = updateFiles([globalsFile], pushHistory, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("globals");
  });

  it("skips non-operation files during dependent update", () => {
    const ctx = createTestContext();
    const opFile = createProjectFile({ type: "operation", name: "op1" });
    const globalsFile = createProjectFile({ type: "globals" });
    const pushHistory = () => {};
    const result = updateFiles([opFile, globalsFile], pushHistory, ctx);
    expect(result).toHaveLength(2);
  });

  it("handles multiple file changes", () => {
    const ctx = createTestContext();
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const file2 = createProjectFile({ type: "operation", name: "op2" });
    const pushHistory = () => {};
    const changedFile = { ...file1, name: "op1_updated" };
    const result = updateFiles([file1, file2], pushHistory, ctx, changedFile);
    expect(result[0].name).toBe("op1_updated");
    expect(result[1].name).toBe("op2");
  });

  it("handles empty files array", () => {
    const ctx = createTestContext();
    const pushHistory = () => {};
    const result = updateFiles([], pushHistory, ctx);
    expect(result).toHaveLength(0);
  });

  it("handles documentation file", () => {
    const ctx = createTestContext();
    const docFile = createProjectFile({ type: "documentation" });
    const pushHistory = () => {};
    const result = updateFiles([docFile], pushHistory, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("documentation");
  });

  it("handles json file", () => {
    const ctx = createTestContext();
    const jsonFile = createProjectFile({ type: "json" });
    const pushHistory = () => {};
    const result = updateFiles([jsonFile], pushHistory, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("json");
  });

  it("pushes history only for the changed file not other files", () => {
    const ctx = createTestContext();
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const file2 = createProjectFile({ type: "operation", name: "op2" });
    const historyCalls: string[] = [];
    const pushHistory = (fileId: string) => {
      historyCalls.push(fileId);
    };
    const changedFile = { ...file1, name: "op1_new" };
    updateFiles([file1, file2], pushHistory, ctx, changedFile);
    expect(historyCalls).toHaveLength(1);
    expect(historyCalls[0]).toBe(file1.id);
  });

  it("preserves operation content in unchanged files", () => {
    const ctx = createTestContext();
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const file2 = createProjectFile({ type: "operation", name: "op2" });
    const pushHistory = () => {};
    const changedFile = { ...file1, name: "op1_new" };
    const result = updateFiles([file1, file2], pushHistory, ctx, changedFile);
    expect(result[1].type).toBe("operation");
  });

  it("returns unchanged files when changedFile does not exist in array", () => {
    const ctx = createTestContext();
    const file1 = createProjectFile({ type: "operation", name: "op1" });
    const changedFile = createProjectFile({ type: "operation", name: "op2" });
    const pushHistory = () => {};
    const result = updateFiles([file1], pushHistory, ctx, changedFile);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("op1");
  });
});

describe("updateStatements additional coverage", () => {
  it("removes statements from middle of array", () => {
    const ctx = createTestContext();
    const stmt1 = stringStatement("first");
    const stmt2 = stringStatement("middle");
    const stmt3 = stringStatement("last");
    const result = updateStatements({
      statements: [stmt1, stmt2, stmt3],
      context: ctx,
      changedStatement: stmt2,
      removeStatement: true,
    });
    expect(result).toHaveLength(2);
    expect(result[0].data.value).toBe("first");
    expect(result[1].data.value).toBe("last");
  });

  it("removes statements from start of array", () => {
    const ctx = createTestContext();
    const stmt1 = stringStatement("first");
    const stmt2 = stringStatement("second");
    const result = updateStatements({
      statements: [stmt1, stmt2],
      context: ctx,
      changedStatement: stmt1,
      removeStatement: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].data.value).toBe("second");
  });

  it("removes multiple statements from different positions", () => {
    const ctx = createTestContext();
    const stmt1 = stringStatement("a");
    const stmt2 = stringStatement("b");
    const stmt3 = stringStatement("c");
    let result = updateStatements({
      statements: [stmt1, stmt2, stmt3],
      context: ctx,
      changedStatement: stmt1,
      removeStatement: true,
    });
    result = updateStatements({
      statements: result,
      context: ctx,
      changedStatement: stmt3,
      removeStatement: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].data.value).toBe("b");
  });

  it("handles referenced variable update", () => {
    const ctx = createTestContext();
    const refStmt = createStatement({
      data: testReference("myVar", "ref-id"),
    });
    ctx.variables.set("myVar", { data: testString("resolved") });
    const result = updateStatements({ statements: [refStmt], context: ctx });
    expect(result).toHaveLength(1);
  });

  it("handles statement with same name as previous statement", () => {
    const ctx = createTestContext();
    const stmt1 = stringStatement("first", "myVar");
    const stmt2 = stringStatement("second", "myVar");
    const result = updateStatements({
      statements: [stmt1, stmt2],
      context: ctx,
    });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("myVar");
    expect(result[1].name).toBe("myVar");
  });
});
