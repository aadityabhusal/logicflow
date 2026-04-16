import {
  DeploymentFile,
  DeploymentResult,
  DeploymentProgress,
} from "../../types";
import { createPlatformFetch, parseError } from "../utils";

const vercelFetch = createPlatformFetch("/api/vercel");

type VercelDeploymentResponse = {
  id: string;
  url: string;
  readyState:
    | "QUEUED"
    | "BUILDING"
    | "INITIALIZING"
    | "READY"
    | "ERROR"
    | "CANCELED";
  projectId: string;
  errorMessage?: string;
  inspectorUrl?: string;
};

export async function deployToVercel(
  files: DeploymentFile[],
  token: string,
  options: {
    projectName: string;
    projectId?: string;
    triggerNames: string[];
    envVars?: { key: string; value: string }[];
  },
  onProgress?: (progress: DeploymentProgress) => void
): Promise<DeploymentResult> {
  onProgress?.({ stage: "uploading", message: "Uploading files to Vercel..." });

  const body = {
    name: options.projectName,
    files: files.map((f) => ({
      file: f.path,
      data: f.content,
      encoding: "utf-8",
    })),
    projectSettings: { installCommand: "npm install" },
    target: "production",
    ...(options.projectId ? { project: options.projectId } : {}),
  };

  let response: Response;
  try {
    response = await vercelFetch("/v13/deployments", token, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  if (!response.ok) {
    return { success: false, error: await parseError(response) };
  }

  const deployment: VercelDeploymentResponse = await response.json();

  if (options.envVars?.length && deployment.projectId) {
    onProgress?.({ stage: "uploading", message: "Setting env variables..." });
    await setVercelEnvVars(deployment.projectId, token, options.envVars);
  }

  onProgress?.({ stage: "building", message: "Building..." });

  const result = await pollVercelDeployment(deployment.id, token, onProgress);

  return {
    ...result,
    id: deployment.id,
    projectId: deployment.projectId,
    triggerUrls: result.url
      ? options.triggerNames.map((n) => `${result.url}/api/${n}`)
      : undefined,
    dashboardUrl: deployment.inspectorUrl,
  };
}

async function pollVercelDeployment(
  deploymentId: string,
  token: string,
  onProgress?: (progress: DeploymentProgress) => void
): Promise<DeploymentResult> {
  const maxAttempts = 9;
  const interval = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((r) => setTimeout(r, interval));

      const res = await vercelFetch(`/v13/deployments/${deploymentId}`, token);
      if (!res.ok) {
        return {
          success: false,
          error: `Failed to check deployment status: HTTP ${res.status}`,
        };
      }

      const status: VercelDeploymentResponse = await res.json();

      if (status.readyState === "READY") {
        const url = `https://${status.url}`;
        onProgress?.({ stage: "ready", url });
        return { success: true, url, state: "ready" };
      }

      if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
        const errorMsg = status.errorMessage || "Build failed on Vercel";
        onProgress?.({ stage: "error", message: errorMsg });
        return { success: false, error: errorMsg, state: "error" };
      }

      onProgress?.({ stage: "building", message: "Building..." });
    } catch {
      continue;
    }
  }

  return { success: false, error: "Deployment timed out" };
}

async function setVercelEnvVars(
  projectId: string,
  token: string,
  envVars: { key: string; value: string }[]
): Promise<void> {
  await Promise.allSettled(
    envVars
      .filter((v) => v.value)
      .map((envVar) =>
        vercelFetch(`/v9/projects/${projectId}/env`, token, {
          method: "POST",
          body: JSON.stringify({
            key: envVar.key,
            value: envVar.value,
            type: "encrypted",
            target: ["production", "preview"],
          }),
        })
      )
  );
}
