import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";
import { Project } from "./types";
import { ProjectSchema } from "./schemas";
import { downloadBlob, createDownloadName } from "./deployment/export";
import {
  FileAssetMeta,
  getFileMeta,
  getProjectAssetPath,
  getFileAsset,
  saveFileAsset,
  collectFileInstanceIds,
} from "./file-assets";

export async function exportProjectWithAssets(project: Project): Promise<void> {
  const config = JSON.stringify(ProjectSchema.parse(project), null, 2);
  const entries: Record<string, Uint8Array> = {
    "project.json": strToU8(config),
  };

  const fileIds = collectFileInstanceIds(project.files);
  const manifest: Record<string, FileAssetMeta> = {};

  for (const id of fileIds) {
    const asset = await getFileAsset(id);
    if (!asset) continue;
    const path = getProjectAssetPath(id, asset.file.name);
    const blobBytes = new Uint8Array(await asset.file.arrayBuffer());
    entries[path] = blobBytes;
    manifest[id] = getFileMeta(path, asset.file);
  }

  entries["assets/manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(entries);
  const blob = new Blob([zipped as BlobPart], { type: "application/zip" });
  downloadBlob(blob, `${createDownloadName(project.name)}.logicflow.zip`);
}

function isZipFile(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
}

export async function importProjectFile(file: File): Promise<Project> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!isZipFile(bytes)) {
    return ProjectSchema.parse(JSON.parse(strFromU8(bytes))) as Project;
  }

  const unzipped = unzipSync(bytes);
  const projectJson = unzipped["project.json"];
  if (!projectJson)
    throw new Error("Invalid project archive: missing project.json");

  const project = ProjectSchema.parse(
    JSON.parse(strFromU8(projectJson))
  ) as Project;

  const manifestJson = unzipped["assets/manifest.json"];
  const manifest: Record<string, FileAssetMeta> = manifestJson
    ? JSON.parse(strFromU8(manifestJson))
    : {};

  for (const [id, meta] of Object.entries(manifest)) {
    const data = unzipped[meta.path];
    if (!data) continue;
    await saveFileAsset(
      id,
      new File([data as BlobPart], meta.name, {
        type: meta.type,
        lastModified: meta.lastModified,
      })
    );
  }

  return project;
}
