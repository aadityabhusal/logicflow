import { zipSync } from "fflate";
import type { DeploymentFile } from "../types";

export function createExportZip(files: DeploymentFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.path] = new TextEncoder().encode(file.content);
  }
  return zipSync(entries);
}

export function downloadExportZip(
  files: DeploymentFile[],
  projectName: string
) {
  const data = createExportZip(files);
  const blob = new Blob([data as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);

  const name = projectName.toLowerCase().replace(/\s+/g, "-") || "project";
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
