import { beforeEach, describe, expect, it, vi } from "vitest";

const idb = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("idb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("idb")>();
  return { ...actual, openDB: vi.fn(() => Promise.resolve(idb)) };
});

import { createIDbStorage } from "./idb";

beforeEach(() => {
  vi.clearAllMocks();
  idb.get.mockResolvedValue(undefined);
  idb.put.mockResolvedValue(undefined);
  idb.delete.mockResolvedValue(undefined);
});

describe("IndexedDB storage", () => {
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
});
