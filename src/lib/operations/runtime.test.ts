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
