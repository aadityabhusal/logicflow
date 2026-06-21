import { describe, expect, it } from "vitest";
import {
  await as await_,
  pipeAsync,
  parseJSON,
  stringifyJSON,
} from "./runtime";

describe("pipeAsync", () => {
  it("passes promises through until await is reached", async () => {
    const promise = Promise.resolve("ok");

    const result = await pipeAsync(
      "start",
      () => promise,
      (arg) => {
        expect(arg).toBe(promise);
        return (arg as Promise<string>).then((value) => `${value}!`);
      },
      await_
    );

    expect(result).toBe("ok!");
  });

  it("resolves before the operation after await", async () => {
    const result = await pipeAsync(
      "start",
      () => Promise.resolve("ok"),
      await_,
      (arg) => `${arg}!`
    );

    expect(result).toBe("ok!");
  });

  it("propagates promise rejections from await", async () => {
    await expect(
      pipeAsync(
        "start",
        () => Promise.reject(new Error("boom")),
        await_,
        () => "unreachable"
      )
    ).rejects.toThrow("boom");
  });

  it("supports multiple explicit await boundaries", async () => {
    const result = await pipeAsync(
      1,
      (value) => Promise.resolve(Number(value) + 1),
      await_,
      (value) => Promise.resolve(Number(value) * 2),
      await_
    );

    expect(result).toBe(4);
  });
});

describe("parseJSON", () => {
  it("parses an object string into a plain object", () => {
    const result = parseJSON('{"a":1,"b":"x"}');
    expect(result).toEqual({ a: 1, b: "x" });
  });

  it("parses an array string into an array", () => {
    const result = parseJSON("[1,2,3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("parses primitives", () => {
    expect(parseJSON("42")).toBe(42);
    expect(parseJSON("true")).toBe(true);
    expect(parseJSON("null")).toBe(null);
  });

  it("invokes the reviver for each value", () => {
    const seen: [string, unknown][] = [];
    const result = parseJSON('{"a":1,"b":2}', (key, value) => {
      seen.push([key, value]);
      return typeof value === "number" ? value * 10 : value;
    });
    expect(result).toEqual({ a: 10, b: 20 });
    expect(seen).toContainEqual(["a", 1]);
    expect(seen).toContainEqual(["b", 2]);
    expect(seen.at(-1)).toEqual(["", { a: 10, b: 20 }]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJSON("{not json}")).toThrow(SyntaxError);
  });
});

describe("stringifyJSON", () => {
  it("stringifies an object", () => {
    expect(stringifyJSON({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
  });

  it("stringifies an array", () => {
    expect(stringifyJSON([1, 2, 3])).toBe("[1,2,3]");
  });

  it("stringifies a primitive", () => {
    expect(stringifyJSON(42)).toBe("42");
    expect(stringifyJSON("hi")).toBe('"hi"');
    expect(stringifyJSON(true)).toBe("true");
  });

  it("applies numeric space for pretty-printing", () => {
    const result = stringifyJSON({ a: 1 }, undefined, 2);
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it("applies string space for pretty-printing", () => {
    const result = stringifyJSON({ a: 1 }, undefined, "\t");
    expect(result).toBe('{\n\t"a": 1\n}');
  });

  it("uses an array replacer as a key whitelist", () => {
    const result = stringifyJSON({ a: 1, b: 2, c: 3 }, ["a", "c"]);
    expect(result).toBe('{"a":1,"c":3}');
  });

  it("uses a function replacer to transform values", () => {
    const result = stringifyJSON({ a: 1, b: 2 }, (_key, value) =>
      typeof value === "number" ? value + 1 : value
    );
    expect(result).toBe('{"a":2,"b":3}');
  });

  it("throws on circular references", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(() => stringifyJSON(obj)).toThrow(TypeError);
  });

  it("omits functions and undefined values", () => {
    const result = stringifyJSON({ a: 1, fn: () => 0, u: undefined });
    expect(result).toBe('{"a":1}');
  });
});
