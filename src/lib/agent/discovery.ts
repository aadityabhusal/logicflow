import { z } from "zod";
import type { Context, OperationListItem } from "../execution/types";
import { coreOperations } from "../operations/built-in";
import { getEnabledPackages, PACKAGE_CATALOG } from "../packages/catalog";
import { loadPackageDescriptor } from "../packages/registry";
import { DataTypeSchema } from "../schemas";
import type { DataType, OperationType, Project, ProjectFile } from "../types";
import {
  createData,
  createFileVariables,
  getTypeSignature,
  isTypeCompatible,
  resolveParameters,
} from "../utils";

const MAX_LOOKUP_REQUESTS = 10;
const MAX_RESULTS_PER_REQUEST = 10;
const MAX_QUERY_LENGTH = 200;
const MAX_CONTEXT_BYTES = 200_000;

const OPERATION_SEARCH_ALIASES = new Map<string, string[]>([
  ["isDeepEqual", ["equal", "equals", "equality", "even", "odd"]],
  ["mod", ["modulo", "remainder", "even", "odd"]],
]);

export class AgentDiscoveryError extends Error {
  constructor(
    readonly code:
      | "duplicate_operation_name"
      | "invalid_lookup"
      | "package_load_failed"
      | "unsupported_package"
      | "unknown_operation",
    message: string
  ) {
    super(message);
    this.name = "AgentDiscoveryError";
  }
}

export const AgentOperationLookupSchema = z
  .object({
    requests: z
      .array(
        z
          .object({
            query: z
              .string()
              .min(1)
              .max(MAX_QUERY_LENGTH)
              .describe("Exact operation name or short descriptive phrase"),
            package: z
              .string()
              .max(100)
              .optional()
              .describe(
                'Supported package key, "builtin", or omitted for all active sources'
              ),
            inputType: DataTypeSchema.optional().describe(
              "Receiver data type before the operation call, not an operation signature"
            ),
          })
          .strict()
      )
      .min(1)
      .max(MAX_LOOKUP_REQUESTS),
  })
  .strict();

export type AgentOperationLookup = z.infer<typeof AgentOperationLookupSchema>;
export type AgentOperationDescriptor = {
  name: string;
  source: "builtin" | "project" | "package";
  package?: string;
  parameters: OperationType["parameters"];
  result: DataType | { kind: "unresolved" };
  operationId?: string;
  operationSource?: OperationListItem["source"];
};

type CatalogDescriptor = {
  name: string;
  source: AgentOperationDescriptor["source"];
  package?: string;
  operation?: OperationListItem;
  file?: Extract<ProjectFile, { type: "operation" }>;
};

