import { describe, expect, it } from "vitest";
import { await as await_, pipeAsync } from "./runtime";

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
});
