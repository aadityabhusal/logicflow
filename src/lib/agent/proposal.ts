import { nanoid } from "nanoid";
import { z } from "zod";
import { formatCode, generateOperation } from "../format-code";
import {
  applySupportedPackageChanges,
  getAliasesFromPackages,
  getEnabledPackages,
  PACKAGE_CATALOG,
} from "../packages/catalog";
import { SOURCE_PACKAGE_MAP } from "../packages/registry";
import { ProjectFileSchema } from "../schemas";
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
  createFileVariables,
  createProjectFile,
  createOperationFromFile,
  createStatement,
  getIsAsync,
  getTypeSignature,
  inferTypeFromValue,
  isDataOfType,
  isTypeCompatible,
  isValidIdentifier,
  resolveUnionType,
} from "../utils";
import type { Context } from "../execution/types";
import { updateFiles } from "../update";
import { walkData, walkStatement } from "../walk";
import isEqual from "react-fast-compare";

const MAX_PARAMETERS = 20;
const MAX_STATEMENTS = 50;
const MAX_NESTED_ITEMS = 20;
const MAX_OPERATIONS = 20;
const MAX_TEXT_LENGTH = 2_000;
const MAX_DEPTH = 6;
const MAX_DIAGNOSTICS = 20;

const TypeDraftSchema: z.ZodType<TypeDraft> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unknown") }).strict(),
    z.object({ kind: z.literal("undefined") }).strict(),
    z.object({ kind: z.literal("string") }).strict(),
    z.object({ kind: z.literal("number") }).strict(),
    z.object({ kind: z.literal("boolean") }).strict(),
    z
      .object({ kind: z.literal("array"), elementType: TypeDraftSchema })
      .strict(),
    z
      .object({
        kind: z.literal("object"),
        properties: z
          .array(
            z
              .object({
                key: z.string().max(200),
                value: TypeDraftSchema,
                required: z.boolean().optional(),
              })
              .strict()
          )
          .max(MAX_NESTED_ITEMS),
      })
      .strict(),
  ])
);

const ValueDraftSchema: z.ZodType<ValueDraft> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("undefined") }).strict(),
    z
      .object({
        kind: z.literal("string"),
        value: z.string().max(MAX_TEXT_LENGTH),
      })
      .strict(),
    z.object({ kind: z.literal("number"), value: z.number() }).strict(),
    z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
    z
      .object({
        kind: z.literal("reference"),
        name: z.string().min(1).max(200),
      })
      .strict(),
    z
      .object({
        kind: z.literal("array"),
        items: z.array(ValueDraftSchema).max(MAX_NESTED_ITEMS),
      })
      .strict(),
    z
      .object({
        kind: z.literal("object"),
        entries: z
          .array(
            z
              .object({
                key: z.string().max(200),
                value: ValueDraftSchema,
              })
              .strict()
          )
          .max(MAX_NESTED_ITEMS),
      })
      .strict(),
  ])
);

const OperationCallDraftSchema = z
  .object({
    operationHandle: z.string().min(1),
    arguments: z.array(ValueDraftSchema).max(MAX_PARAMETERS),
  })
  .strict();

const StatementDraftSchema = z
  .object({
    name: z.string().max(200).optional(),
    value: ValueDraftSchema,
    operations: z
      .array(OperationCallDraftSchema)
      .max(MAX_OPERATIONS)
      .optional(),
    return: z.boolean().optional(),
  })
  .strict();

const ParameterDraftSchema = z
  .object({
    name: z.string().max(200).optional(),
    type: TypeDraftSchema,
    optional: z.boolean().optional(),
    rest: z.boolean().optional(),
    defaultValue: ValueDraftSchema.optional(),
  })
  .strict();

export const OperationDraftSchema = z
  .object({
    name: z.string().min(1).max(200),
    parameters: z.array(ParameterDraftSchema).max(MAX_PARAMETERS),
    statements: z.array(StatementDraftSchema).max(MAX_STATEMENTS),
  })
  .strict();

export type TypeDraft =
  | { kind: "unknown" | "undefined" | "string" | "number" | "boolean" }
  | { kind: "array"; elementType: TypeDraft }
  | {
      kind: "object";
      properties: { key: string; value: TypeDraft; required?: boolean }[];
    };

