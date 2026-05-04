import { describe, it, expect } from "vitest";
import {
  getEntityWidth,
  getStatementWidth,
  getOperationCallWidth,
  isSimpleData,
  isComplexData,
  isSimpleStatement,
  getEntityLayout,
  getStatementLayout,
  getOperationCallLayout,
  THRESHOLD,
  MOBILE_THRESHOLD,
  SEPARATOR_WIDTH,
  MAX_STRING_DISPLAY_LENGTH,
} from "@/lib/layout";
import {
  testString,
  testNumber,
  testBoolean,
  testArray,
  testObject,
  testDictionary,
  testCondition,
  testOperation,
  testError,
  testReference,
  testTuple,
  stringStatement,
  numberStatement,
  booleanStatement,
} from "@/tests/helpers";
import { createData, createStatement } from "@/lib/utils";

describe("isSimpleData", () => {
  it("returns true for string", () =>
    expect(isSimpleData(testString("x").type)).toBe(true));
  it("returns true for number", () =>
    expect(isSimpleData(testNumber(1).type)).toBe(true));
  it("returns true for boolean", () =>
    expect(isSimpleData(testBoolean(true).type)).toBe(true));
  it("returns true for undefined", () =>
    expect(isSimpleData(createData({ type: { kind: "undefined" } }).type)).toBe(
      true
    ));
  it("returns true for reference", () =>
    expect(isSimpleData(testReference("x", "1").type)).toBe(true));
  it("returns true for error", () =>
    expect(isSimpleData(testError("oops").type)).toBe(true));
  it("returns false for array", () =>
    expect(isSimpleData(testArray([]).type)).toBe(false));
  it("returns false for object", () =>
    expect(isSimpleData(testObject([]).type)).toBe(false));
  it("returns false for dictionary", () =>
    expect(isSimpleData(testDictionary([]).type)).toBe(false));
  it("returns false for operation", () =>
    expect(isSimpleData(testOperation().type)).toBe(false));
  it("returns false for instance", () =>
    expect(
      isSimpleData(
        createData({
          type: { kind: "instance", className: "Date", constructorArgs: [] },
        }).type
      )
    ).toBe(false));
  it("returns false for union", () =>
    expect(
      isSimpleData({
        kind: "union",
        types: [{ kind: "string" }, { kind: "number" }],
      })
    ).toBe(false));
});

describe("isComplexData", () => {
  it("returns true for array", () =>
    expect(isComplexData(testArray([]))).toBe(true));
  it("returns false for string", () =>
    expect(isComplexData(testString("x"))).toBe(false));
  it("returns true for dictionary", () =>
    expect(isComplexData(testDictionary([], { kind: "string" }))).toBe(true));
  it("returns true for condition", () =>
    expect(
      isComplexData(
        testCondition(
          booleanStatement(true),
          [stringStatement("a")],
          [stringStatement("b")]
        )
      )
    ).toBe(true));
  it("returns true for operation", () =>
    expect(isComplexData(testOperation())).toBe(true));
  it("returns true for instance", () =>
    expect(
      isComplexData(
        createData({
          type: { kind: "instance", className: "Date", constructorArgs: [] },
        })
      )
    ).toBe(true));
});

describe("constants", () => {
  it("THRESHOLD is 15", () => expect(THRESHOLD).toBe(15));
  it("MOBILE_THRESHOLD is 8", () => expect(MOBILE_THRESHOLD).toBe(8));
  it("SEPARATOR_WIDTH is 1", () => expect(SEPARATOR_WIDTH).toBe(1));
  it("MAX_STRING_DISPLAY_LENGTH is 28", () =>
    expect(MAX_STRING_DISPLAY_LENGTH).toBe(28));
});