function createTypeContext(project: Project): Context {
  const context = {
    scopeId: "agent-discovery",
    variables: createFileVariables(project.files),
    packageAliases: {},
    getResult: () => undefined,
    getInstance: () => undefined,
    setInstance: () => undefined,
    executeOperation: () => Promise.resolve(createData()),
    executeOperationSync: () => createData(),
    executeStatement: () => Promise.resolve(createData()),
    executeStatementSync: () => createData(),
    getContext: () => context,
    setContext: () => undefined,
    setResult: () => undefined,
  } as Context;
  return context;
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function matches(name: string, query: string) {
  const normalized = name.trim().toLowerCase();
  const nameTokens = tokens(
    [name, ...(OPERATION_SEARCH_ALIASES.get(name) ?? [])].join(" ")
  );
  const queryTokens = tokens(query);
  return (
    normalized === query.trim().toLowerCase() ||
    queryTokens.some((queryToken) =>
      nameTokens.some(
        (nameToken) =>
          nameToken === queryToken ||
          (nameToken.length >= 3 &&
            (queryToken.startsWith(nameToken) ||
              nameToken.startsWith(queryToken)))
      )
    )
  );
}

function resolveDescriptor(
  descriptor: CatalogDescriptor,
  inputType: DataType,
  context: Context
): AgentOperationDescriptor {
  if (descriptor.file) {
    return {
      name: descriptor.name,
      source: "project",
      parameters: descriptor.file.content.type.parameters,
      result: descriptor.file.content.type.result,
      operationId: descriptor.file.id,
    };
  }
  const input = createData({ type: inputType });
  const operation = descriptor.operation!;
  const parameters = resolveParameters(operation, input, context);
  const result =
    typeof operation.expectedType === "function"
      ? operation.expectedType(input)
      : (operation.expectedType ?? { kind: "unresolved" as const });
  return {
    name: descriptor.name,
    source: descriptor.source,
    package: descriptor.package,
    parameters,
    result,
    operationSource: operation.source,
  };
}

export async function createAgentDiscovery(
  project: Project,
  selectedFileId?: string
) {
  const operations = project.files.filter(
    (file): file is Extract<ProjectFile, { type: "operation" }> =>
      file.type === "operation"
  );
  if (new Set(operations.map(({ name }) => name)).size !== operations.length) {
    throw new AgentDiscoveryError(
      "duplicate_operation_name",
      "Project operation names must be unique"
    );
  }
  const selected = operations.find(({ id }) => id === selectedFileId);
  const enabledPackages = getEnabledPackages(project)
    .map(({ name }) => name)
    .sort();
  const context = createTypeContext(project);
  const baseCatalog: CatalogDescriptor[] = [
    ...coreOperations.map((operation) => ({
      name: operation.name,
      source: "builtin" as const,
      operation,
    })),
    ...operations
      .filter(({ id }) => id !== selectedFileId)
      .map((file) => ({ name: file.name, source: "project" as const, file })),
  ];
  try {
    const loaded = await Promise.all(
      enabledPackages.map(async (name) => ({
        name,
        descriptor: await loadPackageDescriptor(name),
      }))
    );
    for (const { name, descriptor } of loaded) {
      baseCatalog.push(
        ...descriptor.operations.map((operation) => ({
          name: operation.name,
          source: "package" as const,
          package: name,
          operation,
        }))
      );
    }
  } catch {
    throw new AgentDiscoveryError(
      "package_load_failed",
      "Could not load an enabled package descriptor"
    );
  }

  const lookupOperations = async (input: AgentOperationLookup) => {
    const parsed = AgentOperationLookupSchema.safeParse(input);
    if (!parsed.success)
      throw new AgentDiscoveryError(
        "invalid_lookup",
        parsed.error.issues[0]?.message ?? "Invalid lookup"
      );
    const disabledNames = [
      ...new Set(
        parsed.data.requests
          .map((request) => request.package)
          .filter(
            (name): name is string =>
              !!name && name !== "builtin" && !enabledPackages.includes(name)
          )
      ),
    ].sort();
    for (const name of disabledNames) {
      if (!PACKAGE_CATALOG[name])
        throw new AgentDiscoveryError(
          "unsupported_package",
          `Unsupported package: ${name}`
        );
    }
    let disabled: CatalogDescriptor[] = [];
    try {
      const loaded = await Promise.all(
        disabledNames.map(async (name) => ({
          name,
          descriptor: await loadPackageDescriptor(name),
        }))
      );
      disabled = loaded.flatMap(({ name, descriptor }) =>
        descriptor.operations.map((operation) => ({
          name: operation.name,
          source: "package" as const,
          package: name,
          operation,
        }))
      );
    } catch {
      throw new AgentDiscoveryError(
        "package_load_failed",
        "Could not load a requested package descriptor"
      );
    }
    return parsed.data.requests.map((request) => {
      const inputType =
        request.inputType?.kind === "operation"
          ? (request.inputType.parameters[0]?.type ?? request.inputType.result)
          : (request.inputType ?? { kind: "unknown" as const });
      return [...baseCatalog, ...disabled]
        .filter(
          (descriptor) =>
            !request.package ||
            (request.package === "builtin"
              ? descriptor.source === "builtin"
              : descriptor.package === request.package)
        )
        .filter((descriptor) => matches(descriptor.name, request.query))
        .map((descriptor) => resolveDescriptor(descriptor, inputType, context))
        .filter((descriptor) => {
          const expected = descriptor.parameters[0]?.type;
          return (
            !request.inputType ||
            !expected ||
            isTypeCompatible(inputType, expected, context)
          );
        })
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            a.source.localeCompare(b.source) ||
            (a.package ?? "").localeCompare(b.package ?? "")
        )
        .slice(0, MAX_RESULTS_PER_REQUEST);
    });
  };

  const buildContextSnapshot = () => {
    if (!selected)
      throw new AgentDiscoveryError(
        "unknown_operation",
        "The selected operation is unavailable"
      );
    const usedNames = new Set(
      selected.content.value.statements.flatMap((statement) =>
        statement.operations.map((operation) => operation.value.name)
      )
    );
    const usedOperations = baseCatalog
      .filter(({ name }) => usedNames.has(name))
      .map((descriptor) =>
        resolveDescriptor(descriptor, { kind: "unknown" }, context)
      );
    const isEmptyOperation =
      selected.content.value.parameters.length === 0 &&
      selected.content.value.statements.length === 0;
    const snapshot = {
      selectedOperation: structuredClone(selected.content),
      selectedFileMetadata: {
        id: selected.id,
        name: selected.name,
        createdAt: selected.createdAt,
        updatedAt: selected.updatedAt,
        tags: selected.tags,
        trigger: selected.trigger,
        tests: selected.tests?.length ?? 0,
        documentation: selected.documentation,
      },
      projectOperations: operations
        .filter(({ id }) => id !== selected.id)
        .map((file) => ({
          name: file.name,
          operationId: file.id,
          parameters: file.content.type.parameters,
          result: file.content.type.result,
          signature: `(${file.content.type.parameters.map((parameter) => `${parameter.name ?? "arg"}: ${getTypeSignature(parameter.type, context)}`).join(", ")}) => ${getTypeSignature(file.content.type.result, context)}`,
        })),
      enabledPackages,
      supportedPackages: Object.entries(PACKAGE_CATALOG).map(
        ([name, entry]) => ({ name, description: entry.description })
      ),
      usedOperations,
      statementTargets: {
        parameters: selected.content.value.parameters.map(({ id, name }) => ({
          id,
          name: name ?? null,
        })),
        body: selected.content.value.statements.map(({ id, name }) => ({
          id,
          name: name ?? null,
        })),
      },
      instruction: isEmptyOperation
        ? 'The selected operation has no parameters or body statements. Build it with insert_statement actions: use container "parameters" for input declarations and "body" for computation/result statements, with beforeStatementId null for every insertion. The operation result is inferred from the final body statement. Put chained operation calls in statement.operations, not statement.data: statement.data is the receiver and call.value.parameters contains only explicit arguments after that receiver. Use exact operation names from context or lookup_operations. Do not use replace_statement, delete_statement, or move_statement because statementTargets is empty.'
        : "Change only the selected operation using insert_statement, replace_statement, delete_statement, and move_statement actions. Use only IDs from statementTargets for existing action targets and anchors; nested IDs in selectedOperation are not targetable.",
    };
    if (JSON.stringify(snapshot).length > MAX_CONTEXT_BYTES) {
      throw new AgentDiscoveryError(
        "invalid_lookup",
        "Selected operation context is too large"
      );
    }
    return snapshot;
  };

  return { buildContextSnapshot, lookupOperations };
}