export type ValueDraft =
  | { kind: "undefined" }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "reference"; name: string }
  | { kind: "array"; items: ValueDraft[] }
  | { kind: "object"; entries: { key: string; value: ValueDraft }[] };

export type OperationDraft = z.infer<typeof OperationDraftSchema>;

export type AgentDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  repairable: boolean;
  fileId?: string;
  packageName?: string;
};

export type ResolvedAgentOperation = {
  name: string;
  source: "core" | "package" | "project";
  fileId?: string;
  parameters: OperationType["parameters"];
  resultType: DataType | { kind: "unresolved" };
  operationSource?: IData<OperationType>["value"]["source"];
};

export type AgentProposalReview = {
  operationName: string;
  parameters: { before: number; after: number };
  statements: { before: number; after: number };
  operationCalls: { before: number; after: number };
  returnType: { before: string; after: string };
  generatedSyntax: "valid" | "invalid";
  files?: {
    change: "create" | "update" | "delete";
    operationName: string;
    parameters: { before: number; after: number };
    statements: { before: number; after: number };
    operationCalls: { before: number; after: number };
    returnType: { before: string; after: string };
    generatedSyntax?: "valid" | "invalid";
  }[];
  packages?: { enabled: string[]; disabled: string[] };
};

export type AgentProposal = {
  id: string;
  projectId: string;
  threadId?: string;
  fileId: string;
  baseFingerprint: string;
  sourcePrompt: string;
  draft: OperationDraft;
  proposedFile?: Extract<ProjectFile, { type: "operation" }>;
  proposedState?: AgentHistoryState;
  revisionState?: AgentHistoryState;
  diagnostics: AgentDiagnostic[];
  review?: AgentProposalReview;
  repairAttempt?: number;
  manualDeploymentAfterApply?: boolean;
};

export type AgentHistoryState = {
  operationFiles: {
    index: number;
    file: Extract<ProjectFile, { type: "operation" }>;
  }[];
  npmDependencies: NonNullable<NonNullable<Project["dependencies"]>["npm"]>;
};

export type AgentProposalAction =
  | { action: "create"; draft: unknown }
  | { action: "replace"; fileId: string; draft: unknown }
  | { action: "delete"; fileId: string };

type OperationResolver = (
  handle: string,
  inputType: DataType
) => ResolvedAgentOperation;

function createValidationContext(project: Project): Context {
  const context = {} as Context;
  Object.assign(context, {
    scopeId: "agent-proposal",
    variables: createFileVariables(project.files),
    packageAliases: getAliasesFromPackages(getEnabledPackages(project)),
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
  } satisfies Context);
  return context;
}

function toDataType(draft: TypeDraft, depth = 0): DataType {
  if (depth >= MAX_DEPTH) return { kind: "unknown" };
  if (draft.kind === "array") {
    return {
      kind: "array",
      elementType: toDataType(draft.elementType, depth + 1),
    };
  }
  if (draft.kind === "object") {
    return {
      kind: "object",
      properties: draft.properties.map((property) => ({
        key: property.key,
        value: toDataType(property.value, depth + 1),
      })),
      required: draft.properties
        .filter((property) => property.required)
        .map((property) => property.key),
    };
  }
  return draft;
}

function isTypeDraftTooDeep(draft: TypeDraft, depth = 0): boolean {
  if (depth >= MAX_DEPTH) return true;
  if (draft.kind === "array") {
    return isTypeDraftTooDeep(draft.elementType, depth + 1);
  }
  return (
    draft.kind === "object" &&
    draft.properties.some((property) =>
      isTypeDraftTooDeep(property.value, depth + 1)
    )
  );
}

function countOperationCalls(statements: IStatement[]) {
  let count = 0;
  const visited = new WeakSet<IStatement>();
  for (const statement of statements) {
    walkStatement(
      statement,
      {
        onStatement: (nested) => {
          if (visited.has(nested)) return;
          visited.add(nested);
          count += nested.operations.length;
        },
      },
      { nestedOperations: true }
    );
  }
  return count;
}

function propagateOperationFiles(
  files: ProjectFile[],
  changedFile: Extract<ProjectFile, { type: "operation" }>,
  context: Context
) {
  let propagated = updateFiles(files, () => undefined, context, changedFile);
  const operationCount = files.filter(
    (file) => file.type === "operation"
  ).length;
  for (let pass = 1; pass < operationCount; pass++) {
    const next = updateFiles(propagated, () => undefined, context);
    if (isEqual(next, propagated)) break;
    propagated = next;
  }
  return propagated;
}

