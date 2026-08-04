import { nanoid } from "nanoid";
import { coreOperations } from "../operations/built-in";
import { getEnabledPackages, PACKAGE_CATALOG } from "../packages/catalog";
import type { Context, OperationListItem } from "../execution/types";
import type {
  DataType,
  IData,
  IStatement,
  OperationType,
  Project,
  ProjectFile,
} from "../types";
import {
  createData,
  getTypeSignature,
  isDataOfType,
  isTypeCompatible,
  resolveParameters,
} from "../utils";

const MAX_RESULTS = 20;
const MAX_OUTLINE_OPERATIONS = 50;
const MAX_INSPECTED_STATEMENTS = 50;
const MAX_NESTED_ITEMS = 20;
const MAX_TEXT_LENGTH = 2_000;

export class AgentDiscoveryError extends Error {
  constructor(
    readonly code:
      | "duplicate_operation_name"
      | "invalid_limit"
      | "package_load_failed"
      | "stale_handle"
      | "unknown_handle",
    message: string
  ) {
    super(message);
    this.name = "AgentDiscoveryError";
  }
}

export type AgentOperationSource = "core" | "package" | "project";

export type AgentOperationSummary = {
  handle: string;
  name: string;
  source: AgentOperationSource;
  packageName?: string;
  inputType: DataType;
  resultType: DataType | { kind: "unresolved" };
  signature: string;
};

type OperationDescriptor = {
  handle: string;
  name: string;
  source: AgentOperationSource;
  packageKey?: string;
  packageName?: string;
  importKind?: "default" | "namespace" | "named";
  operation?: OperationListItem;
  file?: Extract<ProjectFile, { type: "operation" }>;
};

type SearchOptions = {
  query?: string;
  inputType?: DataType;
  resultType?: DataType;
  source?: AgentOperationSource;
  limit?: number;
};

const typeContext: Context = {
  scopeId: "agent-discovery",
  variables: new Map(),
  packageAliases: {},
  getResult: () => undefined,
  getInstance: () => undefined,
  setInstance: () => undefined,
  executeOperation: () => Promise.resolve(createData()),
  executeOperationSync: () => createData(),
  executeStatement: () => Promise.resolve(createData()),
  executeStatementSync: () => createData(),
  getContext: () => typeContext,
  setContext: () => undefined,
  setResult: () => undefined,
};

function formatSignature(
  parameters: OperationType["parameters"],
  result: DataType | { kind: "unresolved" },
  depth = 4
) {
  const args = parameters
    .map(
      (parameter, index) =>
        `${parameter.isRest ? "..." : ""}${parameter.name || `arg${index + 1}`}${parameter.isOptional ? "?" : ""}: ${getTypeSignature(parameter.type, typeContext, depth)}`
    )
    .join(", ");
  return `(${args}) => ${result.kind === "unresolved" ? "unresolved" : getTypeSignature(result, typeContext, depth)}`;
}

function resolveOperation(
  descriptor: OperationDescriptor,
  inputType: DataType = { kind: "unknown" }
) {
  if (descriptor.file) {
    return {
      parameters: descriptor.file.content.type.parameters,
      resultType: descriptor.file.content.type.result as
        | DataType
        | { kind: "unresolved" },
    };
  }

  const operation = descriptor.operation!;
  const data = createData({ type: inputType });
  const parameters = resolveParameters(operation, data, typeContext);
  const resultType =
    typeof operation.expectedType === "function"
      ? operation.expectedType(data)
      : (operation.expectedType ?? { kind: "unresolved" as const });
  return { parameters, resultType };
}

function toSummary(
  descriptor: OperationDescriptor,
  inputType?: DataType
): AgentOperationSummary {
  const resolved = resolveOperation(descriptor, inputType);
  return {
    handle: descriptor.handle,
    name: descriptor.name,
    source: descriptor.source,
    packageName: descriptor.packageName,
    inputType: resolved.parameters[0]?.type ?? { kind: "undefined" },
    resultType: resolved.resultType,
    signature: formatSignature(resolved.parameters, resolved.resultType),
  };
}

function getLimit(limit = 10) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AgentDiscoveryError(
      "invalid_limit",
      "Result limit must be positive"
    );
  }
  return Math.min(limit, MAX_RESULTS);
}

function rankName(name: string, query: string) {
  if (!query) return 3;
  const normalized = name.toLowerCase();
  if (normalized === query) return 0;
  if (normalized.includes(query)) return 1;
  if (query.split(/\s+/).some((word) => normalized.includes(word))) return 2;
  return 3;
}