describe("getEntityWidth — string content length", () => {
  it("empty string = 1", () => {
    expect(getEntityWidth(testString(""))).toBe(1);
  });

  it("short string (9 chars) = 2", () => {
    expect(getEntityWidth(testString("helloworld".slice(0, 9)))).toBe(2);
  });

  it("10-char string = 3", () => {
    expect(getEntityWidth(testString("a".repeat(10)))).toBe(3);
  });

  it("20-char string = 5", () => {
    expect(getEntityWidth(testString("a".repeat(20)))).toBe(5);
  });

  it("30-char string capped at display length = 6", () => {
    expect(getEntityWidth(testString("a".repeat(30)))).toBe(6);
  });

  it("60-char string capped at display length = 6", () => {
    expect(getEntityWidth(testString("a".repeat(60)))).toBe(6);
  });

  it("70-char string capped at display length = 6", () => {
    expect(getEntityWidth(testString("a".repeat(70)))).toBe(6);
  });

  it("200-char string capped at display length = 6", () => {
    expect(getEntityWidth(testString("a".repeat(200)))).toBe(6);
  });
});

describe("getEntityWidth — number digit length", () => {
  it("single digit = 1", () => {
    expect(getEntityWidth(testNumber(5))).toBe(1);
  });

  it("2 digits = 1", () => {
    expect(getEntityWidth(testNumber(12))).toBe(1);
  });

  it("3 digits = 2", () => {
    expect(getEntityWidth(testNumber(123))).toBe(2);
  });

  it("6 digits = 3", () => {
    expect(getEntityWidth(testNumber(123456))).toBe(3);
  });

  it("9 digits = 4", () => {
    expect(getEntityWidth(testNumber(123456789))).toBe(4);
  });

  it("12 digits = 4 (1 + min(floor(12/3), 3) = 1 + 3)", () => {
    expect(getEntityWidth(testNumber(123456789012))).toBe(4);
  });

  it("15+ digits capped at 4", () => {
    expect(getEntityWidth(testNumber(123456789012345))).toBe(4);
  });

  it("negative number uses absolute value", () => {
    expect(getEntityWidth(testNumber(-123))).toBe(2);
  });

  it("float strips decimal point", () => {
    expect(getEntityWidth(testNumber(12.34))).toBe(2);
  });

  it("0 = 1", () => {
    expect(getEntityWidth(testNumber(0))).toBe(1);
  });
});

describe("getEntityWidth — primitives", () => {
  it("boolean = 1", () => expect(getEntityWidth(testBoolean(true))).toBe(1));
  it("undefined = 1", () =>
    expect(getEntityWidth(createData({ type: { kind: "undefined" } }))).toBe(
      1
    ));
  it("reference = 1", () =>
    expect(getEntityWidth(testReference("x", "1"))).toBe(1));
  it("error = 1", () => expect(getEntityWidth(testError("x"))).toBe(1));
});

describe("getEntityWidth — arrays (sum + separators)", () => {
  it("empty array = 1", () => {
    expect(getEntityWidth(testArray([]))).toBe(1);
  });

  it("[1] = 1 + 1 = 2", () => {
    expect(getEntityWidth(testArray([numberStatement(1)]))).toBe(2);
  });

  it("[1, 2, 3] = 1 + 1+1+1 + 2*1(separators) = 6", () => {
    expect(
      getEntityWidth(
        testArray([numberStatement(1), numberStatement(2), numberStatement(3)])
      )
    ).toBe(1 + 3 + 2 * SEPARATOR_WIDTH);
  });

  it("array of short strings = 1 + sum + separators", () => {
    const arr = testArray([
      stringStatement("a"),
      stringStatement("b"),
      stringStatement("c"),
    ]);
    expect(getEntityWidth(arr)).toBe(1 + 3 + 2 * SEPARATOR_WIDTH);
  });

  it("array of medium strings (20 chars each) includes separator overhead", () => {
    const s = stringStatement("a".repeat(20));
    const arr = testArray([s, s, s]);
    expect(getEntityWidth(arr)).toBe(1 + 3 * 5 + 2 * SEPARATOR_WIDTH);
  });

  it("separator overhead grows with item count", () => {
    const arr5 = testArray(Array.from({ length: 5 }, () => numberStatement(1)));
    const arr10 = testArray(
      Array.from({ length: 10 }, () => numberStatement(1))
    );
    expect(getEntityWidth(arr10) - getEntityWidth(arr5)).toBe(
      5 + (9 - 4) * SEPARATOR_WIDTH
    );
  });

  it("deeply nested [[1]] = 1 + (1+1) = 3", () => {
    const inner = testArray([numberStatement(1)]);
    const outer = testArray([createStatement({ data: inner })]);
    expect(getEntityWidth(outer)).toBe(3);
  });
});

