import { describe, it, expect, beforeEach, vi } from "vitest";

const idbMocks = vi.hoisted(() => ({
  get: vi.fn<() => Promise<unknown>>(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
  getAllKeys: vi.fn(async () => []),
}));

vi.mock("idb", () => ({
  openDB: () =>
    Promise.resolve({
      get: idbMocks.get,
      put: idbMocks.put,
      delete: idbMocks.delete,
      getAllKeys: idbMocks.getAllKeys,
    }),
}));

import {
  createTestContext,
  createTestProject,
  createOperationFile,
} from "@/tests/helpers";
import { createData, createStatement, createDefaultValue } from "@/lib/utils";
import { executeStatement } from "@/lib/execution/execution";
import { getAllInstanceTypes } from "@/lib/packages/registry";
import type { InstanceDataType, OperationType } from "@/lib/types";
import { getRawValueFromData } from "./utils";
import {
  collectFileInstanceIds,
  deleteFileAsset,
  getAssetExtension,
  getFileAsset,
  getFileMeta,
  getProjectAssetPath,
  getPublicAssetPath,
  isFileInstanceData,
  saveFileAsset,
} from "./file-assets";

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockFile(content: string, name: string, type: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  return {
    name,
    size: bytes.length,
    type,
    lastModified: Date.now(),
    text: () => Promise.resolve(content),
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  } as unknown as File;
}

function createMockBlob(content: string, type: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  return {
    size: bytes.length,
    type,
    text: () => Promise.resolve(content),
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  } as unknown as Blob;
}

function createFileData(instanceId: string, className = "File") {
  return createData({
    type: { kind: "instance", className, constructorArgs: [] },
    value: { className, instanceId, constructorArgs: [] },
  });
}

describe("asset helpers", () => {
  it("identifies File instance data with a stored instance id", () => {
    expect(isFileInstanceData(createFileData("file-1"))).toBe(true);
    expect(isFileInstanceData(createFileData("", "File"))).toBe(false);
    expect(isFileInstanceData(createFileData("blob-1", "Blob"))).toBe(false);
  });

  it("derives safe asset extensions from filenames", () => {
    expect(getAssetExtension("photo.PNG")).toBe(".PNG");
    expect(getAssetExtension("archive.tar.gz")).toBe(".gz");
    expect(getAssetExtension("README")).toBe("");
    expect(getAssetExtension("file.abcdefghijklmnop")).toBe(
      ".abcdefghijklmnop"
    );
    expect(getAssetExtension("file.abcdefghijklmnopq")).toBe("");
  });

  it("builds project and public asset paths from ids and filenames", () => {
    expect(getProjectAssetPath("file-1", "photo.png")).toBe(
      "assets/file-1.png"
    );
    expect(getPublicAssetPath("file-1", "photo.png")).toBe(
      "/assets/file-1.png"
    );
    expect(getProjectAssetPath("file-1", "README")).toBe("assets/file-1");
  });

  it("captures file metadata for manifests", () => {
    const file = new File(["hello"], "hello.txt", {
      type: "text/plain",
      lastModified: 123,
    });

    expect(getFileMeta("assets/file-1.txt", file)).toEqual({
      path: "assets/file-1.txt",
      name: "hello.txt",
      type: "text/plain",
      size: 5,
      lastModified: 123,
    });
  });

  it("saves, loads, and deletes file assets through IndexedDB", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const saved = await saveFileAsset("file-1", file);

    expect(saved.file).toBe(file);
    expect(idbMocks.put).toHaveBeenCalledWith("fileAssets", saved, "file-1");

    idbMocks.get.mockResolvedValueOnce(saved);
    await expect(getFileAsset("file-1")).resolves.toBe(saved);
    expect(idbMocks.get).toHaveBeenCalledWith("fileAssets", "file-1");

    await deleteFileAsset("file-1");
    expect(idbMocks.delete).toHaveBeenCalledWith("fileAssets", "file-1");
  });
});

