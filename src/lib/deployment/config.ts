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
import {
  generateBuiltInModule,
  virtualPackageModules,
  prefixNpmImports,
} from "./utils";
import { PACKAGE_REGISTRY } from "../packages/registry";
import { getEnabledPackages, PACKAGE_CATALOG } from "../packages/catalog";
import { syncPackageRegistry } from "../operations/built-in";

export function getTriggeredOperations(project: Project): ProjectFile[] {
  return project.files.filter((f) => f.type === "operation" && f.trigger);
}

async function generateBaseFiles(project: Project, context: Context) {
  const errors: string[] = [];
  const files: DeploymentFile[] = [];

  await syncPackageRegistry(getEnabledPackages(project));

  for (const file of project.files.filter((f) => f.type === "operation")) {
    const operation = createOperationFromFile(file);
    if (!operation) {
      errors.push(`Failed to create operation from file: ${file.name}`);
      continue;
    }
    try {
      const content = generateOperation(operation, context);
      files.push({ path: `src/${file.name}.js`, content });
    } catch (error) {
      errors.push(`Failed to generate operation ${file.name}: ${error}`);
    }
  }
  files.push({ path: "src/lib/built-in.js", content: generateBuiltInModule() });

  const allFileContent = files.map((f) => f.content).join("\n");
  for (const pkg of Object.keys(virtualPackageModules)) {
    const moduleContent = virtualPackageModules[pkg];
    if (moduleContent && allFileContent.includes(`./lib/${pkg}.js`)) {
      files.push({ path: `src/lib/${pkg}.js`, content: moduleContent });
    }
  }
  return { files, errors };
}

async function formatProjectFiles(files: DeploymentFile[]) {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      if (!file.path.endsWith(".js")) return file;
      return { ...file, content: await formatCode(file.content) };
    })
  );
  return results.map((r, i) => (r.status === "fulfilled" ? r.value : files[i]));
}

export async function generateDeployableProject(
  project: Project,
  context: Context,
  platform?: DeploymentTarget["platform"]
) {
  const deployment = project.deployment ?? { envVariables: [], platforms: [] };
  const triggeredOps = getTriggeredOperations(project);
  const { files: _files, errors } = await generateBaseFiles(project, context);
  let files = _files;

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
        triggeredOps,
        {
          nodejs:
            target.platform === "vercel" && hasEdgeIncompatiblePackages(files),
        }
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

  return { files: await formatProjectFiles(files), errors, warnings: [] };
}

type Dependency = { name: string; version: string };

const EDGE_INCOMPATIBLE_PACKAGES: readonly string[] = ["@faker-js/faker"];

function hasEdgeIncompatiblePackages(files: DeploymentFile[]) {
  const allFiles = files.map((f) => f.content).join("\n");
  return EDGE_INCOMPATIBLE_PACKAGES.some(
    (pkg) => allFiles.includes(`'${pkg}'`) || allFiles.includes(`"${pkg}"`)
  );
}

function extractNpmPackageNames(files: DeploymentFile[]) {
  const packages = new Set<string>();
  const allFiles = files.map((f) => f.content).join("\n");
  for (const pkg of Object.keys(PACKAGE_REGISTRY)) {
    if (PACKAGE_CATALOG[pkg]?.packageType === "virtual") continue;
    const packageName = PACKAGE_CATALOG[pkg]?.packageName ?? pkg;
    if (
      allFiles.includes(`from '${packageName}'`) ||
      allFiles.includes(`from "${packageName}"`)
    ) {
      packages.add(packageName);
    }
  }
  if (allFiles.includes("from 'remeda'")) packages.add("remeda");
  if (allFiles.includes('from "remeda"')) packages.add("remeda");
  if (allFiles.includes("from 'immer'")) packages.add("immer");
  if (allFiles.includes('from "immer"')) packages.add("immer");
  return packages;
}

export function resolveNpmDependencies(
  project: Project,
  generatedFiles: DeploymentFile[]
) {
  const dependencies = project.dependencies?.npm;
  const packageNames = extractNpmPackageNames(generatedFiles);
  const npmDependencies: Dependency[] = [];

  for (const name of packageNames) {
    const catalogName = Object.keys(PACKAGE_CATALOG).find(
      (pkg) => PACKAGE_CATALOG[pkg].packageName === name
    );
    npmDependencies.push({
      name,
      version:
        dependencies?.find(
          (d) => d.name === name || (catalogName && d.name === catalogName)
        )?.version || "latest",
    });
  }

  return npmDependencies;
}

export function generatePackageJson(
  project: Project,
  dependencies: Dependency[]
) {
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
    engines: { node: ">=20" },
  };

  return JSON.stringify(pkg, null, 2);
}

export async function generateExportProject(
  project: Project,
  context: Context
) {
  const { files, errors } = await generateBaseFiles(project, context);
  const deps = resolveNpmDependencies(project, files);
  files.push({
    path: "package.json",
    content: generatePackageJson(project, deps),
  });
  const env = project.deployment?.envVariables?.map(({ key }) => `${key}=`);
  if (env?.length) {
    files.push({ path: ".env.example", content: env.join("\n") });
  }
  return { files: await formatProjectFiles(files), errors, warnings: [] };
}
