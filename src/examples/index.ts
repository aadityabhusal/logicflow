import { nanoid } from "nanoid";
import { ProjectSchema } from "@/lib/schemas";
import type { Project, ProjectFile } from "@/lib/types";
import { walkStatement } from "@/lib/walk";
import apiEndpoints from "./api-endpoints.logicflow.json";
import fizzBuzz from "./fizz-buzz.logicflow.json";
import mergeSort from "./merge-sort.logicflow.json";

type Example = { id: string; project: Project };

export const examples: Example[] = [
  createExample({
    project: apiEndpoints,
    description: "Route requests by path.",
  }),
  createExample({
    project: fizzBuzz,
    description: "Generate Fizz Buzz output.",
  }),
  createExample({
    project: mergeSort,
    description: "Sort numbers with merge sort.",
  }),
].filter((example): example is Example => example !== null);

export function createExampleFiles(files: ProjectFile[]): ProjectFile[] {
  const createdAt = Date.now();
  const ids = new Map(files.map(({ id }) => [id, nanoid()]));
  return structuredClone(files).map((file) => {
    if (file.type === "operation")
      for (const statement of [
        ...file.content.value.parameters,
        ...file.content.value.statements,
      ])
        walkStatement(
          statement,
          {
            onReference: (reference) => {
              reference.value.id =
                ids.get(reference.value.id) ?? reference.value.id;
            },
          },
          { nestedOperations: true, operationCalls: true },
        );
    return {
      ...file,
      id: ids.get(file.id)!,
      createdAt,
      updatedAt: undefined,
    };
  });
}

export function createExampleProjectMetadata(
  project: Project,
): Partial<Omit<Project, "id" | "createdAt" | "updatedAt">> {
  const clone = structuredClone(project);
  const { id: _, createdAt: _c, updatedAt: _u, ...metadata } = clone;
  return { ...metadata, files: createExampleFiles(project.files) };
}

function createExample({
  project,
  description,
}: {
  project: unknown;
  description: string;
}): Example | null {
  const { success, data, error } = ProjectSchema.safeParse(project);
  if (!success) {
    console.error("Invalid example project", error);
    return null;
  }
  return { id: nanoid(), project: { ...(data as Project), description } };
}
