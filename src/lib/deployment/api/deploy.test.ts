import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import type { deployToSupabase as realDeployToSupabase } from "@/lib/deployment/api/supabase";
import type { deployToVercel as realDeployToVercel } from "@/lib/deployment/api/vercel";

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

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(generateDeployableProject).not.toHaveBeenCalled();
    expect(deployToVercel).not.toHaveBeenCalled();
  });

  it("returns error when API token is missing", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "vercel",
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("API token is required");
    expect(generateDeployableProject).not.toHaveBeenCalled();
    expect(deployToVercel).not.toHaveBeenCalled();
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

  it("returns error when token is whitespace only", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "vercel",
      credentials: { token: "   " },
      deployments: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API token is required");
    expect(generateDeployableProject).not.toHaveBeenCalled();
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

  it("generates deployable project for the selected target platform", async () => {
    const target: DeploymentTarget = {
      platform: "supabase",
      credentials: { token: "supabase-token" },
      projectId: "my-ref",
      deployments: [],
    };

    await deployToPlatform(baseProject, ctx, target);

    expect(generateDeployableProject).toHaveBeenCalledWith(
      baseProject,
      ctx,
      "supabase"
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
    expect(generateDeployableProject).not.toHaveBeenCalled();
    expect(deployToVercel).not.toHaveBeenCalled();
    expect(deployToSupabase).not.toHaveBeenCalled();
  });

  it("returns unknown platform before checking platform-specific token", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "unknown" as DeploymentTarget["platform"],
      deployments: [],
    });

    expect(result).toEqual({
      success: false,
      error: "Unknown platform: unknown",
    });
    expect(generateDeployableProject).not.toHaveBeenCalled();
  });

  it("returns error for Supabase targets without projectId before generation", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "supabase",
      credentials: { token: "test-token" },
      deployments: [],
    });

    expect(result).toEqual({
      success: false,
      error: "Supabase project reference is required",
    });
    expect(generateDeployableProject).not.toHaveBeenCalled();
    expect(deployToSupabase).not.toHaveBeenCalled();
  });

  it("returns error for Supabase targets with whitespace-only projectId", async () => {
    const result = await deployToPlatform(baseProject, ctx, {
      platform: "supabase",
      credentials: { token: "test-token" },
      projectId: "   ",
      deployments: [],
    });

    expect(result).toEqual({
      success: false,
      error: "Supabase project reference is required",
    });
    expect(generateDeployableProject).not.toHaveBeenCalled();
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
      projectId: "my-ref",
      deployments: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Supabase API error");
  });
});

describe("deployToSupabase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads virtual package modules with Supabase functions", async () => {
    const { deployToSupabase } = await vi.importActual<{
      deployToSupabase: typeof realDeployToSupabase;
    }>("@/lib/deployment/api/supabase");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const files = [
      {
        path: "supabase/functions/main/index.js",
        content: "import main from '../../../src/main.js';",
      },
      { path: "src/lib/built-in.js", content: "export {};" },
      {
        path: "src/main.js",
        content: "import * as ffmpeg from './lib/ffmpeg.js';",
      },
      {
        path: "src/lib/ffmpeg.js",
        content: "export function command() {}",
      },
    ];

    const result = await deployToSupabase(files, "token", {
      projectId: "project-ref",
      triggerNames: ["main"],
    });

    expect(result.success).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);

    const uploadedFileNames = Array.from((body as FormData).entries())
      .filter(([key]) => key === "file")
      .map(([, value]) => (value as File).name);

    expect(uploadedFileNames).toContain("src/lib/ffmpeg.js");
  });
});

describe("deployment adapter failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not create a Vercel project after an uncertain lookup", async () => {
    const { deployToVercel } = await vi.importActual<{
      deployToVercel: typeof realDeployToVercel;
    }>("@/lib/deployment/api/vercel");
    const fetchMock = vi.fn(
      async () => new Response("Lookup failed", { status: 503 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await deployToVercel([], "token", {
      projectName: "app",
      triggerNames: ["main"],
    });

    expect(result).toMatchObject({ success: false });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails when Vercel environment synchronization fails", async () => {
    const { deployToVercel } = await vi.importActual<{
      deployToVercel: typeof realDeployToVercel;
    }>("@/lib/deployment/api/vercel");
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v9/projects?")) {
          return Response.json({
            projects: [{ id: "project-a", name: "app" }],
          });
        }
        if (url.endsWith("/v9/projects/project-a/env") && !init?.method) {
          return Response.json({ envs: [] });
        }
        return new Response("Environment update rejected", { status: 400 });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await deployToVercel([], "token", {
      projectName: "app",
      triggerNames: ["main"],
      envVars: [{ key: "API_KEY", value: "secret" }],
    });

    expect(result).toMatchObject({ success: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails when Supabase secret synchronization fails", async () => {
    const { deployToSupabase } = await vi.importActual<{
      deployToSupabase: typeof realDeployToSupabase;
    }>("@/lib/deployment/api/supabase");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Secret rejected", { status: 400 }))
    );

    const result = await deployToSupabase(
      [{ path: "supabase/functions/main/index.js", content: "export {};" }],
      "token",
      {
        projectId: "project-a",
        triggerNames: ["main"],
        envVars: [{ key: "API_KEY", value: "secret" }],
      }
    );

    expect(result).toMatchObject({ success: false, projectId: "project-a" });
  });

  it("reports partial Supabase function deployment as failure", async () => {
    const { deployToSupabase } = await vi.importActual<{
      deployToSupabase: typeof realDeployToSupabase;
    }>("@/lib/deployment/api/supabase");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("Rejected", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await deployToSupabase(
      [
        { path: "supabase/functions/one/index.js", content: "export {};" },
        { path: "supabase/functions/two/index.js", content: "export {};" },
      ],
      "token",
      { projectId: "project-a", triggerNames: ["one", "two"] }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("two");
    expect(result.triggerUrls).toBeUndefined();
  });
});