export function getAgentHistoryState(project: Project): AgentHistoryState {
  return structuredClone({
    operationFiles: (project.files ?? []).flatMap((file, index) =>
      file.type === "operation" ? [{ index, file }] : []
    ),
    npmDependencies: project.dependencies?.npm ?? [],
  });
}

function projectWithAgentState(project: Project, state?: AgentHistoryState) {
  if (!state) return structuredClone(project);
  const operationFiles = new Map(
    state.operationFiles.map(({ file }) => [file.id, structuredClone(file)])
  );
  const files: ProjectFile[] = project.files
    .filter((file) => file.type !== "operation")
    .map((file) => structuredClone(file));
  for (const { index, file } of state.operationFiles) {
    files.splice(
      Math.min(index, files.length),
      0,
      operationFiles.get(file.id)!
    );
  }
  return {
    ...structuredClone(project),
    files,
    dependencies: {
      ...structuredClone(project.dependencies),
      npm: structuredClone(state.npmDependencies),
    },
  };
}

function getPackageChanges(project: Project, state: AgentHistoryState) {
  const before = new Set(
    (project.dependencies?.npm ?? []).map((dependency) => dependency.name)
  );
  const after = new Set(
    state.npmDependencies.map((dependency) => dependency.name)
  );
  return {
    enabled: [...after].filter((name) => !before.has(name)).sort(),
    disabled: [...before].filter((name) => !after.has(name)).sort(),
  };
}

function deriveProposalReview({
  project,
  state,
  primaryFileId,
  fallbackName,
  invalidOperationIds = new Set<string>(),
}: {
  project: Project;
  state: AgentHistoryState;
  primaryFileId?: string;
  fallbackName: string;
  invalidOperationIds?: Set<string>;
}) {
  const finalProject = projectWithAgentState(project, state);
  const beforeContext = createValidationContext(project);
  const afterContext = createValidationContext(finalProject);
  const beforeFiles = new Map(
    project.files.flatMap((file) =>
      file.type === "operation" ? [[file.id, file] as const] : []
    )
  );
  const afterFiles = new Map(
    state.operationFiles.map(({ file }) => [file.id, file] as const)
  );
  const changed = [
    ...state.operationFiles
      .map(({ file }) => file.id)
      .filter((id) => !isEqual(beforeFiles.get(id), afterFiles.get(id))),
    ...project.files.flatMap((file) =>
      file.type === "operation" && !afterFiles.has(file.id) ? [file.id] : []
    ),
  ];
  const reviews: Array<{
    id: string;
    review: NonNullable<AgentProposalReview["files"]>[number];
  }> = [];

  for (const id of changed) {
    const beforeFile = beforeFiles.get(id);
    const afterFile = afterFiles.get(id);
    const beforeOperation = beforeFile && createOperationFromFile(beforeFile);
    const afterOperation = afterFile && createOperationFromFile(afterFile);
    const generatedSyntax = afterOperation
      ? invalidOperationIds.has(id)
        ? "invalid"
        : "valid"
      : undefined;
    reviews.push({
      id,
      review: {
        change: beforeFile ? (afterFile ? "update" : "delete") : "create",
        operationName: afterFile?.name ?? beforeFile?.name ?? fallbackName,
        parameters: {
          before: beforeOperation?.value.parameters.length ?? 0,
          after: afterOperation?.value.parameters.length ?? 0,
        },
        statements: {
          before: beforeOperation?.value.statements.length ?? 0,
          after: afterOperation?.value.statements.length ?? 0,
        },
        operationCalls: {
          before: beforeOperation
            ? countOperationCalls([
                ...beforeOperation.value.parameters,
                ...beforeOperation.value.statements,
              ])
            : 0,
          after: afterOperation
            ? countOperationCalls([
                ...afterOperation.value.parameters,
                ...afterOperation.value.statements,
              ])
            : 0,
        },
        returnType: {
          before: beforeOperation
            ? getTypeSignature(beforeOperation.type.result, beforeContext)
            : "undefined",
          after: afterOperation
            ? getTypeSignature(afterOperation.type.result, afterContext)
            : "undefined",
        },
        generatedSyntax,
      },
    });
  }

  const primaryReview = reviews.find(({ id }) => id === primaryFileId)?.review;
  const primaryFile =
    (primaryFileId &&
      (afterFiles.get(primaryFileId) ?? beforeFiles.get(primaryFileId))) ||
    undefined;
  const primaryOperation = primaryFile && createOperationFromFile(primaryFile);
  const unchangedCount = primaryOperation
    ? countOperationCalls([
        ...primaryOperation.value.parameters,
        ...primaryOperation.value.statements,
      ])
    : 0;
  const unchangedReturn = primaryOperation
    ? getTypeSignature(
        primaryOperation.type.result,
        afterFiles.has(primaryFile.id) ? afterContext : beforeContext
      )
    : "undefined";
  const primary =
    primaryReview ??
    ({
      operationName: primaryFile?.name ?? fallbackName,
      parameters: {
        before: primaryOperation?.value.parameters.length ?? 0,
        after: primaryOperation?.value.parameters.length ?? 0,
      },
      statements: {
        before: primaryOperation?.value.statements.length ?? 0,
        after: primaryOperation?.value.statements.length ?? 0,
      },
      operationCalls: { before: unchangedCount, after: unchangedCount },
      returnType: { before: unchangedReturn, after: unchangedReturn },
      generatedSyntax: "valid" as const,
    } satisfies Omit<AgentProposalReview, "files" | "packages">);

  return {
    ...primary,
    generatedSyntax: primary.generatedSyntax ?? "valid",
    files: reviews.map(({ review }) => review),
    packages: getPackageChanges(project, state),
  } satisfies AgentProposalReview;
}

