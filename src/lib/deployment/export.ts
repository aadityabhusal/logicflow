import { zipSync } from "fflate";
import type { DeploymentFile } from "../types";
import { deploymentFileBytes } from "./utils";

function assertSafeZipPath(path: string) {
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`Unsafe export path: ${path}`);
  }
}

export function createExportZip(files: DeploymentFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  const seen = new Set<string>();
  for (const file of files) {
    assertSafeZipPath(file.path);
    if (seen.has(file.path))
      throw new Error(`Duplicate export path: ${file.path}`);
    seen.add(file.path);
    entries[file.path] = deploymentFileBytes(file);
  }
  return zipSync(entries);
}

export function createDownloadName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export function downloadExportZip(
  files: DeploymentFile[],
  projectName: string
) {
  const data = createExportZip(files);
  const blob = new Blob([data as BlobPart], { type: "application/zip" });
  downloadBlob(blob, `${createDownloadName(projectName)}.zip`);
}