describe("getEntityWidth — objects (sum + key overhead + separators)", () => {
  it("empty object = 1", () => {
    expect(getEntityWidth(testObject([]))).toBe(1);
  });

  it("{a: 1} = 1 + (1+1) = 3", () => {
    expect(
      getEntityWidth(testObject([{ key: "a", value: numberStatement(1) }]))
    ).toBe(3);
  });

  it("{a: 1, b: 2} = 1 + 2*(1+1) + 1(sep) = 6", () => {
    expect(
      getEntityWidth(
        testObject([
          { key: "a", value: numberStatement(1) },
          { key: "b", value: numberStatement(2) },
        ])
      )
    ).toBe(1 + 2 * 2 + 1 * SEPARATOR_WIDTH);
  });

  it("nested {items: {a: 1, b: 2}} includes inner object width", () => {
    const innerObj = testObject([
      { key: "a", value: numberStatement(1) },
      { key: "b", value: numberStatement(2) },
    ]);
    const innerWidth = getEntityWidth(innerObj);
    const outer = testObject([
      { key: "items", value: createStatement({ data: innerObj }) },
    ]);
    expect(getEntityWidth(outer)).toBe(1 + 1 + innerWidth);
  });
});

describe("getEntityWidth — dictionaries", () => {
  it("empty = 1", () => expect(getEntityWidth(testDictionary([]))).toBe(1));
  it("1 simple entry = 1 + (1+1) = 3", () => {
    expect(
      getEntityWidth(
        testDictionary([{ key: "a", value: stringStatement("x") }])
      )
    ).toBe(3);
  });
});

describe("getEntityWidth — conditions", () => {
  it("all simple = 1 + 1 + 1 + 1 + 1 = 5", () => {
    expect(
      getEntityWidth(
        testCondition(
          booleanStatement(true),
          [stringStatement("y")],
          [stringStatement("n")]
        )
      )
    ).toBe(1 + 1 + 1 + 1 + 1);
  });

  it("complex true branch includes its width", () => {
    const obj = testObject([
      { key: "a", value: numberStatement(1) },
      { key: "b", value: numberStatement(2) },
    ]);
    const objWidth = getEntityWidth(obj);
    const cond = testCondition(
      booleanStatement(true),
      [createStatement({ data: obj })],
      [stringStatement("n")]
    );
    expect(getEntityWidth(cond)).toBe(1 + 1 + objWidth + 1 + 1);
  });
});

describe("getEntityWidth — instances", () => {
  it("no args = 1", () => {
    expect(
      getEntityWidth(
        createData({
          type: { kind: "instance", className: "Date", constructorArgs: [] },
        })
      )
    ).toBe(1);
  });

  it("1 simple arg contributes base width plus argument width", () => {
    const instance = createData({
      type: {
        kind: "instance",
        className: "Date",
        constructorArgs: [{ type: { kind: "string" } }],
      },
      value: {
        className: "Date",
        constructorArgs: [stringStatement("2024-01-01")],
        instanceId: "i1",
      },
    });
    expect(getEntityWidth(instance)).toBe(4);
  });

  it("2 simple args include separator", () => {
    const instance = createData({
      type: {
        kind: "instance",
        className: "Date",
        constructorArgs: [
          { type: { kind: "string" } },
          { type: { kind: "string" } },
        ],
      },
      value: {
        className: "Date",
        constructorArgs: [stringStatement("a"), stringStatement("b")],
        instanceId: "i2",
      },
    });
    expect(getEntityWidth(instance)).toBe(1 + 1 + 1 + SEPARATOR_WIDTH);
  });

  it("calculates width for operation data", () => {
    const op = testOperation([stringStatement("")], [stringStatement("")]);
    const width = getEntityWidth(op);
    expect(width).toBeGreaterThan(1);
  });

  it("calculates width for tuple data", () => {
    const tuple = testTuple([stringStatement("a")]);
    const width = getEntityWidth(tuple);
    expect(width).toBeGreaterThan(1);
  });
});