const walkProjectFileData = (
  file: ProjectFile,
  visitors: Parameters<typeof walkData>[1]
) => {
  const walk = (data: IData) =>
    walkData(data, visitors, {
      dataTypes: true,
      nestedOperations: true,
      operationCalls: true,
    });

  if (file.type === "operation") {
    const operation = createOperationFromFile(file);
    if (operation) walk(operation);
    for (const test of file.tests ?? []) {
      for (const input of test.inputs) walk(input);
      walk(test.expectedOutput);
    }
  } else if (file.type === "globals") {
    for (const data of Object.values(file.content)) walk(data);
  }
};

function referencesProjectFile(file: ProjectFile, fileId: string) {
  let referenced = false;
  walkProjectFileData(file, {
    onReference: (data) => {
      referenced ||= data.value.id === fileId;
    },
  });
  return referenced;
}

function referencesPackage(file: ProjectFile, packageName: string) {
  let referenced = false;
  const matchesSource = (name?: string) =>
    !!name &&
    (name === packageName || SOURCE_PACKAGE_MAP[name] === packageName);
  walkProjectFileData(file, {
    onOperation: (data) => {
      referenced ||=
        matchesSource(data.value.source?.name) ||
        !!data.value.name?.startsWith(`${packageName}.`);
    },
    onInstance: (data) => {
      referenced ||= matchesSource(data.value.className);
    },
    onDataType: (type) => {
      if (type.kind === "instance") {
        referenced ||= matchesSource(type.className);
      }
    },
  });
  return referenced;
}

export function getAgentEditableFingerprint(project: Project) {
  return JSON.stringify(getAgentHistoryState(project));
}

export function isAgentProposalStale(
  proposal: AgentProposal,
  project?: Project
) {
  return (
    !project ||
    project.id !== proposal.projectId ||
    getAgentEditableFingerprint(project) !== proposal.baseFingerprint
  );
}

