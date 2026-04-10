import { Context } from "../execution/types";
import { generateOperation } from "../format-code";
import { Project, ProjectFile } from "../types";
import { createOperationFromFile } from "../utils";
import {
  generatePackageJson,
  resolveNpmDependencies,
} from "./dependency-resolver";
import { generatePlatformHandlers } from "./entrypoint-wrapper";
import { generatePlatformConfig } from "./platform-config";
import { generateBuiltInModule } from "./built-in-module";

export function getTriggeredOperations(project: Project): ProjectFile[] {
  return project.files.filter((f) => f.type === "operation" && f.trigger);
}

export interface ExportFile {
  path: string;
  content: string;
}

export function generateDeployableProject(
  project: Project,
  context: Context
): { files: ExportFile[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files: ExportFile[] = [];

  const deployment = project.deployment ?? { envVariables: [], platforms: [] };
  const triggeredOps = getTriggeredOperations(project);
  const operationFiles = project.files.filter((f) => f.type === "operation");

  for (const file of operationFiles) {
    const operation = createOperationFromFile(file);
    if (!operation) {
      errors.push(`Failed to create operation from file: ${file.name}`);
      continue;
    }
    const code = generateOperation(operation, context);
    files.push({ path: `src/operations/${file.name}.js`, content: code });
  }
  files.push({ path: "src/built-in.js", content: generateBuiltInModule() });

  for (const target of deployment.platforms) {
    try {
      const configs = generatePlatformConfig(target.platform, triggeredOps);
      files.push(
        ...configs.map((f) => ({ path: f.filename, content: f.content }))
      );
    } catch (error) {
      errors.push(
        `Failed to generate platform config for ${target.platform}: ${error}`
      );
    }

    try {
      const handlerFiles = generatePlatformHandlers(
        target.platform,
        triggeredOps
      );
      files.push(
        ...handlerFiles.map((f) => ({ path: f.filename, content: f.content }))
      );
    } catch (error) {
      errors.push(
        `Failed to generate entrypoint wrapper for ${target.platform}: ${error}`
      );
    }
  }

  try {
    const npmDeps = resolveNpmDependencies(project, operationFiles);
    const packageJson = generatePackageJson(
      { ...project, deployment },
      npmDeps
    );
    files.push({ path: "package.json", content: packageJson });
  } catch (error) {
    errors.push(`Failed to generate package.json: ${error}`);
  }

  return { files, errors, warnings };
}