function inspectData(data: IData, depth: number): unknown {
  if (depth === 0) return { type: data.type };
  if (typeof data.value === "string") {
    return data.value.slice(0, MAX_TEXT_LENGTH);
  }
  if (
    typeof data.value === "number" ||
    typeof data.value === "boolean" ||
    data.value === undefined
  ) {
    return data.value;
  }
  if (isDataOfType(data, "reference")) {
    return { reference: data.value.name };
  }
  if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    return data.value
      .slice(0, MAX_NESTED_ITEMS)
      .map((statement) => inspectStatement(statement, depth - 1));
  }
  if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    return data.value.entries.slice(0, MAX_NESTED_ITEMS).map((entry) => ({
      key: entry.key.slice(0, 200),
      value: inspectStatement(entry.value, depth - 1),
    }));
  }
  if (isDataOfType(data, "operation")) {
    return {
      name: data.value.name,
      parameters: data.value.parameters
        .slice(0, MAX_NESTED_ITEMS)
        .map((parameter) => inspectStatement(parameter, depth - 1)),
      statements: data.value.statements
        .slice(0, MAX_NESTED_ITEMS)
        .map((statement) => inspectStatement(statement, depth - 1)),
    };
  }
  if (isDataOfType(data, "condition")) {
    return {
      condition: inspectStatement(data.value.condition, depth - 1),
      trueBranch: data.value.trueBranch
        .slice(0, MAX_NESTED_ITEMS)
        .map((statement) => inspectStatement(statement, depth - 1)),
      falseBranch: data.value.falseBranch
        .slice(0, MAX_NESTED_ITEMS)
        .map((statement) => inspectStatement(statement, depth - 1)),
    };
  }
  if (isDataOfType(data, "instance")) {
    return { className: data.value.className };
  }
  if (isDataOfType(data, "error")) {
    return { reason: data.value.reason.slice(0, MAX_TEXT_LENGTH) };
  }
  return undefined;
}

function inspectStatement(statement: IStatement, depth = 3): unknown {
  return {
    name: statement.name,
    type: statement.data.type,
    value: inspectData(statement.data, depth),
    operations: statement.operations
      .slice(0, MAX_NESTED_ITEMS)
      .map((operation) => ({
        name: operation.value.name,
        resultType: operation.type.result,
        arguments: operation.value.parameters
          .slice(0, MAX_NESTED_ITEMS)
          .map((parameter) => inspectStatement(parameter, depth - 1)),
        statements: operation.value.statements
          .slice(0, MAX_NESTED_ITEMS)
          .map((child) => inspectStatement(child, depth - 1)),
      })),
  };
}

