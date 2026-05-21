import { describe, it, expect } from "vitest";
import {
  createProjectCheckpoint,
  restoreProjectFromCheckpoint,
} from "./checkpoints";
import { createTestProject, createOperationFile } from "@/tests/helpers";
import { Project } from "./types";

describe("createProjectCheckpoint", () => {
  it("creates a checkpoint with a deep-cloned snapshot", () => {
    const project = createTestProject({ name: "Original" });
    const checkpoint = createProjectCheckpoint(project, "My Checkpoint");

    expect(checkpoint.projectId).toBe(project.id);
    expect(checkpoint.name).toBe("My Checkpoint");
    expect(checkpoint.snapshot.name).toBe("Original");
    expect(checkpoint.schemaVersion).toBe(1);
  });

  it("excludes id, createdAt, and updatedAt from snapshot", () => {
    const project = createTestProject({ name: "Test" });
    const checkpoint = createProjectCheckpoint(project);

    expect(checkpoint.snapshot).not.toHaveProperty("id");
    expect(checkpoint.snapshot).not.toHaveProperty("createdAt");
    expect(checkpoint.snapshot).not.toHaveProperty("updatedAt");
  });

  it("generates a default name from timestamp when no name provided", () => {
    const project = createTestProject();
    const checkpoint = createProjectCheckpoint(project);

    expect(checkpoint.name).toMatch(/^Checkpoint /);
  });

  it("does not mutate when project changes after checkpoint creation", () => {
    const project = createTestProject({ name: "Original" });
    const checkpoint = createProjectCheckpoint(project);

    project.name = "Changed";

    expect(checkpoint.snapshot.name).toBe("Original");
  });

  it("deep-clones nested project data including files", () => {
    const file = createOperationFile("greet");
    const project = createTestProject({ files: [file] });
    const checkpoint = createProjectCheckpoint(project);

    file.name = "renamed";

    expect(checkpoint.snapshot.files[0].name).toBe("greet");
  });
});

describe("restoreProjectFromCheckpoint", () => {
  it("preserves current project id and createdAt", () => {
    const project = createTestProject({ name: "Old" });
    const checkpoint = createProjectCheckpoint(project);
    project.name = "New";

    const restored = restoreProjectFromCheckpoint(project, checkpoint);

    expect(restored.id).toBe(project.id);
    expect(restored.createdAt).toBe(project.createdAt);
    expect(restored.name).toBe("Old");
  });

  it("sets updatedAt to current time on restore", () => {
    const project = createTestProject();
    const checkpoint = createProjectCheckpoint(project);

    const beforeRestore = Date.now();
    const restored = restoreProjectFromCheckpoint(project, checkpoint);

    expect(restored.updatedAt).toBeGreaterThanOrEqual(beforeRestore);
  });

  it("applies checkpoint snapshot files", () => {
    const greetFile = createOperationFile("greet");
    const oldProject = createTestProject({
      files: [greetFile],
    });
    const checkpoint = createProjectCheckpoint(oldProject);

    const newFile = createOperationFile("hello");
    const currentProject: Project = {
      ...oldProject,
      files: [newFile],
    };

    const restored = restoreProjectFromCheckpoint(currentProject, checkpoint);

    expect(restored.files).toHaveLength(1);
    expect(restored.files[0].name).toBe("greet");
  });

  it("does not mutate the checkpoint snapshot during restore", () => {
    const project = createTestProject({ name: "Original" });
    const checkpoint = createProjectCheckpoint(project);

    const snapshotName = checkpoint.snapshot.name;
    const snapshotFiles = checkpoint.snapshot.files;

    restoreProjectFromCheckpoint(project, checkpoint);

    expect(checkpoint.snapshot.name).toBe(snapshotName);
    expect(checkpoint.snapshot.files).toBe(snapshotFiles);
  });

  it("preserves deployment config in restored project", () => {
    const project = createTestProject({
      deployment: {
        envVariables: [{ key: "FOO", value: "bar" }],
        platforms: [],
      },
    });
    const checkpoint = createProjectCheckpoint(project);

    const restored = restoreProjectFromCheckpoint(project, checkpoint);

    expect(restored.deployment?.envVariables).toHaveLength(1);
    expect(restored.deployment?.envVariables[0].key).toBe("FOO");
  });

  it("preserves dependencies in restored project", () => {
    const project = createTestProject({
      dependencies: {
        npm: [{ name: "remeda", version: "1.0.0", exports: [] }],
      },
    });
    const checkpoint = createProjectCheckpoint(project);

    const restored = restoreProjectFromCheckpoint(project, checkpoint);

    expect(restored.dependencies?.npm?.[0].name).toBe("remeda");
  });
});
