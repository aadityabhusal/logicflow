import { DeploymentFile } from "../types";

export function createPlatformFetch(platformPath: string) {
  const proxyBase = `${import.meta.env.VITE_API_PROXY_URL || "/api"}${platformPath}`;
  return async (
    path: string,
    token: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    return fetch(`${proxyBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(!(options.body instanceof FormData) && {
          "Content-Type": "application/json",
        }),
        ...options.headers,
      },
    });
  };
}

export async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.message || body.error || body.msg || `HTTP ${response.status}`;
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

const npmImportPattern = /from ['"]([a-z@][^'"]+)['"]/g;

export function prefixNpmImports<T extends DeploymentFile>(files: T[]): T[] {
  return files.map((file) => ({
    ...file,
    content: file.content.replace(npmImportPattern, (match, pkg) => {
      if (pkg.startsWith(".") || pkg.startsWith("npm:")) return match;
      return `from "npm:${pkg}"`;
    }),
  }));
}