export async function createAgentDiscovery(
  project: Project,
  currentFileId?: string
) {
  const sessionId = nanoid();
  let handleIndex = 0;
  const descriptors = new Map<string, OperationDescriptor>();
  const createDescriptor = (
    descriptor: Omit<OperationDescriptor, "handle">
  ) => {
    const handle = `operation_${sessionId}_${++handleIndex}`;
    const created = { ...descriptor, handle };
    descriptors.set(handle, created);
    return created;
  };

  for (const operation of coreOperations) {
    createDescriptor({ name: operation.name, source: "core", operation });
  }

  const enabledPackageNames = new Set(
    getEnabledPackages(project).map((dependency) => dependency.name)
  );
  for (const packageName of [...enabledPackageNames].sort()) {
    const entry = PACKAGE_CATALOG[packageName];
    let operations: OperationListItem[];
    try {
      operations = (await entry.load()).operations;
    } catch {
      throw new AgentDiscoveryError(
        "package_load_failed",
        `Could not load enabled package ${entry.displayName}`
      );
    }
    for (const operation of operations) {
      createDescriptor({
        name: operation.name,
        source: "package",
        packageKey: packageName,
        packageName: entry.packageName,
        importKind: entry.importKind,
        operation,
      });
    }
  }

  const projectNames = new Set<string>();
  for (const file of project.files) {
    if (file.type !== "operation") continue;
    if (projectNames.has(file.name)) {
      throw new AgentDiscoveryError(
        "duplicate_operation_name",
        `Project contains more than one operation named ${file.name}`
      );
    }
    projectNames.add(file.name);
    createDescriptor({ name: file.name, source: "project", file });
  }

  const getDescriptor = (handle: string) => {
    const descriptor = descriptors.get(handle);
    if (descriptor) return descriptor;
    if (handle.startsWith("operation_") && !handle.includes(sessionId)) {
      throw new AgentDiscoveryError(
        "stale_handle",
        "Operation handle belongs to an obsolete discovery session"
      );
    }
    throw new AgentDiscoveryError("unknown_handle", "Unknown operation handle");
  };

  return {
    getProjectOutline() {
      const operations = [...descriptors.values()]
        .filter((descriptor) => descriptor.source === "project")
        .slice(0, MAX_OUTLINE_OPERATIONS)
        .map((descriptor) => toSummary(descriptor));
      return {
        project: {
          name: project.name,
          description: project.description?.slice(0, MAX_TEXT_LENGTH),
        },
        files: {
          operations: project.files.filter((file) => file.type === "operation")
            .length,
          globals: project.files.filter((file) => file.type === "globals")
            .length,
          documentation: project.files.filter(
            (file) => file.type === "documentation"
          ).length,
          json: project.files.filter((file) => file.type === "json").length,
        },
        currentOperationHandle: [...descriptors.values()].find(
          (descriptor) => descriptor.file?.id === currentFileId
        )?.handle,
        operations,
        totalOperations: projectNames.size,
      };
    },

    inspectOperation(handle: string) {
      const descriptor = getDescriptor(handle);
      const summary = toSummary(descriptor);
      if (!descriptor.file) return summary;
      return {
        ...summary,
        documentation: descriptor.file.documentation?.slice(0, MAX_TEXT_LENGTH),
        parameters: descriptor.file.content.type.parameters,
        statements: descriptor.file.content.value.statements
          .slice(0, MAX_INSPECTED_STATEMENTS)
          .map((statement) => inspectStatement(statement)),
        totalStatements: descriptor.file.content.value.statements.length,
      };
    },

    searchOperations(options: SearchOptions = {}) {
      const limit = getLimit(options.limit);
      const query = options.query?.trim().toLowerCase() ?? "";
      return [...descriptors.values()]
        .filter(
          (descriptor) =>
            (!options.source || descriptor.source === options.source) &&
            (!descriptor.file || descriptor.file.id !== currentFileId)
        )
        .map((descriptor) => toSummary(descriptor, options.inputType))
        .filter((summary) => {
          if (query && rankName(summary.name, query) === 3) return false;
          if (
            options.inputType &&
            !isTypeCompatible(options.inputType, summary.inputType, typeContext)
          ) {
            return false;
          }
          return !(
            options.resultType &&
            (summary.resultType.kind === "unresolved" ||
              !isTypeCompatible(
                summary.resultType,
                options.resultType,
                typeContext
              ))
          );
        })
        .sort((first, second) => {
          const rank =
            rankName(first.name, query) - rankName(second.name, query);
          if (rank !== 0) return rank;
          const sourceRank = { project: 0, package: 1, core: 2 };
          return (
            sourceRank[first.source] - sourceRank[second.source] ||
            first.name.localeCompare(second.name) ||
            first.handle.localeCompare(second.handle)
          );
        })
        .slice(0, limit);
    },

    describeOperations(handles: string[], inputType?: DataType) {
      return handles.slice(0, MAX_RESULTS).map((handle) => {
        const descriptor = getDescriptor(handle);
        const resolved = resolveOperation(descriptor, inputType);
        return {
          ...toSummary(descriptor, inputType),
          parameters: resolved.parameters.map((parameter, index) => ({
            ...parameter,
            name: parameter.name || `arg${index + 1}`,
          })),
          packageKey: descriptor.packageKey,
          importKind: descriptor.importKind,
          operationSource: descriptor.operation?.source,
          documentation: descriptor.file?.documentation?.slice(
            0,
            MAX_TEXT_LENGTH
          ),
        };
      });
    },

    searchPackages(query = "", limit = 10) {
      const normalized = query.trim().toLowerCase();
      return Object.entries(PACKAGE_CATALOG)
        .map(([name, entry]) => ({
          name,
          displayName: entry.displayName,
          packageName: entry.packageName,
          description: entry.description,
          enabled: enabledPackageNames.has(name),
        }))
        .filter(
          (entry) =>
            !normalized ||
            entry.name.toLowerCase().includes(normalized) ||
            entry.displayName.toLowerCase().includes(normalized) ||
            entry.packageName.toLowerCase().includes(normalized) ||
            entry.description?.toLowerCase().includes(normalized)
        )
        .sort(
          (first, second) =>
            rankName(first.name, normalized) -
              rankName(second.name, normalized) ||
            Number(second.enabled) - Number(first.enabled) ||
            first.name.localeCompare(second.name)
        )
        .slice(0, getLimit(limit));
    },
  };
}
