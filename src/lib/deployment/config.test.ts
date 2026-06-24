import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getTriggeredOperations,
  resolveNpmDependencies,
  generatePackageJson,
  generateDeployableProject,
  generateExportProject,
} from "@/lib/deployment/config";
import { Project, ProjectFile } from "@/lib/types";
import {
  createTestContext,
  createTestProject,
  createTriggeredOperationFile,
  createOperationFile,
} from "@/tests/helpers";

const fileAssetMocks = vi.hoisted(() => ({
  collectFileInstanceIds: vi.fn((): string[] => []),
  getFileAsset: vi.fn(async (): Promise<unknown> => undefined),
}));

vi.mock("idb", () => ({
  openDB: () =>
    Promise.resolve({
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
      getAllKeys: async () => [],
    }),
}));

vi.mock("@/lib/file-assets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-assets")>();
  return {
    ...actual,
    collectFileInstanceIds: fileAssetMocks.collectFileInstanceIds,
    getFileAsset: fileAssetMocks.getFileAsset,
    saveFileAsset: async () => undefined,
    deleteFileAsset: async () => undefined,
    createFileFromAsset: async () => undefined,
  };
});

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

vi.mock("@/lib/deployment/utils", () => ({
  generateBuiltInModule: vi.fn(),
  virtualPackageModules: {},
  prefixNpmImports: vi.fn(),
  bytesToBase64: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  joinTextFiles: (files: { content: string | Uint8Array }[]) =>
    files
      .map((file) => (typeof file.content === "string" ? file.content : ""))
      .join("\n"),
}));

