import { describe, it, expect, vi, beforeEach } from "vitest";
import { deployToPlatform } from "@/lib/deployment/api/deploy";
import { Project, DeploymentTarget } from "@/lib/types";
import {
  createTestContext,
  createTestProject,
  createTriggeredOperationFile,
} from "@/tests/helpers";

vi.mock("@/lib/deployment/config", () => ({
  generateDeployableProject: vi.fn(),
  getTriggeredOperations: vi.fn(),
}));

vi.mock("@/lib/deployment/api/vercel", () => ({
  deployToVercel: vi.fn(),
}));

vi.mock("@/lib/deployment/api/supabase", () => ({
  deployToSupabase: vi.fn(),
}));

import {
  generateDeployableProject,
  getTriggeredOperations,
} from "@/lib/deployment/config";
import { deployToVercel } from "@/lib/deployment/api/vercel";
import { deployToSupabase } from "@/lib/deployment/api/supabase";

describe("deployToPlatform", () => {
  const ctx = createTestContext();

  const baseProject = createTestProject({
    files: [createTriggeredOperationFile("getUser")],
    deployment: {
      envVariables: [],
      platforms: [
        {
          platform: "vercel",
          credentials: { token: "test-token" },
          deployments: [],
        },
      ],
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (getTriggeredOperations as ReturnType<typeof vi.fn>).mockReturnValue([
      createTriggeredOperationFile("getUser"),
    ]);
    (generateDeployableProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [],
      errors: [],
      warnings: [],
    });
    (deployToVercel as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    (deployToSupabase as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
  });

  it("returns failure when no triggered operations", async () => {
    (getTriggeredOperations as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "vercel",
      credentials: { token: "test-token" },
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No HTTP trigger found");
  });

  it("returns error when API token is missing", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "vercel",
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("API token is required");
  });

  it("returns error when token is empty string", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "vercel",
      credentials: { token: "" },
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("API token is required");
  });

  it("capitalizes platform name in token error message", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "supabase",
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Supabase API token is required");
  });

  it("reports generating progress stage", async () => {
    const onProgress = vi.fn();
    await deployToPlatform(
      baseProject,
      ctx,
      {
        platform: "vercel",
        credentials: { token: "test-token" },
        deployments: [],
      },
      onProgress
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "generating" })
    );
  });

  it("returns errors when generateDeployableProject has errors", async () => {
    (generateDeployableProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [],
      errors: ["fail1", "fail2"],
      warnings: [],
    });
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "vercel",
      credentials: { token: "test-token" },
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("fail1");
    expect(result.error).toContain("fail2");
  });

  it("calls deployToVercel for Vercel platform with correct args", async () => {
    const target: DeploymentTarget = {
      platform: "vercel",
      credentials: { token: "vercel-token" },
      deployments: [],
    };
    await deployToPlatform(baseProject, ctx, target);
    expect(deployToVercel).toHaveBeenCalledWith(
      [],
      "vercel-token",
      {
        projectName: "test-project",
        triggerNames: ["getUser"],
        envVars: [],
      },
      undefined
    );
  });

  it("calls deployToSupabase for Supabase platform with correct args", async () => {
    const target: DeploymentTarget = {
      platform: "supabase",
      credentials: { token: "supabase-token" },
      projectId: "my-ref",
      deployments: [],
    };
    await deployToPlatform(baseProject, ctx, target);
    expect(deployToSupabase).toHaveBeenCalledWith(
      [],
      "supabase-token",
      {
        projectId: "my-ref",
        triggerNames: ["getUser"],
        envVars: [],
      },
      undefined
    );
  });

  it("returns error for unknown platform type", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "unknown" as DeploymentTarget["platform"],
      credentials: { token: "token" },
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown platform");
  });

  it("passes envVars from project deployment config", async () => {
    const projectWithEnv = createTestProject({
      files: [createTriggeredOperationFile("op")],
      deployment: {
        envVariables: [{ key: "API_KEY", value: "secret" }],
        platforms: [
          {
            platform: "vercel",
            credentials: { token: "token" },
            deployments: [],
          },
        ],
      },
    });
    await deployToPlatform(projectWithEnv, ctx, {
      platform: "vercel",
      credentials: { token: "token" },
      deployments: [],
    });
    const callArgs = (deployToVercel as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[2].envVars).toEqual([{ key: "API_KEY", value: "secret" }]);
  });

  it("passes projectName derived from project name", async () => {
    const project = createTestProject({
      name: "My Cool App",
      files: [createTriggeredOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [
          {
            platform: "vercel",
            credentials: { token: "t" },
            deployments: [],
          },
        ],
      },
    });
    await deployToPlatform(project, ctx, {
      platform: "vercel",
      credentials: { token: "t" },
      deployments: [],
    });
    const callArgs = (deployToVercel as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[2].projectName).toBe("my-cool-app");
  });

  it("passes projectId for Supabase targets", async () => {
    await deployToPlatform(baseProject, ctx, {
      platform: "supabase",
      credentials: { token: "t" },
      projectId: "my-project-ref",
      deployments: [],
    });
    const callArgs = (deployToSupabase as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(callArgs[2].projectId).toBe("my-project-ref");
  });

  it("passes onProgress callback through to deploy function", async () => {
    const onProgress = vi.fn();
    await deployToPlatform(
      baseProject,
      ctx,
      {
        platform: "vercel",
        credentials: { token: "t" },
        deployments: [],
      },
      onProgress
    );
    const callArgs = (deployToVercel as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[3]).toBe(onProgress);
  });

  it("handles project with no deployment config", async () => {
    const projectWithNoDep = createTestProject({
      files: [createTriggeredOperationFile("getUser")],
    });
    delete (projectWithNoDep as Partial<Project>).deployment;

    const result = await deployToPlatform(projectWithNoDep, ctx, {
      platform: "vercel",
      credentials: { token: "token" },
      deployments: [],
    });

    expect(result.success).toBe(true);
    const callArgs = (deployToVercel as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[2].envVars).toBeUndefined();
  });

  it("returns failure when deployToVercel returns failure response", async () => {
    (deployToVercel as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Vercel API error",
    });
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "vercel",
      credentials: { token: "test-token" },
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Vercel API error");
  });

  it("returns failure when deployToSupabase returns failure response", async () => {
    (deployToSupabase as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Supabase API error",
    });
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "supabase",
      credentials: { token: "test-token" },
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Supabase API error");
  });
});
