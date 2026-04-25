import { Context } from "../execution/types";
import { generateOperation, formatCode } from "../format-code";
import {
  Project,
  ProjectFile,
  DeploymentTarget,
  DeploymentFile,
} from "../types";
import { createOperationFromFile } from "../utils";
import { generatePlatformHandlers } from "./entrypoint-wrapper";
import { generatePlatformConfig } from "./platform-config";
import { generateBuiltInModule } from "./built-in-module";
import { prefixNpmImports } from "./utils";
import { PACKAGE_REGISTRY } from "../data";

export function getTriggeredOperations(project: Project): ProjectFile[] {
  return project.files.filter((f) => f.type === "operation" && f.trigger);
}

export async function generateDeployableProject(
  project: Project,
  context: Context,
  platform?: DeploymentTarget["platform"]
): Promise<{ files: DeploymentFile[]; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let files: DeploymentFile[] = [];

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

  if (platform === "supabase") {
    files = prefixNpmImports(files);
  } else {
    try {
      const npmDeps = resolveNpmDependencies(project, files);
      const packageJson = generatePackageJson(
        { ...project, deployment },
        npmDeps
      );
      files.push({ path: "package.json", content: packageJson });
    } catch (error) {
      errors.push(`Failed to generate package.json: ${error}`);
    }
  }

  const results = await Promise.allSettled(
    files.map(async (f) => ({ ...f, content: await formatCode(f.content) }))
  );
  const formattedFiles = results.map((result, i) =>
    result.status === "fulfilled" ? result.value : files[i]
  );

  return { files: formattedFiles, errors, warnings };
}

type Dependency = { name: string; version: string };

function extractNpmPackageNames(files: DeploymentFile[]): Set<string> {
  const packages = new Set<string>();
  const allContents = files.map((f) => f.content).join("\n");
  for (const pkg of Object.keys(PACKAGE_REGISTRY)) {
    if (allContents.includes(PACKAGE_REGISTRY[pkg].importStatement)) {
      packages.add(pkg);
    }
  }
  if (allContents.includes("from 'remeda'")) packages.add("remeda");
  return packages;
}

export function resolveNpmDependencies(
  project: Project,
  generatedFiles: DeploymentFile[]
): Dependency[] {
  const dependencies = project.dependencies?.npm;
  const packageNames = extractNpmPackageNames(generatedFiles);
  const npmDependencies: Dependency[] = [];

  for (const name of packageNames) {
    npmDependencies.push({
      name,
      version: dependencies?.find((d) => d.name === name)?.version || "latest",
    });
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