import { createOperationFromFile } from "@/lib/utils";
import { generateOperation, formatCode } from "@/lib/format-code";
import { generatePlatformHandlers } from "@/lib/deployment/entrypoint-wrapper";
import { generatePlatformConfig } from "@/lib/deployment/platform-config";
import {
  generateBuiltInModule,
  prefixNpmImports,
  virtualPackageModules,
} from "@/lib/deployment/utils";

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
  it("extracts remeda from generated files", () => {
    const project = createTestProject();
    const files = [
      {
        path: "src/myOp.js",
        content: "import * as R from 'remeda';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    expect(result).toEqual([{ name: "remeda", version: "latest" }]);
  });

  it("uses version from project dependencies when specified", () => {
    const project = createTestProject({
      dependencies: {
        npm: [{ name: "remeda", version: "2.0.0", exports: [] }],
      },
    });
    const files = [
      {
        path: "src/myOp.js",
        content: "import * as R from 'remeda';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    expect(result).toEqual([{ name: "remeda", version: "2.0.0" }]);
  });

  it("includes wretch when generated files import wretch", () => {
    const project = createTestProject();
    const files = [
      {
        path: "src/api.js",
        content: "import wretch from 'wretch';\nimport * as R from 'remeda';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    const names = result.map((d) => d.name);
    expect(names).toContain("remeda");
    expect(names).toContain("wretch");
    expect(result.find((d) => d.name === "wretch")!.version).toBe("latest");
  });

  it("includes faker by its real npm package name", () => {
    const project = createTestProject();
    const files = [
      {
        path: "src/fake.js",
        content: "import { faker } from '@faker-js/faker';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    expect(result).toEqual([{ name: "@faker-js/faker", version: "latest" }]);
  });

  it("uses configured faker version from catalog dependency name", () => {
    const project = createTestProject({
      dependencies: {
        npm: [{ name: "faker", version: "9.0.0", exports: [] }],
      },
    });
    const files = [
      {
        path: "src/fake.js",
        content: "import { faker } from '@faker-js/faker';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    expect(result).toEqual([{ name: "@faker-js/faker", version: "9.0.0" }]);
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
    const files = [
      {
        path: "src/api.js",
        content: "import wretch from 'wretch';\nimport * as R from 'remeda';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    expect(result.find((d) => d.name === "wretch")!.version).toBe("1.5.0");
    expect(result.find((d) => d.name === "remeda")!.version).toBe("2.0.0");
  });

  it("includes @supabase/supabase-js by its real npm package name", () => {
    const project = createTestProject();
    const files = [
      {
        path: "src/db.js",
        content: "import * as supabase from '@supabase/supabase-js';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    expect(result).toEqual([
      { name: "@supabase/supabase-js", version: "latest" },
    ]);
  });

  it("uses configured supabase version from catalog dependency name", () => {
    const project = createTestProject({
      dependencies: {
        npm: [{ name: "supabase", version: "2.0.0", exports: [] }],
      },
    });
    const files = [
      {
        path: "src/db.js",
        content: "import * as supabase from '@supabase/supabase-js';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    expect(result).toEqual([
      { name: "@supabase/supabase-js", version: "2.0.0" },
    ]);
  });

  it.each([
    ['import { purry } from "remeda";'],
    ["import * as R from 'remeda';"],
  ])("extracts remeda from generated import: %s", (content) => {
    const project = createTestProject();
    const result = resolveNpmDependencies(project, [
      { path: "src/lib/built-in.js", content },
    ]);

    expect(result).toEqual([{ name: "remeda", version: "latest" }]);
  });

  it("returns empty array when no known packages found", () => {
    const project = createTestProject();
    const files = [
      { path: "src/lib/built-in.js", content: "export const foo = 1;" },
    ];
    const result = resolveNpmDependencies(project, files);
    expect(result).toEqual([]);
  });

  it("does not duplicate packages", () => {
    const project = createTestProject();
    const files = [
      {
        path: "src/op1.js",
        content: "import * as R from 'remeda';",
      },
      {
        path: "src/op2.js",
        content: "import * as R from 'remeda';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    const remedaCount = result.filter((d) => d.name === "remeda").length;
    expect(remedaCount).toBe(1);
  });

  it("ignores relative imports", () => {
    const project = createTestProject();
    const files = [
      {
        path: "src/myOp.js",
        content: "import * as _ from './lib/built-in.js';",
      },
    ];
    const result = resolveNpmDependencies(project, files);
    const names = result.map((d) => d.name);
    expect(names).not.toContain("built-in.js");
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

  it("includes engines field requiring node >=20", () => {
    const result = JSON.parse(generatePackageJson(createTestProject(), []));
    expect(result.engines).toEqual({ node: ">=20" });
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
    fileAssetMocks.collectFileInstanceIds.mockReturnValue([]);
    fileAssetMocks.getFileAsset.mockResolvedValue(undefined);
    for (const key of Object.keys(virtualPackageModules)) {
      delete virtualPackageModules[key];
    }
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
    const opResult = files.find((f) => f.path === "src/myOp.js");
    expect(opResult).toBeDefined();
  });

  it("includes built-in module as src/built-in.js", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });

    const { files } = await generateDeployableProject(project, ctx);
    const builtIn = files.find((f) => f.path === "src/lib/built-in.js");
    expect(builtIn).toBeDefined();
  });

  it("packages file assets and appends the loader to built-in.js", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });
    fileAssetMocks.collectFileInstanceIds.mockReturnValue(["file-1"]);
    const bytes = new TextEncoder().encode("hello");
    fileAssetMocks.getFileAsset.mockResolvedValue({
      file: {
        name: "hello.txt",
        type: "text/plain",
        size: bytes.length,
        lastModified: 1,
        arrayBuffer: async () => bytes.buffer,
      } as File,
      createdAt: 1,
    });

    const { files } = await generateDeployableProject(project, ctx);
    const asset = files.find((f) => f.path === "public/assets/file-1.txt");
    const builtIn = files.find((f) => f.path === "src/lib/built-in.js");

    expect(asset?.content).toBeInstanceOf(Uint8Array);
    expect(builtIn?.content).toContain("export async function loadFileAsset");
    expect(builtIn?.content).toContain("export { loadFileAsset as File }");
    expect(builtIn?.content).toContain('"file-1"');
    expect(files.some((f) => f.path === "src/lib/file-assets.js")).toBe(false);
    expect(generatePlatformHandlers).toHaveBeenCalledWith("vercel", [], {
      nodejs: false,
      hasFileAssets: true,
    });
  });

  it("embeds file assets for Supabase deployments", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "supabase", deployments: [] }],
      },
    });
    fileAssetMocks.collectFileInstanceIds.mockReturnValue(["file-1"]);
    const bytes = new TextEncoder().encode("hello");
    fileAssetMocks.getFileAsset.mockResolvedValue({
      file: {
        name: "hello.txt",
        type: "text/plain",
        size: bytes.length,
        lastModified: 1,
        arrayBuffer: async () => bytes.buffer,
      } as File,
      createdAt: 1,
    });
    (prefixNpmImports as ReturnType<typeof vi.fn>).mockImplementation(
      (files: unknown[]) => files
    );

    const { files } = await generateDeployableProject(project, ctx, "supabase");
    const builtIn = files.find((f) => f.path === "src/lib/built-in.js");
    const assetModule = files.find(
      (f) => f.path === "src/lib/file-assets.generated.js"
    );

    expect(files.some((f) => f.path === "public/assets/file-1.txt")).toBe(
      false
    );
    expect(assetModule?.content).toContain('"file-1": "aGVsbG8="');
    expect(builtIn?.content).toContain(
      "import { fileAssetEmbeddedData } from './file-assets.generated.js'"
    );
    expect(builtIn?.content).toContain("decodeFileAssetData");
  });

  it("generates platform config and handlers for each deployment platform", async () => {
    const triggeredOp = createTriggeredOperationFile("op");
    const project = createTestProject({
      files: [triggeredOp],
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
    expect(generatePlatformConfig).toHaveBeenCalledWith("vercel", [
      triggeredOp,
    ]);
    expect(generatePlatformHandlers).toHaveBeenCalledWith(
      "vercel",
      [triggeredOp],
      { nodejs: false, hasFileAssets: false }
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

  it("includes remeda dependency when generated built-in module imports remeda", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });
    (formatCode as ReturnType<typeof vi.fn>).mockImplementation((c: string) =>
      Promise.resolve(c)
    );
    (generateBuiltInModule as ReturnType<typeof vi.fn>).mockReturnValue(
      'import { purry } from "remeda";'
    );

    const { files } = await generateDeployableProject(project, ctx);
    const packageJson = files.find((f) => f.path === "package.json");

    expect(packageJson).toBeDefined();
    const content = packageJson!.content as string;
    expect(JSON.parse(content).dependencies).toMatchObject({
      remeda: "latest",
    });
  });

  it("includes faker dependency and uses Node.js Vercel handler", async () => {
    const triggeredOp = createTriggeredOperationFile("main");
    const project = createTestProject({
      files: [triggeredOp],
      dependencies: {
        npm: [{ name: "faker", version: "9.0.0", exports: [] }],
      },
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });
    (formatCode as ReturnType<typeof vi.fn>).mockImplementation((c: string) =>
      Promise.resolve(c)
    );
    (generateOperation as ReturnType<typeof vi.fn>).mockReturnValue(
      "import { faker } from '@faker-js/faker';\nexport default () => faker.person.firstName();"
    );

    const { files } = await generateDeployableProject(project, ctx);
    const packageJson = files.find((f) => f.path === "package.json");

    expect(generatePlatformHandlers).toHaveBeenCalledWith(
      "vercel",
      [triggeredOp],
      { nodejs: true, hasFileAssets: false }
    );
    expect(packageJson).toBeDefined();
    const content = packageJson!.content as string;
    expect(JSON.parse(content).dependencies).toMatchObject({
      "@faker-js/faker": "9.0.0",
    });
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
    expect(files.some((f) => f.path === "src/good.js")).toBe(true);
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

  it("collects error when operation generation throws and continues", async () => {
    const project = createTestProject({
      files: [createOperationFile("bad"), createOperationFile("good")],
    });
    (generateOperation as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => {
        throw new Error("operation boom");
      })
      .mockReturnValueOnce("good code");

    const { files, errors } = await generateDeployableProject(project, ctx);

    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining("operation boom")])
    );
    expect(files.some((f) => f.path === "src/good.js")).toBe(true);
  });

  it("includes referenced virtual package modules", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });
    virtualPackageModules.ffmpeg = "export function command() {}";
    (generateOperation as ReturnType<typeof vi.fn>).mockReturnValue(
      "import * as ffmpeg from './lib/ffmpeg.js';"
    );

    const { files } = await generateDeployableProject(project, ctx);

    expect(files.some((f) => f.path === "src/lib/ffmpeg.js")).toBe(true);
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
    const opFile = files.find((f) => f.path.startsWith("src/"));
    expect(opFile!.content).toBe("raw-code");
  });

  it("uses formatted content when formatCode succeeds", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });
    (generateOperation as ReturnType<typeof vi.fn>).mockReturnValue("code");
    (formatCode as ReturnType<typeof vi.fn>).mockResolvedValue(
      "formatted-code"
    );

    const { files } = await generateDeployableProject(project, ctx);
    const opFile = files.find((f) => f.path.startsWith("src/"));
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
    expect(files.some((f) => f.path === "src/lib/built-in.js")).toBe(true);
  });
});