describe("File instance type", () => {
  it("is registered in InstanceTypes", () => {
    const types = getAllInstanceTypes();
    expect(types["File"]).toBeDefined();
    expect(types["File"].Constructor).toBe(File);
    expect(types["File"].constructorArgs).toEqual([]);
  });

  it("is not hidden from dropdown", () => {
    const types = getAllInstanceTypes();
    expect(types["File"].hideFromDropdown).toBeFalsy();
  });

  it("Blob is registered and hidden from dropdown", () => {
    const types = getAllInstanceTypes();
    expect(types["Blob"]).toBeDefined();
    expect(types["Blob"].hideFromDropdown).toBe(true);
  });

  it("ArrayBuffer is registered and hidden from dropdown", () => {
    const types = getAllInstanceTypes();
    expect(types["ArrayBuffer"]).toBeDefined();
    expect(types["ArrayBuffer"].hideFromDropdown).toBe(true);
  });

  it("createDefaultValue returns empty constructorArgs with instanceId", () => {
    const fileType: InstanceDataType = {
      kind: "instance",
      className: "File",
      constructorArgs: [],
    };
    const value = createDefaultValue(fileType) as {
      className: string;
      instanceId: string;
      constructorArgs: unknown[];
    };
    expect(value.className).toBe("File");
    expect(value.instanceId).toBeDefined();
    expect(value.constructorArgs).toEqual([]);
  });
});

describe("File operations", () => {
  const ctx = createTestContext({ isSync: false });
  const testFile = createMockFile("hello world", "test.txt", "text/plain");
  const fileInstanceId = "file-test-1";
  const fileDataType: InstanceDataType = {
    kind: "instance",
    className: "File",
    constructorArgs: [],
  };
  const fileData = createData({
    type: fileDataType,
    value: {
      className: "File",
      instanceId: fileInstanceId,
      constructorArgs: [],
    },
  });

  beforeEach(() => {
    ctx.setInstance(fileInstanceId, {
      instance: testFile,
      type: fileDataType,
    });
  });

  async function runFileOp(opName: string, data = fileData) {
    const op = createData<OperationType>({
      id: `op-${opName}`,
      type: {
        kind: "operation",
        parameters: [
          {
            type: { kind: "instance", className: "File", constructorArgs: [] },
          },
        ],
        result: { kind: "unknown" },
      },
      value: { name: opName, parameters: [], statements: [] },
    });
    const stmt = createStatement({ data, operations: [op] });
    return executeStatement(stmt, ctx);
  }

  it("getName returns file name", async () => {
    const result = await runFileOp("getName");
    expect(result.value).toBe("test.txt");
  });

  it("getSize returns file size", async () => {
    const result = await runFileOp("getSize");
    expect(result.value).toBe(11);
  });

  it("getType returns file MIME type", async () => {
    const result = await runFileOp("getType");
    expect(result.value).toBe("text/plain");
  });

  it("text returns file contents as string via await", async () => {
    const textOp = createData<OperationType>({
      id: "op-text",
      type: {
        kind: "operation",
        parameters: [
          {
            type: { kind: "instance", className: "File", constructorArgs: [] },
          },
        ],
        result: { kind: "string" },
      },
      value: { name: "text", parameters: [], statements: [] },
    });
    const awaitOp = createData<OperationType>({
      id: "op-await",
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "Promise",
              constructorArgs: [],
            },
          },
        ],
        result: { kind: "string" },
      },
      value: { name: "await", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: fileData,
      operations: [textOp, awaitOp],
    });
    const result = await executeStatement(stmt, ctx);
    expect(result.value).toBe("hello world");
  });

  it("arrayBuffer returns file contents via await", async () => {
    const arrayBufferOp = createData<OperationType>({
      id: "op-arraybuffer",
      type: {
        kind: "operation",
        parameters: [
          {
            type: { kind: "instance", className: "File", constructorArgs: [] },
          },
        ],
        result: { kind: "unknown" },
      },
      value: { name: "arrayBuffer", parameters: [], statements: [] },
    });
    const awaitOp = createData<OperationType>({
      id: "op-await-ab",
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "Promise",
              constructorArgs: [],
            },
          },
        ],
        result: { kind: "unknown" },
      },
      value: { name: "await", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: fileData,
      operations: [arrayBufferOp, awaitOp],
    });
    const result = await executeStatement(stmt, ctx);
    expect(result.type).toMatchObject({
      kind: "instance",
      className: "ArrayBuffer",
    });
    expect(
      new TextDecoder().decode(getRawValueFromData(result, ctx) as ArrayBuffer)
    ).toBe("hello world");
  });
});

