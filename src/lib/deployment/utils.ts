import builtInModuleCode from "logicflow:source/built-in";
import ffmpegModuleCode from "logicflow:source/virtual/ffmpeg";
import { DeploymentFile } from "../types";

const virtualPackageModules: Record<string, string> = {
  ffmpeg: ffmpegModuleCode,
};

export { virtualPackageModules };

export function generateBuiltInModule(): string {
  return builtInModuleCode;
}

export function createPlatformFetch(platformPath: string) {
  const proxyBase = `${import.meta.env.VITE_API_PROXY_URL || "/api"}${platformPath}`;
  return async (
    path: string,
    token: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const defaultHeaders = {
      Authorization: `Bearer ${token}`,
      ...(!(options.body instanceof FormData) && {
        "Content-Type": "application/json",
      }),
    };
    return fetch(`${proxyBase}${path}`, {
      ...options,
      headers: mergeHeaders(defaultHeaders, options.headers),
    });
  };
}

function headerEntries(headers?: HeadersInit): [string, string][] {
  if (!headers) return [];
  if (headers instanceof Headers) return [...headers.entries()];
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers);
}

function mergeHeaders(
  defaults: Record<string, string>,
  headers?: HeadersInit
): Record<string, string> {
  const result = { ...defaults };
  for (const [key, value] of headerEntries(headers)) {
    const existingKey = Object.keys(result).find(
      (existing) => existing.toLowerCase() === key.toLowerCase()
    );
    if (existingKey) delete result[existingKey];
    result[key] = value;
  }
  return result;
}

export async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message =
      body.message ||
      (typeof body.error === "string" ? body.error : body.error?.message) ||
      body.msg ||
      `HTTP ${response.status}`;
    return String(message);
  } catch {
    return `HTTP ${response.status}: ${response.statusText}`;
  }
}

export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const npmImportPattern =
  /\bfrom\s+['"]((?!npm:|node:|https?:|data:|\.{1,2}\/|\/)[a-z@][^'"]*)['"]/g;

export function prefixNpmImports<T extends DeploymentFile>(files: T[]): T[] {
  return files.map((file) => ({
    ...file,
    content: file.content.replace(npmImportPattern, (match, pkg) => {
      if (pkg.startsWith(".") || pkg.startsWith("npm:")) return match;
      return `from "npm:${pkg}"`;
    }),
  }));
}
