import { describe, expect, it } from "vitest";
import {
  createOperationFile,
  createTestProject,
  testString,
} from "../tests/helpers";
import { IDataSchema, ProjectSchema } from "./schemas";

describe("IDataSchema", () => {
  it("accepts an omitted undefined value without accepting JSON values", () => {
    const data = { id: "undefined-data", type: { kind: "undefined" } };

    expect(IDataSchema.safeParse(data).success).toBe(true);
    expect(IDataSchema.safeParse({ ...data, value: undefined }).success).toBe(
      true,
    );
    expect(IDataSchema.safeParse({ ...data, value: null }).success).toBe(false);
    expect(IDataSchema.safeParse({ ...data, value: "undefined" }).success).toBe(
      false,
    );
  });
});

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
