import { nanoid } from "nanoid";
import { format } from "date-fns";
import { Project, ProjectCheckpoint } from "./types";

export function createProjectCheckpoint(
  project: Project,
  name?: string
): ProjectCheckpoint {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = structuredClone(project);
  return {
    id: nanoid(),
    projectId: project.id,
    name: name || `Checkpoint ${format(new Date(), "MMM d, h:mm a")}`,
    createdAt: Date.now(),
    schemaVersion: 1,
    snapshot: rest,
  };
}

export function restoreProjectFromCheckpoint(
  project: Project,
  checkpoint: ProjectCheckpoint
): Project {
  return {
    ...structuredClone(checkpoint.snapshot),
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: Date.now(),
  };
}