describe("generateExportProject", () => {
  const ctx = createTestContext();

  beforeEach(() => {
    vi.clearAllMocks();
    (formatCode as ReturnType<typeof vi.fn>).mockImplementation((c: string) =>
      Promise.resolve(c)
    );
    (createOperationFromFile as ReturnType<typeof vi.fn>).mockReturnValue({});
    (generateOperation as ReturnType<typeof vi.fn>).mockReturnValue("code");
    (generateBuiltInModule as ReturnType<typeof vi.fn>).mockReturnValue(
      "built-in"
    );
  });

  it("generates operation files for each operation", async () => {
    const project = createTestProject({
      files: [createOperationFile("myOp"), createOperationFile("helper")],
    });

    const { files, errors } = await generateExportProject(project, ctx);
    expect(errors).toEqual([]);
    expect(files.some((f) => f.path === "src/myOp.js")).toBe(true);
    expect(files.some((f) => f.path === "src/helper.js")).toBe(true);
  });

  it("includes lib/built-in.js", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });

    const { files } = await generateExportProject(project, ctx);
    expect(files.some((f) => f.path === "src/lib/built-in.js")).toBe(true);
  });

  it("includes package.json with module type", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });

    const { files } = await generateExportProject(project, ctx);
    const pkgFile = files.find((f) => f.path === "package.json");
    expect(pkgFile).toBeDefined();
    const pkg = JSON.parse(pkgFile!.content as string);
    expect(pkg.type).toBe("module");
  });

  it("includes remeda and immer in package.json dependencies when built-in references them", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });
    (generateBuiltInModule as ReturnType<typeof vi.fn>).mockReturnValue(
      'import { purry } from "remeda";\nimport { produce } from "immer";'
    );

    const { files } = await generateExportProject(project, ctx);
    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = JSON.parse(pkgFile!.content as string);
    expect(pkg.dependencies).toMatchObject({
      remeda: "latest",
      immer: "latest",
    });
  });

  it("includes .env.example with keys only", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [
          { key: "API_KEY", value: "secret123" },
          { key: "DB_URL", value: "postgres://..." },
        ],
        platforms: [],
      },
    });

    const { files } = await generateExportProject(project, ctx);
    const envFile = files.find((f) => f.path === ".env.example");
    expect(envFile).toBeDefined();
    expect(envFile!.content).toContain("API_KEY=");
    expect(envFile!.content).toContain("DB_URL=");
    expect(envFile!.content).not.toContain("secret123");
    expect(envFile!.content).not.toContain("postgres://");
  });

  it("does not generate platform config or handlers", async () => {
    const project = createTestProject({
      files: [createOperationFile("op")],
      deployment: {
        envVariables: [],
        platforms: [{ platform: "vercel", deployments: [] }],
      },
    });

    const { files } = await generateExportProject(project, ctx);
    expect(generatePlatformConfig).not.toHaveBeenCalled();
    expect(generatePlatformHandlers).not.toHaveBeenCalled();
    expect(files.some((f) => f.path === "vercel.json")).toBe(false);
    expect(files.some((f) => f.path.startsWith("api/"))).toBe(false);
    expect(files.some((f) => f.path.startsWith("supabase/"))).toBe(false);
  });

  it("collects errors for files that fail createOperationFromFile", async () => {
    const project = createTestProject({
      files: [createOperationFile("bad"), createOperationFile("good")],
    });
    (createOperationFromFile as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({});

    const { files, errors } = await generateExportProject(project, ctx);
    expect(errors.length).toBe(1);
    expect(files.some((f) => f.path === "src/good.js")).toBe(true);
  });

  it("returns empty errors array when successful", async () => {
    const project = createTestProject({ files: [createOperationFile("op")] });

    const { errors, warnings } = await generateExportProject(project, ctx);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
