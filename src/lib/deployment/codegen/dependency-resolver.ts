import { Project, ProjectFile } from "../../types";

export interface Dependency {
  name: string;
  version: string;
}

export function resolveNpmDependencies(
  project: Project,
  operationFiles: ProjectFile[]
): Dependency[] {
  const npmDependencies: Dependency[] = [];

  for (const file of operationFiles) {
    if (file.type !== "operation") continue;

    if (file.content.value.source?.name === "remeda") {
      if (!npmDependencies.some((d) => d.name === "remeda")) {
        npmDependencies.push({
          name: "remeda",
          version:
            project.dependencies?.npm?.find((d) => d.name === "remeda")
              ?.version || "latest",
        });
      }
    }

    if (file.content.value.source?.name === "wretch") {
      if (!npmDependencies.some((d) => d.name === "wretch")) {
        npmDependencies.push({
          name: "wretch",
          version:
            project.dependencies?.npm?.find((d) => d.name === "wretch")
              ?.version || "latest",
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
  const depMap = dependencies.reduce(
    (acc, d) => {
      acc[d.name] = d.version;
      return acc;
    },
    {} as Record<string, string>
  );

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
