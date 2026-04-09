import { ProjectFile, DeploymentTarget } from "../../types";

export interface PlatformConfig {
  filename: string;
  content: string;
}

export function generatePlatformConfig(
  platform: DeploymentTarget["platform"],
  triggeredOps: ProjectFile[]
): PlatformConfig[] {
  switch (platform) {
    case "vercel":
      return generateVercelConfig(triggeredOps);
    case "netlify":
      return generateNetlifyConfig(triggeredOps);
    case "supabase":
      return [];
    default:
      return [];
  }
}

function generateVercelConfig(triggeredOps: ProjectFile[]): PlatformConfig[] {
  const triggerNames = triggeredOps.map((op) => op.name);
  const routes = triggerNames.map((name) => ({
    src: `/api/${name}`,
    dest: `/api/${name}`,
  }));
  const vercelConfig = { version: 2, routes };

  return [
    { filename: "vercel.json", content: JSON.stringify(vercelConfig, null, 2) },
  ];
}

function generateNetlifyConfig(triggeredOps: ProjectFile[]): PlatformConfig[] {
  const triggerNames = triggeredOps.map((op) => op.name);

  const redirects = triggerNames
    .map(
      (name) => `
[[redirects]]
  from = "/api/${name}"
  to = "/.netlify/functions/${name}"
  status = 200`
    )
    .join("\n");

  const netlifyConfig = `[build]
  command = "npm install"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
${redirects}
`;

  return [{ filename: "netlify.toml", content: netlifyConfig }];
}
