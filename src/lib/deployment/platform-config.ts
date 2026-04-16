import { ProjectFile, DeploymentTarget } from "../types";

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
