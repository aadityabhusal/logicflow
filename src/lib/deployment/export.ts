import { zipSync } from "fflate";
import type { DeploymentFile } from "../types";
import { deploymentFileBytes } from "./utils";

export function createExportZip(files: DeploymentFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.path] = deploymentFileBytes(file);
  }
  return zipSync(entries);
}

export function createDownloadName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-") || "project";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadExportZip(
  files: DeploymentFile[],
  projectName: string
) {
  const data = createExportZip(files);
  const blob = new Blob([data as BlobPart], { type: "application/zip" });
  downloadBlob(blob, `${createDownloadName(projectName)}.zip`);
}
