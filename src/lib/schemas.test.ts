import { describe, expect, it } from "vitest";
import {
  createOperationFile,
  createTestProject,
  testString,
} from "../tests/helpers";
import { ProjectSchema } from "./schemas";

describe("ProjectSchema losslessness", () => {
  it("preserves project and operation metadata", () => {
    const file = createOperationFile("request", {
      name: "wretch.get",
      packageCallTarget: "member",
      callStyle: "method",
    });
    file.documentation = "Operation docs";
    file.tests = [
      {
        name: "returns a value",
        description: "Preserve this test",
        inputs: [testString("input")],
        expectedOutput: testString("output"),
        status: "passed",
      },
    ];
    const project = createTestProject({ files: [file] });
    project.userId = "user-1";
    project.repository = {
      url: "https://example.com/repository",
      currentBranch: "main",
      lastCommit: "abc123",
    };

    expect(ProjectSchema.parse(project)).toEqual(project);
  });
});
