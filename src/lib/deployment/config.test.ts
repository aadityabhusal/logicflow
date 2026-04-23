import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getTriggeredOperations,
  resolveNpmDependencies,
  generatePackageJson,
  generateDeployableProject,
} from "@/lib/deployment/config";
import { Project, ProjectFile } from "@/lib/types";
import {
  createTestContext,
  createTestProject,
  createTriggeredOperationFile,
  createOperationFile,
} from "@/tests/helpers";

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, createOperationFromFile: vi.fn() };
});

vi.mock("@/lib/format-code", () => ({
  generateOperation: vi.fn(),
  formatCode: vi.fn(),
}));

vi.mock("@/lib/deployment/entrypoint-wrapper", () => ({
  generatePlatformHandlers: vi.fn(),
}));

vi.mock("@/lib/deployment/platform-config", () => ({
  generatePlatformConfig: vi.fn(),
}));

vi.mock("@/lib/deployment/built-in-module", () => ({
  generateBuiltInModule: vi.fn(),
}));

vi.mock("@/lib/deployment/utils", () => ({
  prefixNpmImports: vi.fn(),
}));

import { createOperationFromFile } from "@/lib/utils";
import { generateOperation, formatCode } from "@/lib/format-code";
import { generatePlatformHandlers } from "@/lib/deployment/entrypoint-wrapper";
import { generatePlatformConfig } from "@/lib/deployment/platform-config";
import { generateBuiltInModule } from "@/lib/deployment/built-in-module";
import { prefixNpmImports } from "@/lib/deployment/utils";

describe("getTriggeredOperations", () => {
  it("returns operation files that have a trigger", () => {
    const project = createTestProject({
      files: [createTriggeredOperationFile("getUser")],
    });
    const result = getTriggeredOperations(project);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("getUser");
  });

  it("excludes operation files without a trigger", () => {
    const project = createTestProject({
      files: [createOperationFile("noTrigger")],
    });
    expect(getTriggeredOperations(project)).toHaveLength(0);
  });

  it("excludes non-operation files", () => {
    const globalsFile: ProjectFile = {
      id: "g1",
      name: "globals",
      type: "globals",
      createdAt: Date.now(),
      content: {},
    };
    const project = createTestProject({
      files: [globalsFile, createTriggeredOperationFile("getUser")],
    });
    const result = getTriggeredOperations(project);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("getUser");
  });

  it("returns empty array when no files have triggers", () => {
    const project = createTestProject({
      files: [createOperationFile("a"), createOperationFile("b")],
    });
    expect(getTriggeredOperations(project)).toHaveLength(0);
  });

  it("returns only triggered ops from a mixed set of files", () => {
    const project = createTestProject({
      files: [
        createTriggeredOperationFile("api"),
        createOperationFile("helper"),
        {
          id: "d1",
          name: "docs",
          type: "documentation",
          createdAt: Date.now(),
          content: "# Docs",
        },
      ],
    });
    const result = getTriggeredOperations(project);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("api");
  });
});

