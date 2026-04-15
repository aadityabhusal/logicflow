import { Context } from "../execution/types";
import { generateOperation } from "../format-code";
import { Project, ProjectFile, DeploymentTarget } from "../types";
import { createOperationFromFile } from "../utils";
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
  context: Context,
  platform?: DeploymentTarget["platform"]
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

  const platforms = platform
    ? deployment.platforms.filter((t) => t.platform === platform)
    : deployment.platforms;

  for (const target of platforms) {
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

type Dependency = { name: string; version: string };

export function resolveNpmDependencies(
  project: Project,
  operationFiles: ProjectFile[]
): Dependency[] {
  const dependencies = project.dependencies?.npm;
  const npmDependencies: Dependency[] = [
    {
      name: "remeda",
      version:
        dependencies?.find((d) => d.name === "remeda")?.version || "latest",
    },
  ];

  for (const file of operationFiles) {
    if (file.type !== "operation") continue;

    if (file.content.value.source?.name === "wretch") {
      if (!npmDependencies.some((d) => d.name === "wretch")) {
        npmDependencies.push({
          name: "wretch",
          version:
            dependencies?.find((d) => d.name === "wretch")?.version || "latest",
        });
      }
    }
  }
  return npmDependencies;
}

export function generatePackageJson(
  project: Project,
  dependencies: Dependency[]
): string {
  const depMap = dependencies.reduce<Record<string, string>>((acc, d) => {
    acc[d.name] = d.version;
    return acc;
  }, {});

  const pkg = {
    name: project.name.toLowerCase().replace(/\s+/g, "-"),
    version: project.version || "1.0.0",
    description: project.description || "",
    type: "module",
    main: "api/handler.js",
    scripts: {
      start: project.deployment?.platforms.some((t) => t.platform === "vercel")
        ? "vercel dev"
        : project.deployment?.platforms.some((t) => t.platform === "netlify")
          ? "netlify dev"
          : project.deployment?.platforms.some((t) => t.platform === "supabase")
            ? "supabase functions serve"
            : "node .",
    },
    dependencies: depMap,
    engines: {
      node: ">=18",
    },
  };

  return JSON.stringify(pkg, null, 2);
}