export async function createAgentProposal({
  project,
  fileId,
  anchorFileId,
  previousState,
  create,
  draft: input,
  sourcePrompt,
  resolveOperation,
}: {
  project: Project;
  fileId?: string;
  anchorFileId?: string;
  previousState?: AgentHistoryState;
  create?: boolean;
  draft: unknown;
  sourcePrompt: string;
  resolveOperation: OperationResolver;
}): Promise<AgentProposal> {
  const workingProject = projectWithAgentState(project, previousState);
  const base = {
    id: nanoid(),
    projectId: project.id,
    fileId: anchorFileId ?? fileId ?? "",
    baseFingerprint: getAgentEditableFingerprint(project),
    sourcePrompt,
  };
  const parsed = OperationDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...base,
      draft: { name: "invalid", parameters: [], statements: [] },
      diagnostics: [
        {
          code: "invalid_draft",
          severity: "error",
          message: parsed.error.issues[0]?.message ?? "Invalid operation draft",
          repairable: true,
        },
      ],
    };
  }

  const draft = parsed.data;
  const existingFile = workingProject.files.find(
    (candidate): candidate is Extract<ProjectFile, { type: "operation" }> =>
      candidate.id === fileId && candidate.type === "operation"
  );
  const file = create
    ? (createProjectFile({ type: "operation", name: draft.name }) as Extract<
        ProjectFile,
        { type: "operation" }
      >)
    : existingFile;
  const diagnostics: AgentDiagnostic[] = [];
  const addError = (code: string, message: string) => {
    if (diagnostics.length < MAX_DIAGNOSTICS) {
      diagnostics.push({ code, severity: "error", message, repairable: true });
    }
  };
  if (!file) {
    return {
      ...base,
      draft,
      diagnostics: [
        {
          code: "unknown_operation",
          severity: "error",
          message: "The selected operation no longer exists",
          repairable: false,
        },
      ],
    };
  }
  if (
    file.content.value.parameters.some(
      (parameter) => parameter.operations.length > 0
    )
  ) {
    addError(
      "unsupported_parameter_operations",
      "Parameter operation chains are not supported in proposals yet"
    );
  }
  if (!isValidIdentifier(draft.name)) {
    addError(
      "invalid_operation_name",
      "Operation name must be a valid identifier"
    );
  }

  if (
    workingProject.files.some(
      (candidate) =>
        candidate.type === "operation" &&
        candidate.id !== file.id &&
        candidate.name === draft.name
    )
  ) {
    addError(
      "duplicate_operation_name",
      `Operation ${draft.name} already exists`
    );
  }

  const context = createValidationContext(workingProject);
  context.variables.delete(file.name);
  const scope = context.variables;
  const names = new Set<string>();
  let optionalSeen = false;

  const createValue = (value: ValueDraft, depth = 0): IData | undefined => {
    if (depth >= MAX_DEPTH) {
      addError(
        "draft_too_deep",
        `Draft values cannot exceed depth ${MAX_DEPTH}`
      );
      return;
    }
    if (value.kind === "reference") {
      if (value.name === file.name) {
        addError(
          "unsupported_self_reference",
          "An operation cannot reference itself in a proposal"
        );
        return;
      }
      const variable = scope.get(value.name);
      if (!variable) {
        addError("unresolved_reference", `Unknown reference ${value.name}`);
        return;
      }
      return createData({
        type: { kind: "reference", name: value.name },
        value: { name: value.name, id: variable.data.id },
      });
    }
    if (value.kind === "array") {
      const items = value.items.map((item) => {
        const data = createValue(item, depth + 1) ?? createData();
        return createStatement({ data });
      });
      return createData({
        type: inferTypeFromValue(items, context),
        value: items,
      });
    }
    if (value.kind === "object") {
      const keys = new Set<string>();
      for (const entry of value.entries) {
        if (keys.has(entry.key)) {
          addError("duplicate_object_key", `Duplicate object key ${entry.key}`);
        }
        keys.add(entry.key);
      }
      const entries = value.entries.map((entry) => ({
        key: entry.key,
        value: createStatement({
          data: createValue(entry.value, depth + 1) ?? createData(),
        }),
      }));
      return createData({
        type: inferTypeFromValue({ entries }, context),
        value: { entries },
      });
    }
    if (value.kind === "string") {
      return createData({ type: { kind: "string" }, value: value.value });
    }
    if (value.kind === "number") {
      return createData({ type: { kind: "number" }, value: value.value });
    }
    if (value.kind === "boolean") {
      return createData({ type: { kind: "boolean" }, value: value.value });
    }
    return createData({ type: { kind: "undefined" } });
  };

  const parameters = draft.parameters.map((parameter, index) => {
    const type = toDataType(parameter.type);
    if (isTypeDraftTooDeep(parameter.type)) {
      addError(
        "draft_too_deep",
        `Draft types cannot exceed depth ${MAX_DEPTH}`
      );
    }
    if (parameter.name) {
      if (!isValidIdentifier(parameter.name)) {
        addError(
          "invalid_parameter_name",
          `Parameter ${parameter.name} must be a valid identifier`
        );
      } else if (names.has(parameter.name)) {
        addError("duplicate_name", `Duplicate name ${parameter.name}`);
      }
      names.add(parameter.name);
    }
    if (parameter.rest && index !== draft.parameters.length - 1) {
      addError("invalid_rest_parameter", "A rest parameter must be last");
    }
    if (parameter.rest && parameter.optional) {
      addError(
        "invalid_rest_parameter",
        "A rest parameter cannot also be optional"
      );
    }
    if (optionalSeen && !parameter.optional && !parameter.rest) {
      addError(
        "invalid_parameter_order",
        "Required parameters cannot follow optional parameters"
      );
    }
    optionalSeen ||= !!parameter.optional;
    const defaultData = parameter.defaultValue
      ? createValue(parameter.defaultValue)
      : createData({ type });
    if (defaultData && !isTypeCompatible(defaultData.type, type, context)) {
      addError(
        "invalid_default_value",
        `Default value for ${parameter.name ?? `parameter ${index + 1}`} has the wrong type`
      );
    }
    const statement = createStatement({
      name: parameter.name,
      data: defaultData ?? createData({ type }),
      isOptional: parameter.optional,
      isRest: parameter.rest,
    });
    if (parameter.name) {
      scope.set(parameter.name, {
        data: {
          ...statement.data,
          id: statement.id,
          type: parameter.optional
            ? resolveUnionType([type, { kind: "undefined" }], true)
            : type,
        },
      });
    }
    return statement;
  });

  const statements: IStatement[] = [];
  let returnSeen = false;
  for (const statementDraft of draft.statements) {
    if (returnSeen) {
      addError(
        "unreachable_statement",
        "Statements cannot follow a top-level return"
      );
    }
    if (statementDraft.name) {
      if (!isValidIdentifier(statementDraft.name)) {
        addError(
          "invalid_statement_name",
          `Statement ${statementDraft.name} must be a valid identifier`
        );
      } else if (names.has(statementDraft.name)) {
        addError("duplicate_name", `Duplicate name ${statementDraft.name}`);
      }
      names.add(statementDraft.name);
    }
    const data = createValue(statementDraft.value) ?? createData();
    let currentType = isDataOfType(data, "reference")
      ? (scope.get(data.value.name)?.data.type ?? data.type)
      : data.type;
    const operations: IData<OperationType>[] = [];
    for (const call of statementDraft.operations ?? []) {
      let descriptor: ResolvedAgentOperation;
      try {
        descriptor = resolveOperation(call.operationHandle, currentType);
      } catch (error) {
        addError(
          "invalid_operation_handle",
          error instanceof Error ? error.message : "Invalid operation handle"
        );
        continue;
      }
      if (descriptor.resultType.kind === "unresolved") {
        addError(
          "unresolved_operation_type",
          `Could not resolve the result type of ${descriptor.name}`
        );
        continue;
      }
      const sourceParameters = descriptor.parameters;
      const argumentParameters = sourceParameters.slice(1);
      const required = argumentParameters.filter(
        (parameter) => !parameter.isOptional && !parameter.isRest
      ).length;
      const rest = argumentParameters.at(-1)?.isRest;
      if (
        call.arguments.length < required ||
        (!rest && call.arguments.length > argumentParameters.length)
      ) {
        addError(
          "invalid_argument_count",
          `${descriptor.name} expects ${required}${rest ? " or more" : `-${argumentParameters.length}`} arguments`
        );
      }
      const args = call.arguments.map((argument, index) => {
        const value = createValue(argument) ?? createData();
        const valueType = isDataOfType(value, "reference")
          ? (scope.get(value.value.name)?.data.type ?? value.type)
          : value.type;
        const expected = rest
          ? argumentParameters[Math.min(index, argumentParameters.length - 1)]
          : argumentParameters[index];
        if (expected && !isTypeCompatible(valueType, expected.type, context)) {
          addError(
            "invalid_argument_type",
            `Argument ${index + 1} of ${descriptor.name} has the wrong type`
          );
        }
        return createStatement({ data: value });
      });
      if (
        descriptor.source !== "project" &&
        sourceParameters[0] &&
        !isTypeCompatible(currentType, sourceParameters[0].type, context)
      ) {
        addError(
          "invalid_chain_input",
          `${descriptor.name} cannot follow the current ${currentType.kind} value`
        );
      }
      if (descriptor.source === "project") {
        if (
          !isDataOfType(data, "reference") ||
          data.value.id !== descriptor.fileId
        ) {
          addError(
            "invalid_project_call",
            `${descriptor.name} must be called from its project-operation reference`
          );
        }
      }
      operations.push(
        createData({
          type: {
            kind: "operation",
            parameters: sourceParameters,
            result: descriptor.resultType,
          },
          value: {
            name: descriptor.source === "project" ? "call" : descriptor.name,
            parameters: args,
            statements: [],
            source: descriptor.operationSource,
          },
        })
      );
      currentType = descriptor.resultType;
    }
    const statement = createStatement({
      name: statementDraft.name,
      data,
      operations,
      controlFlow: statementDraft.return ? "return" : undefined,
    });
    statements.push(statement);
    returnSeen ||= !!statementDraft.return;
    if (statementDraft.name) {
      scope.set(statementDraft.name, {
        data: { ...data, id: statement.id, type: currentType },
      });
    }
  }

  const returned = statements.filter(
    (statement) => statement.controlFlow === "return"
  );
  const last = returned[0] ?? statements.at(-1);
  const lastResult =
    last?.operations.at(-1)?.type.result ??
    (last && isDataOfType(last.data, "reference")
      ? scope.get(last.data.value.name)?.data.type
      : last?.data.type);
  const isAsync = getIsAsync([...parameters, ...statements]);
  const operationType: OperationType = {
    kind: "operation",
    parameters: parameters.map((parameter, index) => ({
      name: parameter.name,
      type: toDataType(draft.parameters[index].type),
      isOptional: parameter.isOptional,
      isRest: parameter.isRest,
    })),
    result: isAsync
      ? {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
          result: lastResult ?? { kind: "undefined" },
        }
      : (lastResult ?? { kind: "undefined" }),
  };
  const proposedFile: Extract<ProjectFile, { type: "operation" }> = {
    ...file,
    name: draft.name,
    content: {
      type: operationType,
      value: {
        ...file.content.value,
        parameters,
        statements,
        name: draft.name,
        isAsync,
      },
    },
  };

  const inputFiles = create
    ? [...workingProject.files, proposedFile]
    : workingProject.files;
  const finalFiles = propagateOperationFiles(inputFiles, proposedFile, context);
  const finalProject = { ...workingProject, files: finalFiles };
  const proposedState = getAgentHistoryState(finalProject);
  const ids = new Set<string>();
  const operationNames = new Set<string>();
  for (const candidate of proposedState.operationFiles.map(
    ({ file }) => file
  )) {
    const structural = ProjectFileSchema.safeParse(candidate);
    if (!structural.success) {
      addError(
        "invalid_operation",
        structural.error.issues[0]?.message ?? "Invalid operation"
      );
    }
    if (ids.has(candidate.id))
      addError("duplicate_operation_id", "Operation IDs must be unique");
    if (operationNames.has(candidate.name)) {
      addError("duplicate_operation_name", "Operation names must be unique");
    }
    ids.add(candidate.id);
    operationNames.add(candidate.name);
  }

  const invalidOperationIds = new Set<string>();
  for (const { file: candidate } of proposedState.operationFiles) {
    const previous = project.files.find((file) => file.id === candidate.id);
    if (isEqual(previous, candidate)) continue;
    try {
      await formatCode(
        generateOperation(
          createOperationFromFile(candidate)!,
          createValidationContext(finalProject)
        )
      );
    } catch {
      invalidOperationIds.add(candidate.id);
      addError(
        "invalid_generated_syntax",
        `Operation ${candidate.name} does not produce valid generated syntax`
      );
    }
  }
  const review = deriveProposalReview({
    project,
    state: proposedState,
    primaryFileId: proposedFile.id,
    fallbackName: draft.name,
    invalidOperationIds,
  });
  if (
    review.files?.length === 0 &&
    review.packages?.enabled.length === 0 &&
    review.packages.disabled.length === 0
  ) {
    addError("no_changes", "The replacement does not change the project");
  }

  return {
    ...base,
    draft,
    proposedFile: finalFiles.find(
      (candidate): candidate is Extract<ProjectFile, { type: "operation" }> =>
        candidate.id === proposedFile.id && candidate.type === "operation"
    ),
    proposedState,
    diagnostics,
    review,
  };
}

