import { Context } from "../../execution/types";
import {
  Project,
  DeploymentTarget,
  DeploymentResult,
  DeploymentProgress,
} from "../../types";
import { generateDeployableProject, getTriggeredOperations } from "../config";
import { deployToVercel } from "./vercel";
import { deployToSupabase } from "./supabase";
import { capitalize } from "remeda";

export async function deployToPlatform(
  project: Project,
  context: Context,
  target: DeploymentTarget,
  onProgress?: (progress: DeploymentProgress) => void
): Promise<DeploymentResult> {
  const triggeredOps = getTriggeredOperations(project);
  if (triggeredOps.length === 0) {
    return {
      success: false,
      error: "No HTTP trigger found. Add an HTTP trigger before deploying.",
    };
  }

  if (!target.credentials?.token) {
    return {
      success: false,
      error: `${capitalize(target.platform)} API token is required`,
    };
  }

  onProgress?.({ stage: "generating", message: "Generating project files..." });

  const { files, errors } = await generateDeployableProject(
    project,
    context,
    target.platform
  );

  if (errors.length > 0) {
    return { success: false, error: `Errors: ${errors.join("; ")}` };
  }

  const triggerNames = triggeredOps.map((op) => op.name);
  const envVars = project.deployment?.envVariables;
  const projectName = project.name.toLowerCase().replace(/\s+/g, "-");

  switch (target.platform) {
    case "vercel":
      return deployToVercel(
        files,
        target.credentials!.token,
        { projectName, projectId: target.projectId, triggerNames, envVars },
        onProgress
      );
    case "supabase":
      return deployToSupabase(
        files,
        target.credentials!.token,
        { projectRef: target.projectRef, triggerNames, envVars },
        onProgress
      );
    default:
      return {
        success: false,
        error: `Unknown platform: ${(target as DeploymentTarget).platform}`,
      };
  }
}
