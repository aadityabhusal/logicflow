import { describe, it, expect } from "vitest";
import { createExportZip } from "@/lib/deployment/export";
import type { DeploymentFile } from "@/lib/types";

describe("createExportZip", () => {
  it("produces output for a single file", () => {
    const files: DeploymentFile[] = [
      { path: "src/index.js", content: 'console.log("hello");' },
    ];
    const data = createExportZip(files);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBeGreaterThan(0);
  });

  it("produces output for multiple files", () => {
    const files: DeploymentFile[] = [
      { path: "README.md", content: "# Hello" },
      { path: "src/index.js", content: "export {};" },
    ];
    const data = createExportZip(files);
    expect(data.length).toBeGreaterThan(0);
  });

  it("produces different content for different inputs", () => {
    const a = createExportZip([{ path: "a.js", content: "1" }]);
    const b = createExportZip([{ path: "b.js", content: "2" }]);
    expect(a).not.toEqual(b);
  });

  it("handles empty file content", () => {
    const files: DeploymentFile[] = [{ path: "empty.js", content: "" }];
    const data = createExportZip(files);
    expect(data).toBeInstanceOf(Uint8Array);
  });

  it("handles many files", () => {
    const files: DeploymentFile[] = Array.from({ length: 20 }, (_, i) => ({
      path: `src/op${i}.js`,
      content: `export default () => ${i};`,
    }));
    const data = createExportZip(files);
    expect(data.length).toBeGreaterThan(0);
  });
});
