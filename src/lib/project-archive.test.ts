import { describe, expect, it, vi, beforeEach } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createTestProject } from "@/tests/helpers";

const fileAssetMocks = vi.hoisted(() => ({
  saveFileAsset: vi.fn(async () => undefined),
}));

vi.mock("idb", () => ({
  openDB: () =>
    Promise.resolve({
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    }),
}));

vi.mock("@/lib/file-assets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-assets")>();
  return { ...actual, saveFileAsset: fileAssetMocks.saveFileAsset };
});

import { importProjectFile } from "@/lib/project-archive";

function createArchiveFile(entries: Record<string, Uint8Array>): File {
  const archive = zipSync(entries);
  return {
    arrayBuffer: async () =>
      archive.buffer.slice(
        archive.byteOffset,
        archive.byteOffset + archive.byteLength
      ),
  } as File;
}

describe("importProjectFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores manifest assets and ignores unmanifested asset files", async () => {
    const project = createTestProject();
    const file = createArchiveFile({
      "project.json": strToU8(JSON.stringify(project)),
      "assets/manifest.json": strToU8(
        JSON.stringify({
          "file-1": {
            path: "assets/file-1.txt",
            name: "hello.txt",
            type: "text/plain",
            size: 5,
            lastModified: 123,
          },
        })
      ),
      "assets/file-1.txt": strToU8("hello"),
      "assets/orphan.txt": strToU8("ignored"),
    });

    const imported = await importProjectFile(file);

    expect(imported.name).toBe(project.name);
    expect(fileAssetMocks.saveFileAsset).toHaveBeenCalledTimes(1);
    expect(fileAssetMocks.saveFileAsset).toHaveBeenCalledWith(
      "file-1",
      expect.objectContaining({
        name: "hello.txt",
        type: "text/plain",
        lastModified: 123,
      })
    );
  });
});
