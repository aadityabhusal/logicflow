import {
  DeploymentFile,
  DeploymentResult,
  DeploymentProgress,
} from "../../types";
import { createPlatformFetch, deploymentFileBytes, parseError } from "../utils";

const supabaseFetch = createPlatformFetch("/supabase");

function appendFile(formData: FormData, file: DeploymentFile) {
  const type = file.path.endsWith(".js") ? "text/javascript" : undefined;
  formData.append(
    "file",
    new Blob(
      [deploymentFileBytes(file) as BlobPart],
      type ? { type } : undefined
    ),
    file.path
  );
}

export async function deployToSupabase(
  files: DeploymentFile[],
  token: string,
  options: {
    projectId?: string;
    triggerNames: string[];
    envVars?: { key: string; value: string }[];
  },
  onProgress?: (progress: DeploymentProgress) => void
): Promise<DeploymentResult> {
  const { projectId, triggerNames, envVars } = options;
  if (!projectId) {
    return { success: false, error: "Supabase project reference is required" };
  }

  if (envVars?.length) {
    onProgress?.({ stage: "uploading", message: "Setting secrets" });
    await setSupabaseSecrets(projectId, token, envVars);
  }

  const handlerFiles = files.filter((f) =>
    f.path.startsWith("supabase/functions/")
  );

  if (handlerFiles.length === 0) {
    return { success: false, error: "No Supabase function handlers found" };
  }

  const fnNames = handlerFiles
    .map((f) => f.path.match(/^supabase\/functions\/([^/]+)\/index\.js$/)?.[1])
    .filter(Boolean) as string[];

  onProgress?.({ stage: "uploading", message: "Deploying functions" });

  const results = await Promise.allSettled(
    fnNames.map((fnName) => deployFunction(projectId, fnName, files, token))
  );

  const errors = results
    .map((res, i) => {
      const reason = res.status === "rejected" ? res.reason : res.value.error;
      if (!reason) return null;
      return `${fnNames[i]}: ${reason}`;
    })
    .filter(Boolean);

  if (errors.length === fnNames.length) {
    const errorMsg = errors.join("; ");
    onProgress?.({ stage: "error", message: errorMsg });
    return { success: false, error: errorMsg, projectId };
  }

  const triggerUrls = triggerNames.map(
    (name) => `https://${projectId}.supabase.co/functions/v1/${name}`
  );
  const url = triggerUrls[0];

  if (errors.length > 0) {
    const message = `Failed to deploy ${errors.length} function(s): ${errors.join("; ")}`;
    onProgress?.({ stage: "ready", url, message });
  } else {
    onProgress?.({ stage: "ready", url });
  }

  return {
    success: true,
    url,
    state: "ready",
    projectId,
    id: `supabase-${projectId}`,
    triggerUrls,
    dashboardUrl: `https://supabase.com/dashboard/project/${projectId}/functions`,
  };
}

async function deployFunction(
  projectRef: string,
  funcName: string,
  files: DeploymentFile[],
  token: string
): Promise<DeploymentResult> {
  const handlerFile = files.find(
    (f) => f.path === `supabase/functions/${funcName}/index.js`
  );
  if (!handlerFile) {
    return { success: false, error: `Handler not found for ${funcName}` };
  }

  const metadata = {
    entrypoint_path: `supabase/functions/${funcName}/index.js`,
    name: funcName,
    verify_jwt: false,
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  appendFile(formData, handlerFile);

  for (const file of files) {
    if (file === handlerFile) continue;
    if (
      file.path.startsWith("src/") ||
      file.path.startsWith("public/assets/")
    ) {
      appendFile(formData, file);
    }
  }

  let response: Response;
  try {
    response = await supabaseFetch(
      `/v1/projects/${projectRef}/functions/deploy?slug=${funcName}`,
      token,
      { method: "POST", body: formData }
    );
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  if (!response.ok) {
    return { success: false, error: await parseError(response) };
  }

  return { success: true };
}

async function setSupabaseSecrets(
  projectRef: string,
  token: string,
  envVars: { key: string; value: string }[]
): Promise<void> {
  const secrets = envVars
    .filter((v) => v.value)
    .map((v) => ({ name: v.key, value: v.value }));
  if (secrets.length === 0) return;

  try {
    await supabaseFetch(`/v1/projects/${projectRef}/secrets`, token, {
      method: "POST",
      body: JSON.stringify(secrets),
    });
  } catch {
    console.error("Couldn't set Supabase environment variables");
  }
}
