import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import {
  createDownloadName,
  createExportZip,
  downloadBlob,
  downloadExportZip,
} from "@/lib/deployment/export";
import type { DeploymentFile } from "@/lib/types";

const decoder = new TextDecoder();
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function unzipText(data: Uint8Array) {
  return Object.fromEntries(
    Object.entries(unzipSync(data)).map(([path, content]) => [
      path,
      decoder.decode(content),
    ])
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: originalRevokeObjectURL,
  });
});

describe("createExportZip", () => {
  it("zips a single file with exact path and content", () => {
    const files: DeploymentFile[] = [
      { path: "src/index.js", content: 'console.log("hello");' },
    ];
    const data = createExportZip(files);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(unzipText(data)).toEqual({
      "src/index.js": 'console.log("hello");',
    });
  });

  it("zips multiple files with exact paths and contents", () => {
    const files: DeploymentFile[] = [
      { path: "README.md", content: "# Hello" },
      { path: "src/index.js", content: "export {};" },
    ];
    const data = createExportZip(files);
    expect(unzipText(data)).toEqual({
      "README.md": "# Hello",
      "src/index.js": "export {};",
    });
  });

  it("produces different content for different inputs", () => {
    const a = createExportZip([{ path: "a.js", content: "1" }]);
    const b = createExportZip([{ path: "b.js", content: "2" }]);
    expect(a).not.toEqual(b);
  });

  it("handles empty file content", () => {
    const files: DeploymentFile[] = [{ path: "empty.js", content: "" }];
    const data = createExportZip(files);
    expect(unzipText(data)).toEqual({ "empty.js": "" });
  });

  it("zips many files without dropping entries", () => {
    const files: DeploymentFile[] = Array.from({ length: 20 }, (_, i) => ({
      path: `src/op${i}.js`,
      content: `export default () => ${i};`,
    }));
    const data = createExportZip(files);
    const entries = unzipText(data);
    expect(Object.keys(entries)).toHaveLength(20);
    expect(entries["src/op19.js"]).toBe("export default () => 19;");
  });

  it("uses the last file when duplicate paths are provided", () => {
    const data = createExportZip([
      { path: "src/index.js", content: "first" },
      { path: "src/index.js", content: "second" },
    ]);

    expect(unzipText(data)).toEqual({ "src/index.js": "second" });
  });
});

describe("createDownloadName", () => {
  it.each([
    ["My Project", "my-project"],
    ["  Spaced App  ", "spaced-app"],
    ["", "project"],
    ["   ", "project"],
  ])("creates %s as %s", (name, expected) => {
    expect(createDownloadName(name)).toBe(expected);
  });
});

describe("download helpers", () => {
  function mockUrlApi() {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    return { createObjectURL, revokeObjectURL };
  }

  it("downloads a blob and cleans up the temporary link", () => {
    const { createObjectURL, revokeObjectURL } = mockUrlApi();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadBlob(new Blob(["data"]), "project.zip");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download="project.zip"]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("downloads generated zip with sanitized project name", () => {
    mockUrlApi();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("my-app.zip");
      });

    downloadExportZip(
      [{ path: "src/index.js", content: "export {};" }],
      " My App "
    );

    expect(click).toHaveBeenCalledTimes(1);
  });
});