describe("getOperationCallWidth", () => {
  it("no params uses operation-call base width", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    expect(getOperationCallWidth(op)).toBe(2);
  });

  it("1 simple param = 1 + 1 = 2", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" } },
          { type: { kind: "number" } },
        ],
        result: { kind: "string" },
      },
      value: {
        name: "repeat",
        parameters: [numberStatement(3)],
        statements: [],
      },
    });
    expect(getOperationCallWidth(op)).toBe(2 + 1);
  });

  it("2 simple params include separator", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [
          { type: { kind: "string" } },
          { type: { kind: "number" } },
        ],
        result: { kind: "string" },
      },
      value: {
        name: "repeat",
        parameters: [stringStatement("a"), numberStatement(3)],
        statements: [],
      },
    });
    expect(getOperationCallWidth(op)).toBe(2 + 1 + 1 + SEPARATOR_WIDTH);
  });

  it("complex param contributes its full width", () => {
    const paramObj = testObject([
      { key: "a", value: numberStatement(1) },
      { key: "b", value: numberStatement(2) },
    ]);
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "object", properties: [] } }],
        result: { kind: "number" },
      },
      value: {
        name: "merge",
        parameters: [createStatement({ data: paramObj })],
        statements: [],
      },
    });
    expect(getOperationCallWidth(op)).toBe(2 + getEntityWidth(paramObj));
  });
});

describe("getStatementWidth", () => {
  it("simple data, no ops = 1", () => {
    expect(getStatementWidth(stringStatement("hi"))).toBe(1);
  });

  it("long string, no ops = string width", () => {
    expect(getStatementWidth(stringStatement("a".repeat(50)))).toBe(6);
  });

  it("simple data plus one no-param operation includes operation-call base width", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const stmt = createStatement({ data: testString("hi"), operations: [op] });
    expect(getStatementWidth(stmt)).toBe(3);
  });

  it("complex data + op with complex params sums widths", () => {
    const obj = testObject([
      { key: "a", value: numberStatement(1) },
      { key: "b", value: numberStatement(2) },
      { key: "c", value: numberStatement(3) },
    ]);
    const paramObj = testObject([
      { key: "x", value: numberStatement(10) },
      { key: "y", value: numberStatement(20) },
      { key: "z", value: numberStatement(30) },
    ]);
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "object", properties: [] } }],
        result: { kind: "number" },
      },
      value: {
        name: "merge",
        parameters: [createStatement({ data: paramObj })],
        statements: [],
      },
    });
    const stmt = createStatement({ data: obj, operations: [op] });
    const expected =
      getEntityWidth(obj) + 2 + getEntityWidth(paramObj) + 0 * SEPARATOR_WIDTH;
    expect(getStatementWidth(stmt)).toBe(expected);
  });
});

describe("isSimpleStatement", () => {
  it("simple data, no ops = true", () =>
    expect(isSimpleStatement(stringStatement("hi"))).toBe(true));
  it("simple data with ops = false", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    expect(
      isSimpleStatement(
        createStatement({ data: testString("hi"), operations: [op] })
      )
    ).toBe(false);
  });
  it("complex data = false", () =>
    expect(
      isSimpleStatement(
        createStatement({ data: testArray([stringStatement("a")]) })
      )
    ).toBe(false));
  it("long string with no ops = false", () =>
    expect(isSimpleStatement(stringStatement("a".repeat(70)))).toBe(false));
  it("simple number with no ops = true", () =>
    expect(isSimpleStatement(numberStatement(42))).toBe(true));
});

describe("getEntityLayout", () => {
  it("returns inline for simple data", () => {
    expect(getEntityLayout(testString("hello"))).toBe("inline");
  });

  it("returns inline for complex data under threshold", () => {
    expect(getEntityLayout(testArray([]))).toBe("inline");
  });

  it("returns multiline for complex data exceeding threshold", () => {
    const bigArray = testArray(
      Array.from({ length: 20 }, () => numberStatement(1))
    );
    expect(getEntityLayout(bigArray)).toBe("multiline");
  });

  it("returns inline when complex data width is just below threshold", () => {
    const items = Array.from({ length: 7 }, () => numberStatement(1));
    expect(getEntityWidth(testArray(items))).toBe(14);
    expect(getEntityLayout(testArray(items))).toBe("inline");
  });

  it("returns multiline when complex data width exceeds threshold", () => {
    const items = Array.from({ length: 8 }, () => numberStatement(1));
    expect(getEntityWidth(testArray(items))).toBe(16);
    expect(getEntityLayout(testArray(items))).toBe("multiline");
  });
});

