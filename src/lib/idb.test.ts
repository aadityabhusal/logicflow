import { beforeEach, describe, expect, it, vi } from "vitest";

const idb = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));
const openDB = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve(idb)),
);

vi.mock("idb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("idb")>();
  return { ...actual, openDB };
});

import { commitAgentEdit, createIDbStorage } from "./idb";

beforeEach(() => {
  idb.get.mockReset();
  idb.put.mockReset();
  idb.delete.mockReset();
  idb.get.mockResolvedValue(undefined);
  idb.put.mockResolvedValue(undefined);
  idb.delete.mockResolvedValue(undefined);
  idb.transaction.mockReset();
});

describe("IndexedDB storage", () => {
  it("keeps database version 7 without creating obsolete stores", () => {
    const [, version, options] = openDB.mock.calls[0] as [
      string,
      number,
      { upgrade: (db: unknown) => void },
    ];
    const createObjectStore = vi.fn();
    options.upgrade({
      objectStoreNames: { contains: () => true },
      createObjectStore,
    });

    expect(version).toBe(7);
    expect(createObjectStore).not.toHaveBeenCalled();
  });

  it("reports storage write failures", async () => {
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(vi.fn());
    idb.put.mockRejectedValueOnce(new Error("write failed"));

    await createIDbStorage("agentProjects", onError)!.setItem("agent", {
      state: {},
      version: 0,
    });

    expect(onError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("commits project and agent documents in one transaction", async () => {
    const put = vi.fn(async () => undefined);
    const transaction = {
      objectStore: vi.fn(() => ({ put })),
      done: Promise.resolve(),
    };
    idb.transaction.mockReturnValue(transaction);

    await commitAgentEdit(
      { project: true },
      { agent: true },
      {
        apiKeys: { openai: "key" },
        selectedModel: "gpt-5.6-terra",
        thinkingLevel: "high",
      },
    );

    expect(idb.transaction).toHaveBeenCalledWith(
      ["projects", "agentProjects"],
      "readwrite",
    );
    expect(put).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({
        state: { projects: { project: true } },
        version: 0,
      }),
      "projects",
    );
    expect(put).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({
        state: {
          apiKeys: { openai: "key" },
          selectedModel: "gpt-5.6-terra",
          thinkingLevel: "high",
          agentProjects: { agent: true },
        },
        version: 0,
      }),
      "agent",
    );
  });

  it("surfaces transaction failures", async () => {
    const transaction = {
      objectStore: vi.fn(() => ({
        put: vi.fn(async () => {
          throw new Error("write failed");
        }),
      })),
      done: Promise.resolve(),
    };
    idb.transaction.mockReturnValue(transaction);

    await expect(
      commitAgentEdit(
        {},
        {},
        {
          apiKeys: {},
          selectedModel: "gpt-5.6-sol",
          thinkingLevel: "medium",
        },
      ),
    ).rejects.toThrow("write failed");
  });
});
