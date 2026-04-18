import {
  DeploymentFile,
  DeploymentResult,
  DeploymentProgress,
} from "../../types";
import { createPlatformFetch, parseError } from "../utils";

const vercelFetch = createPlatformFetch("/vercel");

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

async function findVercelProjectByName(
  projectName: string,
  token: string
): Promise<{ id: string; name: string } | null> {
  try {
    const res = await vercelFetch(
      `/v9/projects?name=${encodeURIComponent(projectName)}`,
      token
    );
    if (!res.ok) return null;
    const body = await res.json();
    const match = body.projects?.find(
      (p: { name: string }) => p.name === projectName
    );
    return match ? { id: match.id, name: match.name } : null;
  } catch {
    return null;
  }
}

async function ensureVercelProject(
  projectName: string,
  token: string
): Promise<{ id: string; name: string } | null> {
  const existing = await findVercelProjectByName(projectName, token);
  if (existing) return existing;

  try {
    const response = await vercelFetch("/v9/projects", token, {
      method: "POST",
      body: JSON.stringify({ name: projectName }),
    });
    if (!response.ok) {
      console.error(
        "Failed to create Vercel project:",
        await parseError(response)
      );
      return null;
    }
    const data = await response.json();
    return { id: data.id, name: data.name };
  } catch (error) {
    console.error("Failed to create Vercel project:", error);
    return null;
  }
}

export async function deployToVercel(
  files: DeploymentFile[],
  token: string,
  options: {
    projectName: string;
    triggerNames: string[];
    envVars?: { key: string; value: string }[];
  },
  onProgress?: (progress: DeploymentProgress) => void
): Promise<DeploymentResult> {
  onProgress?.({ stage: "generating", message: "Creating Vercel project" });
  const vercelProject = await ensureVercelProject(options.projectName, token);
  if (!vercelProject) {
    return { success: false, error: "Failed to create Vercel project" };
  }

  if (options.envVars?.length) {
    onProgress?.({ stage: "uploading", message: "Setting env variables" });
    await setVercelEnvVars(vercelProject.id, token, options.envVars);
  }

  onProgress?.({ stage: "uploading", message: "Uploading files to Vercel" });

  const body = {
    name: vercelProject.name,
    files: files.map((f) => ({
      file: f.path,
      data: f.content,
      encoding: "utf-8",
    })),
    projectSettings: {
      installCommand: "npm install",
      buildCommand: null,
      outputDirectory: null,
      rootDirectory: null,
      framework: null,
    },
    target: "production",
    project: vercelProject.id,
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

  let deployment: VercelDeploymentResponse;
  try {
    deployment = await response.json();
  } catch {
    return { success: false, error: "Invalid response from Vercel" };
  }

  onProgress?.({ stage: "building", message: "Building" });

  const result = await pollVercelDeployment(deployment.id, token, onProgress);

  const orgSlug = deployment.inspectorUrl
    ? new URL(deployment.inspectorUrl).pathname.split("/")[1]
    : undefined;
  const dashboardUrl =
    orgSlug && vercelProject.name
      ? `https://vercel.com/${orgSlug}/${vercelProject.name}`
      : deployment.inspectorUrl;

  return {
    ...result,
    id: deployment.id,
    triggerUrls: result.url
      ? options.triggerNames.map((n) => `${result.url}/api/${n}`)
      : undefined,
    dashboardUrl,
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

      onProgress?.({ stage: "building", message: "Building" });
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
  const vars = envVars.filter((v) => v.value);
  if (vars.length === 0) return;

  let existing: { id: string; key: string }[] = [];
  try {
    const res = await vercelFetch(`/v9/projects/${projectId}/env`, token);
    if (res.ok) {
      const body = await res.json();
      existing = body.envs;
    }
  } catch {
    console.error("Couldn't fetch Vercel env variables");
  }

  const idsByKey = new Map(existing.map((e) => [e.key, e.id]));

  await Promise.allSettled(
    vars.map(({ key, value }) => {
      const id = idsByKey.get(key);
      if (id) {
        return vercelFetch(`/v9/projects/${projectId}/env/${id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ value, target: ["production", "preview"] }),
        });
      }
      return vercelFetch(`/v9/projects/${projectId}/env`, token, {
        method: "POST",
        body: JSON.stringify({
          key,
          value,
          type: "encrypted",
          target: ["production", "preview"],
        }),
      });
    })
  );
}