describe("Blob operations", () => {
  const ctx = createTestContext({ isSync: false });
  const testBlob = createMockBlob("blob content", "text/plain");
  const blobInstanceId = "blob-test-1";
  const blobDataType: InstanceDataType = {
    kind: "instance",
    className: "Blob",
    constructorArgs: [],
  };
  const blobData = createData({
    type: blobDataType,
    value: {
      className: "Blob",
      instanceId: blobInstanceId,
      constructorArgs: [],
    },
  });

  it("getSize returns blob size", async () => {
    ctx.setInstance(blobInstanceId, {
      instance: testBlob,
      type: blobDataType,
    });
    const op = createData<OperationType>({
      id: "op-blob-size",
      type: {
        kind: "operation",
        parameters: [
          {
            type: { kind: "instance", className: "Blob", constructorArgs: [] },
          },
        ],
        result: { kind: "number" },
      },
      value: { name: "getSize", parameters: [], statements: [] },
    });
    const stmt = createStatement({ data: blobData, operations: [op] });
    const result = await executeStatement(stmt, ctx);
    expect(result.value).toBe(12);
  });

  it("text returns blob contents via await", async () => {
    ctx.setInstance(blobInstanceId, {
      instance: testBlob,
      type: blobDataType,
    });
    const textOp = createData<OperationType>({
      id: "op-blob-text",
      type: {
        kind: "operation",
        parameters: [
          {
            type: { kind: "instance", className: "Blob", constructorArgs: [] },
          },
        ],
        result: { kind: "string" },
      },
      value: { name: "text", parameters: [], statements: [] },
    });
    const awaitOp = createData<OperationType>({
      id: "op-blob-await",
      type: {
        kind: "operation",
        parameters: [
          {
            type: {
              kind: "instance",
              className: "Promise",
              constructorArgs: [],
            },
          },
        ],
        result: { kind: "string" },
      },
      value: { name: "await", parameters: [], statements: [] },
    });
    const stmt = createStatement({
      data: blobData,
      operations: [textOp, awaitOp],
    });
    const result = await executeStatement(stmt, ctx);
    expect(result.value).toBe("blob content");
  });
});

describe("collectProjectFileInstanceIds", () => {
  it("collects File instance IDs from project operations", () => {
    const fileType: InstanceDataType = {
      kind: "instance",
      className: "File",
      constructorArgs: [],
    };
    const fileData = createData({
      type: fileType,
      value: {
        className: "File",
        instanceId: "file-1",
        constructorArgs: [],
      },
    });
    const stmt = createStatement({ data: fileData });
    const op = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [],
        result: { kind: "unknown" },
      },
      value: { parameters: [], statements: [stmt] },
    });
    const file = {
      id: "f1",
      name: "myop",
      type: "operation" as const,
      createdAt: 0,
      content: { type: op.type, value: op.value },
    };
    const project = createTestProject({ files: [file] });
    const ids = collectFileInstanceIds(project.files);
    expect(ids).toContain("file-1");
  });

  it("returns empty array for project with no File instances", () => {
    const project = createTestProject({
      files: [createOperationFile("myop")],
    });
    const ids = collectFileInstanceIds(project.files);
    expect(ids).toEqual([]);
  });

  it("deduplicates File instance IDs across nested operation data", () => {
    const fileType: InstanceDataType = {
      kind: "instance",
      className: "File",
      constructorArgs: [],
    };
    const fileStmt = createStatement({ data: createFileData("file-1") });
    const nestedOperation = createData<OperationType>({
      type: {
        kind: "operation",
        parameters: [{ type: fileType }],
        result: { kind: "undefined" },
      },
      value: { parameters: [fileStmt], statements: [fileStmt] },
    });
    const operationFile = createOperationFile("usesFiles");
    operationFile.content.value.statements = [
      createStatement({ data: nestedOperation }),
    ];

    expect(collectFileInstanceIds([operationFile])).toEqual(["file-1"]);
  });

  it("ignores File instances in non-operation files", () => {
    expect(
      collectFileInstanceIds([
        {
          id: "globals",
          name: "globals",
          type: "globals",
          createdAt: 0,
          content: { upload: createFileData("file-1") },
        },
      ])
    ).toEqual([]);
  });
});