export function deleteAgentOperationProposal({
  project,
  anchorFileId,
  fileId,
  previousState,
  sourcePrompt,
}: {
  project: Project;
  anchorFileId: string;
  fileId: string;
  previousState?: AgentHistoryState;
  sourcePrompt: string;
}): AgentProposal {
  const workingProject = projectWithAgentState(project, previousState);
  const target = workingProject.files.find(
    (file): file is Extract<ProjectFile, { type: "operation" }> =>
      file.id === fileId && file.type === "operation"
  );
  const base = {
    id: nanoid(),
    projectId: project.id,
    fileId: anchorFileId,
    baseFingerprint: getAgentEditableFingerprint(project),
    sourcePrompt,
    draft: {
      name: target?.name ?? "invalid",
      parameters: [],
      statements: [],
    },
  };
  if (!target) {
    return {
      ...base,
      diagnostics: [
        {
          code: "unknown_operation",
          severity: "error",
          message: "The target operation no longer exists",
          repairable: true,
        },
      ],
    };
  }
  const remainingFiles = workingProject.files.filter(
    (file) => file.id !== target.id
  );
  const referencing = remainingFiles
    .filter((file) => referencesProjectFile(file, target.id))
    .map((file) => file.name)
    .sort();
  if (referencing.length > 0) {
    return {
      ...base,
      diagnostics: [
        {
          code: "operation_in_use",
          severity: "error",
          message: `Cannot delete ${target.name}; referenced by ${referencing.join(", ")}`,
          repairable: true,
          fileId: target.id,
        },
      ],
    };
  }
  const finalProject = {
    ...workingProject,
    files: remainingFiles,
  };
  const proposedState = getAgentHistoryState(finalProject);
  return {
    ...base,
    proposedState,
    proposedFile: proposedState.operationFiles.find(
      ({ file }) => file.id === anchorFileId
    )?.file,
    diagnostics: [],
    review: deriveProposalReview({
      project,
      state: proposedState,
      primaryFileId: target.id,
      fallbackName: target.name,
    }),
  };
}

