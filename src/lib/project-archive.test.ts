import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createOperationFile, createTestProject } from "@/tests/helpers";
import { createData, createStatement } from "./utils";

const fileAssetMocks = vi.hoisted(() => ({
  getFileAsset: vi.fn(),
  saveFileAsset: vi.fn(async () => undefined),
}));

const exportMocks = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
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
  return {
    ...actual,
    getFileAsset: fileAssetMocks.getFileAsset,
    saveFileAsset: fileAssetMocks.saveFileAsset,
  };
});

vi.mock("@/lib/deployment/export", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/deployment/export")>();
  return { ...actual, downloadBlob: exportMocks.downloadBlob };
});

import {
  exportProjectWithAssets,
  importProjectFile,
} from "@/lib/project-archive";

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

function fileInstanceStatement(instanceId: string) {
  return createStatement({
    data: createData({
      type: { kind: "instance", className: "File", constructorArgs: [] },
      value: { className: "File", constructorArgs: [], instanceId },
    }),
  });
}

describe("exportProjectWithAssets", () => {
  beforeEach(() => {
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal("File", NodeFile);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports the project, manifest, and referenced file assets", async () => {
    const assetFile = new File([new Uint8Array([0, 255, 10])], "data.bin", {
      type: "application/octet-stream",
      lastModified: 123,
    });
    fileAssetMocks.getFileAsset.mockResolvedValue({
      file: assetFile,
      createdAt: 1,
    });

    const operationFile = createOperationFile("useFile");
    operationFile.content.value.statements = [fileInstanceStatement("file-1")];
    const project = createTestProject({
      name: "Asset Project",
      files: [operationFile],
    });

    await exportProjectWithAssets(project);

    expect(fileAssetMocks.getFileAsset).toHaveBeenCalledWith("file-1");
    expect(exportMocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "asset-project.logicflow.zip"
    );

    const blob = exportMocks.downloadBlob.mock.calls[0][0] as Blob;
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries["assets/manifest.json"]));

    expect(JSON.parse(strFromU8(entries["project.json"])).name).toBe(
      "Asset Project"
    );
    expect(manifest["file-1"]).toMatchObject({
      path: "assets/file-1.bin",
      name: "data.bin",
      type: "application/octet-stream",
      size: 3,
      lastModified: 123,
    });
    expect(Array.from(entries["assets/file-1.bin"])).toEqual([0, 255, 10]);
  });
});

describe("importProjectFile", () => {
  beforeEach(() => {
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal("File", NodeFile);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    const saveFileCalls = fileAssetMocks.saveFileAsset.mock
      .calls as unknown as [[string, File]];
    const savedFile = saveFileCalls[0][1];
    expect(await savedFile.text()).toBe("hello");
  });

  it("imports legacy plain JSON project files", async () => {
    const project = createTestProject({ name: "Legacy" });

    const imported = await importProjectFile(
      new File([JSON.stringify(project)], "project.logicflow")
    );

    expect(imported).toMatchObject({ id: project.id, name: "Legacy" });
    expect(fileAssetMocks.saveFileAsset).not.toHaveBeenCalled();
  });

  it("rejects zip archives without project.json", async () => {
    await expect(
      importProjectFile(
        createArchiveFile({ "assets/manifest.json": strToU8("{}") })
      )
    ).rejects.toThrow("Invalid project archive: missing project.json");
  });

  it("skips manifest entries whose asset file is missing", async () => {
    const project = createTestProject();
    const file = createArchiveFile({
      "project.json": strToU8(JSON.stringify(project)),
      "assets/manifest.json": strToU8(
        JSON.stringify({
          "file-1": {
            path: "assets/missing.txt",
            name: "missing.txt",
            type: "text/plain",
            size: 5,
            lastModified: 123,
          },
        })
      ),
    });

    const imported = await importProjectFile(file);

    expect(imported.id).toBe(project.id);
    expect(fileAssetMocks.saveFileAsset).not.toHaveBeenCalled();
  });
});