describe("getEntityLayout with mobile threshold", () => {
  it("returns inline when complex data width is between mobile and desktop thresholds", () => {
    const items = Array.from({ length: 4 }, () => numberStatement(1));
    expect(getEntityWidth(testArray(items))).toBe(8);
    expect(getEntityLayout(testArray(items))).toBe("inline");
    expect(getEntityLayout(testArray(items), true)).toBe("multiline");
  });

  it("returns inline for simple data even with mobile threshold", () => {
    expect(getEntityLayout(testString("hello"), true)).toBe("inline");
  });
});

describe("getStatementLayout", () => {
  it("returns inline for short statement", () => {
    expect(getStatementLayout(stringStatement("hi"))).toBe("inline");
  });

  it("returns multiline for statement exceeding threshold", () => {
    const items = Array.from({ length: 20 }, () => numberStatement(1));
    const bigStmt = createStatement({ data: testArray(items) });
    expect(getStatementLayout(bigStmt)).toBe("multiline");
  });

  it("returns multiline for complex data plus operations", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    const bigArray = testArray(
      Array.from({ length: 10 }, () => numberStatement(1))
    );
    const stmt = createStatement({ data: bigArray, operations: [op] });
    expect(getStatementLayout(stmt)).toBe("multiline");
  });

  it("returns inline for statement with single short operation", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "string" },
      },
      value: { name: "log", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: testString("hi"),
      operations: [op],
    });
    expect(getStatementLayout(stmt)).toBe("inline");
  });
});

describe("getStatementLayout with mobile threshold", () => {
  it("returns multiline when statement width is between mobile and desktop thresholds", () => {
    const items = Array.from({ length: 4 }, () => numberStatement(1));
    const stmt = createStatement({ data: testArray(items) });
    expect(getStatementWidth(stmt)).toBe(8);
    expect(getStatementLayout(stmt)).toBe("inline");
    expect(getStatementLayout(stmt, true)).toBe("multiline");
  });
});

describe("getOperationCallLayout", () => {
  it("returns inline for no params", () => {
    const op = createData({
      type: {
        kind: "operation",
        parameters: [{ type: { kind: "string" } }],
        result: { kind: "number" },
      },
      value: { name: "length", parameters: [], statements: [] },
    });
    expect(getOperationCallLayout(op)).toBe("inline");
  });

  it("returns multiline for many params exceeding threshold", () => {
    const params = Array.from({ length: 20 }, () => numberStatement(1));
    const op = createData({
      type: {
        kind: "operation",
        parameters: params.map(() => ({ type: { kind: "number" } })),
        result: { kind: "number" },
      },
      value: { name: "sum", parameters: params, statements: [] },
    });
    expect(getOperationCallLayout(op)).toBe("multiline");
  });
});

describe("getOperationCallLayout with mobile threshold", () => {
  it("returns multiline when operation call width is between mobile and desktop thresholds", () => {
    const params = Array.from({ length: 4 }, () => numberStatement(1));
    const op = createData({
      type: {
        kind: "operation",
        parameters: params.map(() => ({ type: { kind: "number" } })),
        result: { kind: "number" },
      },
      value: { name: "sum", parameters: params, statements: [] },
    });
    expect(getOperationCallWidth(op)).toBe(9);
    expect(getOperationCallLayout(op)).toBe("inline");
    expect(getOperationCallLayout(op, true)).toBe("multiline");
  });
});

describe("getEntityWidth — union", () => {
  it("returns 1 for union type", () => {
    const data = createData({
      type: { kind: "union", types: [{ kind: "string" }, { kind: "number" }] },
    });
    expect(getEntityWidth(data)).toBe(1);
  });
});
