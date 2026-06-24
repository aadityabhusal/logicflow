import { IData, InstanceDataType, ProjectFile } from "./types";
import { createOperationFromFile, isDataOfType } from "./utils";
import { walkData } from "./walk";
import { IDbStore } from "./idb";

export type FileAssetMeta = {
  path: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
};

export function isFileInstanceData(
  data: IData
): data is IData<InstanceDataType> {
  return (
    isDataOfType(data, "instance") &&
    data.type.className === "File" &&
    Boolean(data.value.instanceId)
  );
}

export function getAssetExtension(name: string): string {
  const match = name.match(/\.([a-zA-Z0-9]{1,16})$/);
  return match ? `.${match[1]}` : "";
}

export function getProjectAssetPath(id: string, name: string): string {
  return `assets/${id}${getAssetExtension(name)}`;
}

export function getPublicAssetPath(id: string, name: string): string {
  return `/assets/${id}${getAssetExtension(name)}`;
}

export function getFileMeta(path: string, file: File): FileAssetMeta {
  return {
    path,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  };
}

export type FileAsset = { file: File; createdAt: number };

export async function saveFileAsset(id: string, file: File) {
  const asset: FileAsset = { file, createdAt: Date.now() };
  await (await IDbStore).put("fileAssets", asset, id);
  return asset;
}

export async function getFileAsset(id: string): Promise<FileAsset | undefined> {
  return (await IDbStore).get("fileAssets", id);
}

export async function deleteFileAsset(id: string) {
  await (await IDbStore).delete("fileAssets", id);
}

export function collectFileInstanceIds(files: ProjectFile[]): string[] {
  const ids = new Set<string>();
  const collect = (data: IData) => {
    if (isFileInstanceData(data)) ids.add(data.value.instanceId);
  };
  const walkOptions = { nestedOperations: true, operationCalls: true };
  for (const file of files) {
    const op = createOperationFromFile(file);
    if (op) walkData(op, { onInstance: collect }, walkOptions);
  }
  return [...ids];
}