describe("resolveNpmDependencies", () => {
  it("always includes remeda with latest version by default", () => {
    const project = createTestProject();
    const result = resolveNpmDependencies(project, []);
    expect(result).toEqual([{ name: "remeda", version: "latest" }]);
  });

  it("uses version from project dependencies when specified", () => {
    const project = createTestProject({
      dependencies: {
        npm: [{ name: "remeda", version: "2.0.0", exports: [] }],
      },
    });
    const result = resolveNpmDependencies(project, []);
    expect(result).toEqual([{ name: "remeda", version: "2.0.0" }]);
  });

  it("includes wretch when an operation file has wretch source", () => {
    const project = createTestProject();
    const files = [createOperationFile("api", { name: "wretch" })];
    const result = resolveNpmDependencies(project, files);
    const names = result.map((d) => d.name);
    expect(names).toContain("wretch");
    expect(result.find((d) => d.name === "wretch")!.version).toBe("latest");
  });

  it("uses specified wretch version from project dependencies", () => {
    const project = createTestProject({
      dependencies: {
        npm: [
          { name: "remeda", version: "2.0.0", exports: [] },
          { name: "wretch", version: "1.5.0", exports: [] },
        ],
      },
    });
    const files = [createOperationFile("api", { name: "wretch" })];
    const result = resolveNpmDependencies(project, files);
    expect(result.find((d) => d.name === "wretch")!.version).toBe("1.5.0");
  });

  it("does not duplicate wretch if multiple operations use it", () => {
    const project = createTestProject();
    const files = [
      createOperationFile("api1", { name: "wretch" }),
      createOperationFile("api2", { name: "wretch" }),
    ];
    const result = resolveNpmDependencies(project, files);
    const wretchCount = result.filter((d) => d.name === "wretch").length;
    expect(wretchCount).toBe(1);
  });

  it("returns only remeda when no wretch sources", () => {
    const project = createTestProject();
    const files = [createOperationFile("op1"), createOperationFile("op2")];
    const result = resolveNpmDependencies(project, files);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("remeda");
  });

  it("skips non-operation files", () => {
    const project = createTestProject();
    const nonOpFile: ProjectFile = {
      id: "g1",
      name: "globals",
      type: "globals",
      createdAt: Date.now(),
      content: {},
    };
    const result = resolveNpmDependencies(project, [nonOpFile]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("remeda");
  });
});

describe("generatePackageJson", () => {
  it("sets type to module", () => {
    const result = JSON.parse(generatePackageJson(createTestProject(), []));
    expect(result.type).toBe("module");
  });

  it("derives name from project name (lowercase, spaces to dashes)", () => {
    const result = JSON.parse(
      generatePackageJson(createTestProject({ name: "My Cool Project" }), [])
    );
    expect(result.name).toBe("my-cool-project");
  });

  it("uses project version or defaults to 1.0.0", () => {
    const result = JSON.parse(
      generatePackageJson(createTestProject({ version: "2.5.0" }), [])
    );
    expect(result.version).toBe("2.5.0");
  });

  it("defaults version to 1.0.0 when project version is empty", () => {
    const result = JSON.parse(
      generatePackageJson(createTestProject({ version: "" }), [])
    );
    expect(result.version).toBe("1.0.0");
  });

  it("sets start script to vercel dev when Vercel platform present", () => {
    const project = createTestProject({
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });
    const result = JSON.parse(generatePackageJson(project, []));
    expect(result.scripts.start).toBe("vercel dev");
  });

  it("sets start script to supabase functions serve when Supabase platform present and no Vercel", () => {
    const project = createTestProject({
      deployment: {
        envVariables: [],
        platforms: [{ platform: "supabase", deployments: [] }],
      },
    });
    const result = JSON.parse(generatePackageJson(project, []));
    expect(result.scripts.start).toBe("supabase functions serve");
  });

  it("sets start script to node . when no recognized platform", () => {
    const result = JSON.parse(generatePackageJson(createTestProject(), []));
    expect(result.scripts.start).toBe("node .");
  });

  it("prioritizes vercel over supabase when both present", () => {
    const project = createTestProject({
      deployment: {
        envVariables: [],
        platforms: [
          { platform: "vercel", deployments: [] },
          { platform: "supabase", deployments: [] },
        ],
      },
    });
    const result = JSON.parse(generatePackageJson(project, []));
    expect(result.scripts.start).toBe("vercel dev");
  });

  it("includes all dependencies in dependencies map", () => {
    const deps = [
      { name: "remeda", version: "2.0.0" },
      { name: "wretch", version: "1.0.0" },
    ];
    const result = JSON.parse(generatePackageJson(createTestProject(), deps));
    expect(result.dependencies).toEqual({
      remeda: "2.0.0",
      wretch: "1.0.0",
    });
  });

  it("includes engines field requiring node >=18", () => {
    const result = JSON.parse(generatePackageJson(createTestProject(), []));
    expect(result.engines).toEqual({ node: ">=18" });
  });

  it("sets main to api/handler.js", () => {
    const result = JSON.parse(generatePackageJson(createTestProject(), []));
    expect(result.main).toBe("api/handler.js");
  });

  it("includes description from project", () => {
    const project = createTestProject();
    project.description = "A test project";
    const result = JSON.parse(generatePackageJson(project, []));
    expect(result.description).toBe("A test project");
  });

  it("defaults description to empty string when not set", () => {
    const result = JSON.parse(generatePackageJson(createTestProject(), []));
    expect(result.description).toBe("");
  });
});

describe("generateDeployableProject", () => {
  const ctx = createTestContext();

  beforeEach(() => {
    vi.clearAllMocks();
    (formatCode as ReturnType<typeof vi.fn>).mockImplementation((c: string) =>
      Promise.resolve(`formatted:${c}`)
    );
    (createOperationFromFile as ReturnType<typeof vi.fn>).mockReturnValue({});
    (generateOperation as ReturnType<typeof vi.fn>).mockReturnValue("code");
    (generateBuiltInModule as ReturnType<typeof vi.fn>).mockReturnValue(
      "built-in"
    );
    (generatePlatformConfig as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (generatePlatformHandlers as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  it("generates operation file for each operation with correct path", async () => {
    const opFile = createOperationFile("myOp");
    const project = createTestProject({ files: [opFile] });
    (createOperationFromFile as ReturnType<typeof vi.fn>).mockReturnValue({
      name: "myOp",
    });
    (generateOperation as ReturnType<typeof vi.fn>).mockReturnValue(
      "export const myOp = () => {};"
    );

    const { files, errors } = await generateDeployableProject(project, ctx);
    expect(errors).toEqual([]);
    const opResult = files.find((f) => f.path === "src/operations/myOp.js");
    expect(opResult).toBeDefined();
  });

  it("includes built-in module as src/built-in.js", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });

    const { files } = await generateDeployableProject(project, ctx);
    const builtIn = files.find((f) => f.path === "src/built-in.js");
    expect(builtIn).toBeDefined();
  });

  it("generates platform config and handlers for each deployment platform", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });
    (generatePlatformConfig as ReturnType<typeof vi.fn>).mockReturnValue([
      { filename: "vercel.json", content: "{}" },
    ]);
    (generatePlatformHandlers as ReturnType<typeof vi.fn>).mockReturnValue([
      { filename: "api/op.js", content: "handler" },
    ]);

    const { files } = await generateDeployableProject(project, ctx);
    expect(generatePlatformConfig).toHaveBeenCalledWith(
      "vercel",
      expect.any(Array)
    );
    expect(generatePlatformHandlers).toHaveBeenCalledWith(
      "vercel",
      expect.any(Array)
    );
    expect(files.some((f) => f.path === "vercel.json")).toBe(true);
    expect(files.some((f) => f.path === "api/op.js")).toBe(true);
  });

  it("calls prefixNpmImports for Supabase platform and does not generate package.json", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "supabase", deployments: [] }],
      },
    });
    (prefixNpmImports as ReturnType<typeof vi.fn>).mockImplementation(
      (files: unknown[]) => files
    );

    const { files } = await generateDeployableProject(project, ctx, "supabase");
    expect(prefixNpmImports).toHaveBeenCalled();
    expect(files.some((f) => f.path === "package.json")).toBe(false);
  });

  it("generates package.json for non-Supabase platforms", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });

    const { files } = await generateDeployableProject(project, ctx);
    expect(files.some((f) => f.path === "package.json")).toBe(true);
  });

  it("collects error when createOperationFromFile returns null", async () => {
    const project = createTestProject({ files: [createOperationFile("bad")] });
    (createOperationFromFile as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { errors } = await generateDeployableProject(project, ctx);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Failed to create operation from file: bad"),
      ])
    );
  });

  it("continues generating other operations when one fails", async () => {
    const project = createTestProject({
      files: [createOperationFile("bad"), createOperationFile("good")],
    });
    (createOperationFromFile as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ name: "good" });

    const { files, errors } = await generateDeployableProject(project, ctx);
    expect(errors.length).toBe(1);
    expect(files.some((f) => f.path === "src/operations/good.js")).toBe(true);
  });

  it("collects error when platform config generation throws", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });
    (generatePlatformConfig as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("config boom");
      }
    );

    const { errors } = await generateDeployableProject(project, ctx);
    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining("config boom")])
    );
  });

  it("collects error when handler generation throws", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });
    (generatePlatformHandlers as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("handler boom");
      }
    );

    const { errors } = await generateDeployableProject(project, ctx);
    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining("handler boom")])
    );
  });

  it("collects error when package.json generation throws", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });
    // Force generatePackageJson to throw by making project.name.toLowerCase fail
    Object.defineProperty(project, "name", {
      get() {
        throw new Error("name boom");
      },
    });

    const { errors } = await generateDeployableProject(project, ctx);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Failed to generate package.json"),
      ])
    );
  });

  it("falls back to unformatted content when formatCode rejects", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });
    (generateOperation as ReturnType<typeof vi.fn>).mockReturnValue("raw-code");
    (formatCode as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("prettier fail")
    );

    const { files } = await generateDeployableProject(project, ctx);
    const opFile = files.find((f) => f.path.startsWith("src/operations/"));
    expect(opFile!.content).toBe("raw-code");
  });

  it("uses formatted content when formatCode succeeds", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });
    (generateOperation as ReturnType<typeof vi.fn>).mockReturnValue("code");
    (formatCode as ReturnType<typeof vi.fn>).mockResolvedValue(
      "formatted-code"
    );

    const { files } = await generateDeployableProject(project, ctx);
    const opFile = files.find((f) => f.path.startsWith("src/operations/"));
    expect(opFile!.content).toBe("formatted-code");
  });

  it("filters to only the specified platform when platform arg provided", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [
          { platform: "vercel", deployments: [] },
          { platform: "supabase", deployments: [] },
        ],
      },
    });

    await generateDeployableProject(project, ctx, "vercel");
    expect(generatePlatformConfig).toHaveBeenCalledTimes(1);
    expect(generatePlatformConfig).toHaveBeenCalledWith(
      "vercel",
      expect.any(Array)
    );
  });

  it("processes all platforms when platform arg is undefined", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [
          { platform: "vercel", deployments: [] },
          { platform: "supabase", deployments: [] },
        ],
      },
    });

    await generateDeployableProject(project, ctx);
    expect(generatePlatformConfig).toHaveBeenCalledTimes(2);
  });

  it("handles project with no deployment config", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });
    delete (project as Partial<Project>).deployment;

    const { files, errors } = await generateDeployableProject(project, ctx);
    expect(errors).toEqual([]);
    expect(files.some((f) => f.path === "src/built-in.js")).toBe(true);
  });

  it("returns warnings array (currently always empty)", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });

    const { warnings } = await generateDeployableProject(project, ctx);
    expect(warnings).toEqual([]);
  });
});
