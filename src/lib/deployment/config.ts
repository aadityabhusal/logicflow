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
  joinTextFiles,
  bytesToBase64,
} from "./utils";
import { PACKAGE_REGISTRY } from "../packages/registry";
import { getEnabledPackages, PACKAGE_CATALOG } from "../packages/catalog";
import { syncPackageRegistry } from "../operations/built-in";
import {
  FileAssetMeta,
  getFileMeta,
  getPublicAssetPath,
  getFileAsset,
  collectFileInstanceIds,
} from "../file-assets";

function generateFileAssetLoader(
  fileAssets: Map<string, FileAssetMeta>,
  hasEmbeddedAssets = false
) {
  const manifest = Object.fromEntries(fileAssets);
  return (
    `${hasEmbeddedAssets ? "import { fileAssetEmbeddedData } from './file-assets.generated.js';\n" : "const fileAssetEmbeddedData = {};\n"}
const fileAssetManifest = ${JSON.stringify(manifest, null, 2)};
const fileAssetCache = new Map();
let fileAssetConfig = {};

export function configureFileAssets(config = {}) {
  fileAssetConfig = config;
}

async function fetchFileAsset(path) {
  const headers = fileAssetConfig.headers instanceof Headers ? fileAssetConfig.headers : new Headers();
  if (!(fileAssetConfig.headers instanceof Headers)) {
    for (const [key, value] of Object.entries(fileAssetConfig.headers ?? {})) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  const response = await fetch(
    fileAssetConfig.baseUrl ? new URL(path.replace(/^\\//, ""), fileAssetConfig.baseUrl) : path,
    { headers },
  );
  if (!response.ok) throw new Error(\`Failed to load file asset \${path}: HTTP \${response.status}\`);
  return response.arrayBuffer();
}

function decodeFileAssetData(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function loadFileAsset(id) {
  if (fileAssetCache.has(id)) return fileAssetCache.get(id);
  const meta = fileAssetManifest[id];
  if (!meta) throw new Error(\`Missing file asset: \${id}\`);
  const hasEmbeddedData = Object.prototype.hasOwnProperty.call(fileAssetEmbeddedData, id);
  const bytes = hasEmbeddedData
    ? decodeFileAssetData(fileAssetEmbeddedData[id])
    : typeof Deno !== "undefined" && !fileAssetConfig.baseUrl
    ? await Deno.readFile(new URL(` +
    "`../../public${meta.path}`" +
    `, import.meta.url))
    : await fetchFileAsset(meta.path);
  const file = new File([bytes], meta.name, {
    type: meta.type,
    lastModified: meta.lastModified,
  });
  fileAssetCache.set(id, file);
  return file;
}

export { loadFileAsset as File };
`
  );
}

async function loadFileAssets(
  project: Project,
  options?: { embedAssets?: boolean }
) {
  const fileIds = collectFileInstanceIds(project.files);
  const assets = new Map<string, FileAssetMeta>();
  const embedded = new Map<string, string>();
  const files: DeploymentFile[] = [];
  const errors: string[] = [];

  for (const id of fileIds) {
    const asset = await getFileAsset(id);
    if (!asset) {
      errors.push(`Missing file asset for File instance ${id}`);
      continue;
    }
    const publicPath = getPublicAssetPath(id, asset.file.name);
    const bytes = new Uint8Array(await asset.file.arrayBuffer());
    if (options?.embedAssets) embedded.set(id, bytesToBase64(bytes));
    else files.push({ path: `public${publicPath}`, content: bytes });
    assets.set(id, getFileMeta(publicPath, asset.file));
  }
  return { assets, embedded, files, errors };
}

export function getTriggeredOperations(project: Project): ProjectFile[] {
  return project.files.filter((f) => f.type === "operation" && f.trigger);
}

async function generateBaseFiles(
  project: Project,
  context: Context,
  options: { embedAssets?: boolean } = {}
) {
  const errors: string[] = [];
  const files: DeploymentFile[] = [];

  await syncPackageRegistry(getEnabledPackages(project));
  const allAssets = await loadFileAssets(project, options);
  errors.push(...allAssets.errors);
  files.push(...allAssets.files);

  for (const file of project.files.filter((f) => f.type === "operation")) {
    const operation = createOperationFromFile(file);
    if (!operation) {
      errors.push(`Failed to create operation from file: ${file.name}`);
      continue;
    }
    try {
      const content = generateOperation(operation, context, {
        fileAssets: allAssets.assets,
      });
      files.push({ path: `src/${file.name}.js`, content });
    } catch (error) {
      errors.push(`Failed to generate operation ${file.name}: ${error}`);
    }
  }
  if (allAssets.embedded.size > 0) {
    files.push({
      path: "src/lib/file-assets.generated.js",
      content: `export const fileAssetEmbeddedData = ${JSON.stringify(Object.fromEntries(allAssets.embedded), null, 2)};`,
    });
  }
  files.push({
    path: "src/lib/built-in.js",
    content: `${generateBuiltInModule()}\n${
      allAssets.assets.size
        ? generateFileAssetLoader(allAssets.assets, allAssets.embedded.size > 0)
        : ""
    }`,
  });

  const allFileContent = joinTextFiles(files);
  for (const pkg of Object.keys(virtualPackageModules)) {
    const moduleContent = virtualPackageModules[pkg];
    if (moduleContent && allFileContent.includes(`./lib/${pkg}.js`)) {
      files.push({ path: `src/lib/${pkg}.js`, content: moduleContent });
    }
  }
  return { files, errors, hasFileAssets: allAssets.assets.size > 0 };
}

async function formatProjectFiles(files: DeploymentFile[]) {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      if (typeof file.content !== "string" || !file.path.endsWith(".js")) {
        return file;
      }
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
  const {
    files: _files,
    errors,
    hasFileAssets,
  } = await generateBaseFiles(project, context, {
    embedAssets: platform === "supabase",
  });
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
          hasFileAssets,
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
  const allFiles = joinTextFiles(files);
  return EDGE_INCOMPATIBLE_PACKAGES.some(
    (pkg) => allFiles.includes(`'${pkg}'`) || allFiles.includes(`"${pkg}"`)
  );
}

function extractNpmPackageNames(files: DeploymentFile[]) {
  const packages = new Set<string>();
  const allFiles = joinTextFiles(files);
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