export function createAgentPackageProposal({
  project,
  anchorFileId,
  previousState,
  sourcePrompt,
  name,
  enabled,
}: {
  project: Project;
  anchorFileId: string;
  previousState?: AgentHistoryState;
  sourcePrompt: string;
  name: string;
  enabled: boolean;
}): AgentProposal {
  if (!PACKAGE_CATALOG[name]) throw new Error(`Unsupported package: ${name}`);
  const workingProject = projectWithAgentState(project, previousState);
  const currentState = getAgentHistoryState(workingProject);
  const anchor = currentState.operationFiles.find(
    ({ file }) => file.id === anchorFileId
  )?.file;
  const base = {
    id: nanoid(),
    projectId: project.id,
    fileId: anchorFileId,
    baseFingerprint: getAgentEditableFingerprint(project),
    sourcePrompt,
    draft: {
      name: anchor?.name ?? "packageChange",
      parameters: [],
      statements: [],
    },
  };
  if (
    !enabled &&
    workingProject.files.some((file) => referencesPackage(file, name))
  ) {
    return {
      ...base,
      diagnostics: [
        {
          code: "package_in_use",
          severity: "error",
          message: `Cannot disable ${name}; proposed operations still reference it`,
          repairable: true,
          packageName: name,
        },
      ],
    };
  }
  const proposedState = {
    ...currentState,
    npmDependencies: applySupportedPackageChanges(
      currentState.npmDependencies,
      [{ name, enabled }]
    ),
  };
  const review = deriveProposalReview({
    project,
    state: proposedState,
    primaryFileId: anchorFileId,
    fallbackName: "Packages",
  });
  const diagnostics: AgentDiagnostic[] = [];
  if (
    review.files?.length === 0 &&
    review.packages?.enabled.length === 0 &&
    review.packages.disabled.length === 0
  ) {
    diagnostics.push({
      code: "no_changes",
      severity: "error",
      message: "The replacement does not change the project",
      repairable: true,
    });
  }
  return {
    ...base,
    proposedState,
    proposedFile: anchor,
    diagnostics,
    review,
  };
}
