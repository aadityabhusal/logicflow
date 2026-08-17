import { nanoid } from "nanoid";
import isEqual from "react-fast-compare";
import { z } from "zod";
import type { Context, OperationListItem } from "../execution/types";
import { formatCode, generateOperation } from "../format-code";
import { coreOperations } from "../operations/built-in";
import {
  applySupportedPackageChanges,
  getAliasesFromPackages,
  getEnabledPackages,
  PACKAGE_CATALOG,
} from "../packages/catalog";
import {
  loadPackageDescriptor,
  SOURCE_PACKAGE_MAP,
} from "../packages/registry";
import { IStatementSchema, ProjectFileSchema, ProjectSchema } from "../schemas";
import type {
  IData,
  IStatement,
  OperationType,
  Project,
  ProjectFile,
  ReferenceType,
} from "../types";
import { updateFiles, updateStatements } from "../update";
import {
  createData,
  createFileVariables,
  createOperationFromFile,
  createTypeFromStatement,
  getIsAsync,
  getOperationResultType,
  getStatementResult,
  getTypeSignature,
  isDataOfType,
  isTypeCompatible,
  isValidIdentifier,
  resolveParameters,
} from "../utils";
import { walkData, walkStatement } from "../walk";

const MAX_ACTIONS = 20;
const MAX_PACKAGE_ENABLES = 3;
const MAX_DIAGNOSTICS = 20;
const MAX_PAYLOAD_BYTES = 200_000;
const StatementIdSchema = z.string().min(1).max(200);
const ContainerSchema = z.enum(["parameters", "body"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeNestedOperationValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeNestedOperationValues);
  if (!isRecord(value)) return value;

  let normalized = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      normalizeNestedOperationValues(entry),
    ])
  );
  const type = normalized.type;
  if (
    !("value" in normalized) &&
    isRecord(type) &&
    type.kind === "operation" &&
    "value" in type
  ) {
    const { value: operationValue, ...operationType } = type;
    normalized = { ...normalized, type: operationType, value: operationValue };
  }

  if ("data" in normalized) {
    if (!("id" in normalized)) normalized.id = nanoid();
    if (!("operations" in normalized)) normalized.operations = [];
  }
  const normalizedType = normalized.type;
  if (
    !("id" in normalized) &&
    isRecord(normalizedType) &&
    typeof normalizedType.kind === "string" &&
    ("value" in normalized || normalizedType.kind === "undefined")
  )
    normalized.id = nanoid();

  return normalized;
}

const InsertStatementSchema = z
  .object({
    kind: z.literal("insert_statement"),
    container: ContainerSchema,
    beforeStatementId: StatementIdSchema.nullable(),
    statement: IStatementSchema,
  })
  .strict();
const ReplaceStatementSchema = z
  .object({
    kind: z.literal("replace_statement"),
    statementId: StatementIdSchema,
    statement: IStatementSchema,
  })
  .strict();
const DeleteStatementSchema = z
  .object({
    kind: z.literal("delete_statement"),
    statementId: StatementIdSchema,
  })
  .strict();
const MoveStatementSchema = z
  .object({
    kind: z.literal("move_statement"),
    statementId: StatementIdSchema,
    beforeStatementId: StatementIdSchema.nullable(),
  })
  .strict();

export const AgentStatementActionSchema = z.discriminatedUnion("kind", [
  InsertStatementSchema,
  ReplaceStatementSchema,
  DeleteStatementSchema,
  MoveStatementSchema,
]);

const AgentOperationUpdateObjectSchema = z
  .object({
    explanation: z.string().max(10_000),
    enablePackages: z
      .array(
        z
          .string()
          .refine((name) => !!PACKAGE_CATALOG[name], "Unsupported package")
      )
      .max(MAX_PACKAGE_ENABLES),
    changes: z.array(AgentStatementActionSchema).max(MAX_ACTIONS),
  })
  .strict()
  .superRefine((update, context) => {
    if (new Set(update.enablePackages).size !== update.enablePackages.length) {
      context.addIssue({
        code: "custom",
        message: "Package enables must be unique",
      });
    }
    if (JSON.stringify(update).length > MAX_PAYLOAD_BYTES) {
      context.addIssue({
        code: "custom",
        message: "Update payload is too large",
      });
    }
  });

export const AgentOperationUpdateSchema = z.preprocess(
  normalizeNestedOperationValues,
  AgentOperationUpdateObjectSchema
);

export type AgentStatementAction = z.infer<typeof AgentStatementActionSchema>;
export type AgentOperationUpdate = z.infer<typeof AgentOperationUpdateSchema>;

export type AgentDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  repairable: boolean;
  fileId?: string;
  packageName?: string;
};

export type AgentProposalReviewAction = {
  kind: AgentStatementAction["kind"];
  container: "parameters" | "body";
  statementId?: string;
  statementName?: string;
  beforeStatementId?: string | null;
};

type OperationReview = {
  change: "update";
  operationName: string;
  parameters: { before: number; after: number };
  statements: { before: number; after: number };
  operationCalls: { before: number; after: number };
  returnType: { before: string; after: string };
  generatedSyntax: "valid" | "invalid";
};

export type AgentProposalReview = Omit<OperationReview, "change"> & {
  actions: AgentProposalReviewAction[];
  files: OperationReview[];
  packages: { enabled: string[]; disabled: [] };
};

export type AgentHistoryState = {
  operationFiles: {
    index: number;
    file: Extract<ProjectFile, { type: "operation" }>;
  }[];
  npmDependencies: NonNullable<NonNullable<Project["dependencies"]>["npm"]>;
};

export type AgentProposal = {
  id: string;
  projectId: string;
  threadId?: string;
  fileId: string;
  baseFingerprint: string;
  sourcePrompt: string;
  requestContext?: string;
  update: AgentOperationUpdate;
  proposedFile?: Extract<ProjectFile, { type: "operation" }>;
  proposedState?: AgentHistoryState;
  diagnostics: AgentDiagnostic[];
  review?: AgentProposalReview;
};

type OperationFile = Extract<ProjectFile, { type: "operation" }>;
type Container = AgentProposalReviewAction["container"];

function createValidationContext(project: Project): Context {
  const context = {
    scopeId: "agent-proposal",
    variables: new Map(),
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
  } as Context;
  context.variables = createFileVariables(project.files);
  return context;
}

function projectWithAgentState(project: Project, state: AgentHistoryState) {
  const files: ProjectFile[] = project.files.flatMap((file) =>
    file.type === "operation" ? [] : [structuredClone(file)]
  );
  for (const { index, file } of [...state.operationFiles].sort(
    (a, b) => a.index - b.index
  )) {
    files.splice(Math.min(index, files.length), 0, structuredClone(file));
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

export function getAgentHistoryState(project: Project): AgentHistoryState {
  return structuredClone({
    operationFiles: project.files.flatMap((file, index) =>
      file.type === "operation" ? [{ index, file }] : []
    ),
    npmDependencies: project.dependencies?.npm ?? [],
  });
}

export function getAgentEditableFingerprint(project: Project) {
  return JSON.stringify({
    operationFiles: getAgentHistoryState(project).operationFiles,
    npmDependencies: project.dependencies?.npm ?? [],
    files: project.files.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      tags: file.tags,
      ...(file.type === "globals" ? { content: file.content } : {}),
    })),
  });
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

function remapStatement(
  statement: IStatement,
  rootId?: string,
  sharedIds = new Map<string, string>()
) {
  const clone = structuredClone(statement);
  const ids = new Map(sharedIds);
  walkStatement(
    clone,
    {
      onStatement: (value) =>
        ids.set(
          value.id,
          value === clone && rootId ? rootId : (ids.get(value.id) ?? nanoid())
        ),
      onData: (value) => {
        if (!ids.has(value.id)) ids.set(value.id, nanoid());
        if (isDataOfType(value, "operation") && value.value.instanceId)
          ids.set(
            value.value.instanceId,
            ids.get(value.value.instanceId) ?? nanoid()
          );
        if (isDataOfType(value, "instance") && value.type.className !== "File")
          ids.set(
            value.value.instanceId,
            ids.get(value.value.instanceId) ?? nanoid()
          );
      },
    },
    { nestedOperations: true, operationCalls: true }
  );
  walkStatement(
    clone,
    {
      onStatement: (value) => (value.id = ids.get(value.id)!),
      onData: (value) => {
        value.id = ids.get(value.id)!;
        if (isDataOfType(value, "reference")) {
          value.value.id = ids.get(value.value.id) ?? value.value.id;
        }
        if (isDataOfType(value, "operation") && value.value.instanceId)
          value.value.instanceId = ids.get(value.value.instanceId)!;
        if (isDataOfType(value, "instance") && value.type.className !== "File")
          value.value.instanceId = ids.get(value.value.instanceId)!;
      },
    },
    { nestedOperations: true, operationCalls: true }
  );
  return clone;
}

function locate(file: OperationFile, id: string) {
  const matches = [
    ...file.content.value.parameters.map((statement) => ({
      container: "parameters" as const,
      statement,
    })),
    ...file.content.value.statements.map((statement) => ({
      container: "body" as const,
      statement,
    })),
  ].filter(({ statement }) => statement.id === id);
  return matches;
}

function getArray(file: OperationFile, container: Container) {
  return container === "parameters"
    ? file.content.value.parameters
    : file.content.value.statements;
}

function addDiagnostic(
  diagnostics: AgentDiagnostic[],
  code: string,
  message: string,
  options?: { repairable?: boolean; fileId?: string; packageName?: string }
) {
  if (diagnostics.length >= MAX_DIAGNOSTICS) return;
  diagnostics.push({
    code,
    severity: "error",
    message,
    repairable: options?.repairable ?? true,
    fileId: options?.fileId,
    packageName: options?.packageName,
  });
}

function validateTargets(
  file: OperationFile,
  update: AgentOperationUpdate,
  diagnostics: AgentDiagnostic[]
) {
  const targeted = new Set<string>();
  const incompatibleAnchors = new Set(
    update.changes.flatMap((action) =>
      action.kind === "delete_statement" || action.kind === "move_statement"
        ? [action.statementId]
        : []
    )
  );
  for (const action of update.changes) {
    const beforeStatementId =
      action.kind === "insert_statement" || action.kind === "move_statement"
        ? action.beforeStatementId
        : undefined;
    if (beforeStatementId && incompatibleAnchors.has(beforeStatementId))
      addDiagnostic(
        diagnostics,
        "conflicting_actions",
        `Anchor ${beforeStatementId} is changed incompatibly in the same batch`
      );
    if (action.kind === "insert_statement") {
      if (action.beforeStatementId) {
        const anchor = locate(file, action.beforeStatementId);
        if (anchor.length !== 1 || anchor[0].container !== action.container) {
          addDiagnostic(
            diagnostics,
            "invalid_anchor",
            `Insert anchor "${action.beforeStatementId}" must identify one statement in the requested container`
          );
        }
      }
      continue;
    }
    const target = locate(file, action.statementId);
    if (target.length !== 1) {
      addDiagnostic(
        diagnostics,
        "invalid_statement_target",
        `Statement target "${action.statementId}" must identify exactly one selected-operation statement`
      );
      continue;
    }
    if (targeted.has(action.statementId)) {
      addDiagnostic(
        diagnostics,
        "conflicting_actions",
        `Statement ${action.statementId} is targeted more than once`
      );
    }
    targeted.add(action.statementId);
    if (action.kind === "move_statement" && action.beforeStatementId) {
      const anchor = locate(file, action.beforeStatementId);
      if (
        action.beforeStatementId === action.statementId ||
        anchor.length !== 1 ||
        anchor[0].container !== target[0].container
      ) {
        addDiagnostic(
          diagnostics,
          "invalid_anchor",
          `Move anchor "${action.beforeStatementId}" must identify one statement in the target's container`
        );
      } else {
        const statements = getArray(file, target[0].container);
        const from = statements.findIndex(
          ({ id }) => id === action.statementId
        );
        const to = statements.findIndex(
          ({ id }) => id === action.beforeStatementId
        );
        if (to < from) {
          const dependencies = new Set<string>();
          walkStatement(
            target[0].statement,
            {
              onReference: ({ value }) => dependencies.add(value.id),
            },
            { nestedOperations: true, operationCalls: true }
          );
          if (statements.slice(to, from).some(({ id }) => dependencies.has(id)))
            addDiagnostic(
              diagnostics,
              "invalid_statement_order",
              "A statement cannot be moved before one of its dependencies"
            );
        }
      }
    }
  }
}

function applyActions(file: OperationFile, update: AgentOperationUpdate) {
  const candidate = structuredClone(file);
  const review: AgentProposalReviewAction[] = [];
  const insertedIds = new Map(
    update.changes.flatMap((action) =>
      action.kind === "insert_statement"
        ? [[action.statement.id, nanoid()] as const]
        : []
    )
  );
  for (const action of update.changes) {
    if (action.kind === "insert_statement") {
      const statements = getArray(candidate, action.container);
      const index = action.beforeStatementId
        ? statements.findIndex(({ id }) => id === action.beforeStatementId)
        : statements.length;
      const statement = remapStatement(
        action.statement,
        undefined,
        insertedIds
      );
      statements.splice(index, 0, statement);
      review.push({
        ...action,
        statementId: statement.id,
        statementName: statement.name,
      });
      continue;
    }
    const target = locate(candidate, action.statementId)[0];
    if (!target) continue;
    const statements = getArray(candidate, target.container);
    const index = statements.findIndex(({ id }) => id === action.statementId);
    if (action.kind === "replace_statement") {
      const statement = remapStatement(
        action.statement,
        action.statementId,
        insertedIds
      );
      statements[index] = statement;
      review.push({
        kind: action.kind,
        container: target.container,
        statementId: action.statementId,
        statementName: statement.name,
      });
    } else if (action.kind === "delete_statement") {
      const [statement] = statements.splice(index, 1);
      review.push({
        kind: action.kind,
        container: target.container,
        statementId: action.statementId,
        statementName: statement.name,
      });
    } else {
      const [statement] = statements.splice(index, 1);
      const anchor = action.beforeStatementId
        ? statements.findIndex(({ id }) => id === action.beforeStatementId)
        : statements.length;
      statements.splice(anchor, 0, statement);
      review.push({
        ...action,
        container: target.container,
        statementName: statement.name,
      });
    }
  }
  return { candidate, review };
}

function normalizeAgentFinalReturn(
  file: OperationFile,
  actions: AgentProposalReviewAction[]
) {
  const finalStatement = file.content.value.statements.at(-1);
  if (
    finalStatement?.controlFlow === "return" &&
    actions.some(({ statementId }) => statementId === finalStatement.id)
  )
    delete finalStatement.controlFlow;
}

function requestRequiresBody(requestContext: string) {
  const userRequests = [...requestContext.matchAll(
    /\[\d+\] user:\n([\s\S]*?)(?=\n\n\[\d+\] (?:user|assistant):|$)/g
  )].map(([, content]) => content);
  const requestText = userRequests.length
    ? userRequests.join("\n")
    : requestContext;
  return /\b(?:logic|calculate|calculation|compute|computation|formula|algorithm|implementation|implement|behavior|behaviour|result|output|return|body|transform|derive|sum|average|multiply|divide|condition|conditional|filter|map)\b/i.test(
    requestText
  );
}

function validateRequestedBody(
  selected: OperationFile,
  candidate: OperationFile,
  requestContext: string,
  diagnostics: AgentDiagnostic[]
) {
  if (
    !requestRequiresBody(requestContext) ||
    selected.content.value.statements.length > 0 ||
    candidate.content.value.statements.length > 0
  )
    return;
  addDiagnostic(
    diagnostics,
    "incomplete_request",
    `Request asks for operation behavior, but ${selected.name} still has no body statements. Add the complete computation in the same update; parameters alone are incomplete.`
  );
}

function referencesId(file: OperationFile, id: string) {
  let referenced = false;
  for (const statement of [
    ...file.content.value.parameters,
    ...file.content.value.statements,
  ]) {
    walkStatement(
      statement,
      {
        onReference: (reference) => (referenced ||= reference.value.id === id),
      },
      { nestedOperations: true, operationCalls: true }
    );
  }
  return referenced;
}

function referencesOperation(
  data: IData,
  operationId: string,
  operationName?: string
) {
  return (
    isDataOfType(data, "reference") &&
    (data.value.id === operationId ||
      (operationName !== undefined && data.value.name === operationName))
  );
}

function callsOperation(
  file: OperationFile,
  operationId: string,
  operationName?: string
) {
  let found = false;
  for (const root of [
    ...file.content.value.parameters,
    ...file.content.value.statements,
  ]) {
    walkStatement(
      root,
      {
        onStatement: (statement) => {
          let current = statement.data;
          for (const call of statement.operations) {
            if (
              (call.value.name === "call" &&
                referencesOperation(current, operationId, operationName)) ||
              (operationName !== undefined &&
                call.value.name !== "call" &&
                !call.value.source &&
                call.value.name === operationName)
            )
              found = true;
            current = createData({ id: call.id, type: call.type.result });
          }
        },
      },
      { nestedOperations: true, operationCalls: true }
    );
  }
  return found;
}

function getAffectedOperationIds(
  project: Project,
  selected: OperationFile
) {
  const operationFiles = project.files.filter(
    (file): file is OperationFile => file.type === "operation"
  );
  const affected = new Set([selected.id]);
  let frontier = [selected];
  while (frontier.length > 0) {
    const next = operationFiles.filter(
      (file) =>
        !affected.has(file.id) &&
        frontier.some((target) => callsOperation(file, target.id, target.name))
    );
    for (const file of next) affected.add(file.id);
    frontier = next;
  }
  return affected;
}

function migrateCallerArguments(
  base: OperationFile,
  candidate: OperationFile,
  project: Project,
  diagnostics: AgentDiagnostic[]
) {
  const oldParameters = base.content.value.parameters;
  const newParameters = candidate.content.value.parameters;
  if (isEqual(oldParameters, newParameters)) return project.files;
  const oldIndexes = new Map(oldParameters.map(({ id }, index) => [id, index]));
  const callers = project.files.filter(
    (file): file is OperationFile =>
      file.type === "operation" &&
      file.id !== base.id &&
      callsOperation(file, base.id, base.name)
  );
  for (const parameter of newParameters) {
    if (
      !oldIndexes.has(parameter.id) &&
      !parameter.isOptional &&
      !parameter.isRest &&
      callers.length
    ) {
      addDiagnostic(
        diagnostics,
        "unsafe_parameter_migration",
        `Required parameter ${parameter.name ?? parameter.id} has no deterministic caller argument`
      );
    }
  }
  return project.files.map((file) => {
    if (!callers.includes(file as OperationFile)) return file;
    const clone = structuredClone(file) as OperationFile;
    for (const statement of [
      ...clone.content.value.parameters,
      ...clone.content.value.statements,
    ]) {
      walkStatement(
        statement,
        {
          onStatement: (nested) => {
            let current = nested.data;
            for (const call of nested.operations) {
              if (
                call.value.name === "call" &&
                referencesOperation(current, base.id, base.name)
              ) {
                const oldArgs = call.value.parameters;
                call.value.parameters = newParameters.flatMap((parameter) => {
                  const oldIndex = oldIndexes.get(parameter.id);
                  if (oldIndex === undefined) return [];
                  const oldParameter = oldParameters[oldIndex];
                  if (parameter.isRest && oldParameter?.isRest)
                    return oldArgs.slice(oldIndex);
                  return !oldArgs[oldIndex] ? [] : [oldArgs[oldIndex]];
                });
              }
              current = createData({ id: call.id, type: call.type.result });
            }
          },
        },
        { nestedOperations: true, operationCalls: true }
      );
    }
    return clone;
  });
}

function normalizeCandidate(file: OperationFile, project: Project) {
  const context = createValidationContext(project);
  const selfOperation = createOperationFromFile(file)!;
  context.variables.set(file.name, { data: selfOperation });
  const value = file.content.value;
  const combined = updateStatements({
    statements: [...value.parameters, ...value.statements],
    context,
    options: { variableNames: new Map(), selfOperation },
  });
  const parameters = combined.slice(0, value.parameters.length);
  const statements = combined.slice(value.parameters.length);
  const normalizedValue = {
    ...value,
    parameters,
    statements,
    isAsync: getIsAsync(combined),
  };
  return {
    ...file,
    content: {
      type: {
        kind: "operation" as const,
        parameters: parameters.map(createTypeFromStatement),
        result: getOperationResultType(normalizedValue, context),
      },
      value: normalizedValue,
    },
  };
}

function canonicalizeProjectCalls(file: OperationFile, project: Project) {
  const targets = new Map(
    project.files.flatMap((candidate) =>
      candidate.type === "operation" ? [[candidate.id, candidate] as const] : []
    )
  );
  const targetsByName = new Map(
    project.files.flatMap((candidate) =>
      candidate.type === "operation"
        ? [[candidate.name, candidate] as const]
        : []
    )
  );
  const localIds = new Set<string>();
  for (const root of [
    ...file.content.value.parameters,
    ...file.content.value.statements,
  ])
    walkStatement(
      root,
      { onStatement: ({ id }) => localIds.add(id) },
      { nestedOperations: true, operationCalls: true }
    );
  for (const root of [
    ...file.content.value.parameters,
    ...file.content.value.statements,
  ])
    walkStatement(
      root,
      {
        onStatement: (statement) => {
          let current = statement.data;
          for (const call of statement.operations) {
            const referencedTarget =
              call.value.name === "call" && isDataOfType(current, "reference")
                ? (targets.get(current.value.id) ??
                  (!localIds.has(current.value.id)
                    ? targetsByName.get(current.value.name)
                    : undefined))
                : undefined;
            const directTarget =
              call.value.name &&
              call.value.name !== "call" &&
              !call.value.source
                ? targetsByName.get(call.value.name)
                : undefined;
            const target = referencedTarget ?? directTarget;
            if (target) {
              if (referencedTarget && isDataOfType(current, "reference"))
                current.value = { name: target.name, id: target.id };
              call.type = {
                kind: "operation",
                parameters: referencedTarget
                  ? [
                      { type: target.content.type },
                      ...structuredClone(target.content.type.parameters),
                    ]
                  : structuredClone(target.content.type.parameters),
                result: structuredClone(target.content.type.result),
              };
              delete call.value.source;
            }
            current = createData({ id: call.id, type: call.type.result });
          }
        },
      },
      { nestedOperations: true, operationCalls: true }
    );
  return file;
}

async function getCatalog(project: Project) {
  const packages = getEnabledPackages(project)
    .map(({ name }) => name)
    .sort();
  const packageDescriptors = await Promise.all(
    packages.map(async (name) => ({
      name,
      descriptor: await loadPackageDescriptor(name),
    }))
  );
  return {
    builtins: coreOperations,
    packages: packageDescriptors.flatMap(({ name, descriptor }) =>
      descriptor.operations.map((operation) => ({ name, operation }))
    ),
  };
}

async function canonicalizeCatalogCalls(file: OperationFile, project: Project) {
  const catalog = await getCatalog(project);
  normalizeEmbeddedOperationCalls(file, project, catalog);
  const context = createValidationContext(project);
  for (const root of [
    ...file.content.value.parameters,
    ...file.content.value.statements,
  ])
    walkStatement(
      root,
      {
        onStatement: (statement) => {
          let current = statement.data;
          for (const call of statement.operations) {
            if (
              call.value.name !== "call" ||
              !isDataOfType(current, "reference")
            ) {
              const sourceName = call.value.source?.name;
              const packageKey = sourceName
                ? SOURCE_PACKAGE_MAP[sourceName]
                : undefined;
              const source = packageKey
                ? catalog.packages
                    .filter(({ name }) => name === packageKey)
                    .map(({ operation }) => operation)
                : catalog.builtins;
              const matches = call.value.name
                ? resolveCatalogOperation(
                    source,
                    call.value.name,
                    current,
                    context
                  )
                : [];
              if (matches.length === 1) {
                const descriptor = matches[0];
                call.type = {
                  kind: "operation",
                  parameters: structuredClone(
                    resolveParameters(descriptor, current, context)
                  ),
                  result: structuredClone(
                    resolveCatalogResult(descriptor, current, call, context)
                  ),
                };
                call.value.source = structuredClone(descriptor.source);
              }
            }
            current = createData({ id: call.id, type: call.type.result });
          }
        },
      },
      { nestedOperations: true, operationCalls: true }
    );
  return file;
}

function resolveCatalogOperation(
  operations: OperationListItem[],
  name: string,
  input: IData,
  context: Context
) {
  return operations.filter((operation) => {
    if (operation.name !== name) return false;
    const parameter = resolveParameters(operation, input, context)[0];
    return !!parameter && isTypeCompatible(input.type, parameter.type, context);
  });
}

function resolveCatalogResult(
  descriptor: OperationListItem,
  current: IData,
  call: IData<OperationType>,
  context: Context
) {
  if (typeof descriptor.expectedType === "function")
    return descriptor.expectedType(current);
  if (descriptor.expectedType) return descriptor.expectedType;
  if (descriptor.name === "map") {
    const callback = call.value.parameters[0];
    const callbackType = callback
      ? getStatementResult(callback, context).type
      : undefined;
    if (callbackType?.kind === "operation")
      return { kind: "array" as const, elementType: callbackType.result };
  }
  return call.type.result;
}

function normalizeEmbeddedOperationCalls(
  file: OperationFile,
  project: Project,
  catalog: Awaited<ReturnType<typeof getCatalog>>
) {
  const operationNames = new Set([
    ...catalog.builtins.map(({ name }) => name),
    ...catalog.packages.map(({ operation }) => operation.name),
    ...project.files.flatMap((candidate) =>
      candidate.type === "operation" ? [candidate.name] : []
    ),
  ]);

  function normalizeData(data: IData) {
    if (isDataOfType(data, "array") || isDataOfType(data, "tuple"))
      data.value = normalizeStatements(data.value);
    else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary"))
      for (const entry of data.value.entries) normalizeStatement(entry.value);
    else if (isDataOfType(data, "operation")) {
      data.value.parameters = normalizeStatements(data.value.parameters);
      data.value.statements = normalizeStatements(data.value.statements);
    } else if (isDataOfType(data, "instance"))
      data.value.constructorArgs = normalizeStatements(
        data.value.constructorArgs
      );
    else if (isDataOfType(data, "condition")) {
      normalizeStatement(data.value.condition);
      data.value.trueBranch = normalizeStatements(data.value.trueBranch);
      data.value.falseBranch = normalizeStatements(data.value.falseBranch);
    }
  }

  function normalizeStatement(statement: IStatement) {
    normalizeData(statement.data);
    for (const operation of statement.operations) {
      operation.value.parameters = normalizeStatements(
        operation.value.parameters
      );
      operation.value.statements = normalizeStatements(
        operation.value.statements
      );
    }

    const embedded = statement.data;
    // Repair providers that encode a chained call as operation-valued data.
    if (
      !isDataOfType(embedded, "operation") ||
      !embedded.value.name ||
      !operationNames.has(embedded.value.name) ||
      embedded.value.parameters.length === 0 ||
      embedded.value.statements.length > 0
    )
      return;

    const [input, ...parameters] = embedded.value.parameters;
    statement.data = input.data;
    statement.operations = [
      ...input.operations,
      {
        ...embedded,
        value: { ...embedded.value, parameters },
      },
      ...statement.operations,
    ];
  }

  function normalizeStatements(statements: IStatement[]) {
    for (const statement of statements) normalizeStatement(statement);
    return statements;
  }

  normalizeStatements([
    ...file.content.value.parameters,
    ...file.content.value.statements,
  ]);
}

function validateArguments(
  call: IData<OperationType>,
  expected: OperationType["parameters"],
  context: Context,
  scope: Map<string, { data: IData }>,
  file: OperationFile,
  diagnostics: AgentDiagnostic[],
  catalog?: Awaited<ReturnType<typeof getCatalog>>
) {
  for (const [index, argument] of call.value.parameters.entries()) {
    const parameter = expected[Math.min(index, expected.length - 1)];
    if (!parameter) continue;
    const expectedType =
      parameter.isRest && parameter.type.kind === "array"
        ? parameter.type.elementType
        : parameter.type;
    let actual = isDataOfType(argument.data, "reference")
      ? (scope.get(argument.data.value.name)?.data ?? argument.data)
      : argument.data;
    for (const operation of argument.operations) {
      let result = operation.type.result;
      if (catalog && operation.value.name) {
        const packageKey = operation.value.source?.name
          ? SOURCE_PACKAGE_MAP[operation.value.source.name]
          : undefined;
        const source = packageKey
          ? catalog.packages
              .filter(({ name }) => name === packageKey)
              .map(({ operation: descriptor }) => descriptor)
          : catalog.builtins;
        const matches = resolveCatalogOperation(
          source,
          operation.value.name,
          actual,
          context
        );
        if (matches.length === 1) {
          result = resolveCatalogResult(matches[0], actual, operation, context);
          operation.type.result = structuredClone(result);
        }
      }
      actual = createData({ id: operation.id, type: result });
    }
    const actualType = actual.type;
    if (!isTypeCompatible(actualType, expectedType, context))
      addDiagnostic(
        diagnostics,
        "invalid_argument_type",
        `Operation ${call.value.name} has an incompatible argument at position ${index + 1}`,
        { fileId: file.id }
      );
  }
}

function validateArgumentCount(
  call: IData<OperationType>,
  expected: OperationType["parameters"],
  file: OperationFile,
  diagnostics: AgentDiagnostic[]
) {
  const required = expected.filter(
    (parameter) => !parameter.isOptional && !parameter.isRest
  ).length;
  const rest = expected.at(-1)?.isRest;
  if (
    call.value.parameters.length < required ||
    (!rest && call.value.parameters.length > expected.length)
  )
    addDiagnostic(
      diagnostics,
      "invalid_argument_count",
      `Operation ${call.value.name} has the wrong argument count`,
      { fileId: file.id }
    );
}

type ProposalScope = Map<string, { data: IData }>;

function canonicalizeReference(
  reference: IData<ReferenceType>,
  scope: ProposalScope
) {
  const variable = scope.get(reference.value.name);
  if (!variable) return false;
  // Provider payloads can use the nested IData ID instead of the declaration ID.
  reference.value.id = variable.data.id;
  return true;
}

function visitLexicalStatements({
  statements,
  scope,
  onStatement,
  onReference,
}: {
  statements: IStatement[];
  scope: ProposalScope;
  onStatement?: (
    statement: IStatement,
    scope: ProposalScope,
    declaresName: boolean
  ) => void;
  onReference: (reference: IData, scope: ProposalScope) => void;
}) {
  const visitList = (
    items: IStatement[],
    parent: ProposalScope,
    declaresNames = true
  ) => {
    const local = new Map(parent);
    for (const statement of items) {
      visitStatement(statement, local, declaresNames);
      if (declaresNames && statement.name)
        local.set(statement.name, {
          data: { ...statement.data, id: statement.id },
        });
    }
  };
  const visitData = (data: IData, current: ProposalScope) => {
    if (isDataOfType(data, "reference")) onReference(data, current);
    else if (isDataOfType(data, "array") || isDataOfType(data, "tuple"))
      visitList(data.value, current);
    else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary"))
      for (const entry of data.value.entries) visitList([entry.value], current);
    else if (isDataOfType(data, "operation")) {
      const callbackScope = new Map(current);
      visitList(
        [...data.value.parameters, ...data.value.statements],
        callbackScope
      );
    } else if (isDataOfType(data, "instance"))
      for (const argument of data.value.constructorArgs)
        visitList([argument], current);
    else if (isDataOfType(data, "condition")) {
      visitList([data.value.condition], current);
      visitList(data.value.trueBranch, current);
      visitList(data.value.falseBranch, current);
    }
  };
  const visitStatement = (
    statement: IStatement,
    current: ProposalScope,
    declaresName = true
  ) => {
    onStatement?.(statement, current, declaresName);
    visitData(statement.data, current);
    for (const operation of statement.operations) {
      for (const argument of operation.value.parameters)
        visitList([argument], current, false);
      visitList(operation.value.statements, current);
    }
  };
  visitList(statements, scope);
}

function validateCandidateReferences(
  file: OperationFile,
  project: Project,
  diagnostics: AgentDiagnostic[]
) {
  const context = createValidationContext(project);
  const report = (reference: IData, scope: ProposalScope) => {
    if (!isDataOfType(reference, "reference")) return;
    if (!canonicalizeReference(reference, scope))
      addDiagnostic(
        diagnostics,
        "unresolved_reference",
        `Reference ${reference.value.name} is missing or out of scope`,
        { fileId: file.id }
      );
  };
  const scope = new Map(context.variables) as ProposalScope;
  const targets = new Map(
    project.files.flatMap((candidate) =>
      candidate.type === "operation" ? [[candidate.id, candidate] as const] : []
    )
  );
  const validateCalls = (
    statement: IStatement,
    currentScope: ProposalScope
  ) => {
    if (isDataOfType(statement.data, "reference"))
      canonicalizeReference(statement.data, currentScope);
    let current = statement.data;
    for (const call of statement.operations) {
      const target =
        call.value.name === "call" && isDataOfType(current, "reference")
          ? targets.get(current.value.id)
          : undefined;
      if (target) {
        validateArgumentCount(
          call,
          target.content.type.parameters,
          file,
          diagnostics
        );
      }
      current = createData({ id: call.id, type: call.type.result });
    }
  };
  visitLexicalStatements({
    statements: file.content.value.parameters,
    scope,
    onStatement: validateCalls,
    onReference: report,
  });
  for (const parameter of file.content.value.parameters)
    if (parameter.name)
      scope.set(parameter.name, {
        data: { ...parameter.data, id: parameter.id },
      });
  visitLexicalStatements({
    statements: file.content.value.statements,
    scope,
    onStatement: validateCalls,
    onReference: report,
  });
}

async function validateOperationSemantics(
  project: Project,
  diagnostics: AgentDiagnostic[]
) {
  let catalog: Awaited<ReturnType<typeof getCatalog>>;
  try {
    catalog = await getCatalog(project);
  } catch {
    addDiagnostic(
      diagnostics,
      "package_load_failed",
      "Could not load a supported package descriptor"
    );
    return;
  }
  const operationFiles = project.files.filter(
    (file): file is OperationFile => file.type === "operation"
  );
  const operationsByName = new Map(
    operationFiles.map((operation) => [operation.name, operation])
  );
  for (const file of operationFiles) {
    const context = createValidationContext(project);
    const names = new Set<string>();
    let optionalSeen = false;
    let returnSeen = false;
    const parameters = file.content.value.parameters;
    for (const [index, parameter] of parameters.entries()) {
      if (
        !parameter.name ||
        !isValidIdentifier(parameter.name) ||
        names.has(parameter.name)
      ) {
        addDiagnostic(
          diagnostics,
          "invalid_parameter_name",
          `Operation ${file.name} has an invalid or duplicate parameter name`,
          { fileId: file.id }
        );
      }
      if (parameter.name) names.add(parameter.name);
      if (
        parameter.isRest &&
        (index !== parameters.length - 1 || parameter.isOptional)
      ) {
        addDiagnostic(
          diagnostics,
          "invalid_rest_parameter",
          `Operation ${file.name} has an invalid rest parameter`,
          { fileId: file.id }
        );
      }
      if (optionalSeen && !parameter.isOptional && !parameter.isRest) {
        addDiagnostic(
          diagnostics,
          "invalid_parameter_order",
          `Operation ${file.name} has a required parameter after an optional parameter`,
          { fileId: file.id }
        );
      }
      optionalSeen ||= !!parameter.isOptional;
    }
    const scope = new Map(context.variables) as ProposalScope;
    const validateStatement = (
      statement: IStatement,
      currentScope: ProposalScope,
      topLevel: boolean,
      declaresName = true
    ) => {
      const reference = isDataOfType(statement.data, "reference")
        ? statement.data
        : undefined;
      if (reference) canonicalizeReference(reference, currentScope);
      const input = reference
        ? currentScope.get(reference.value.name)?.data
        : statement.data;
      let current = input ?? statement.data;
      for (const call of statement.operations) {
        const referencedTarget =
          call.value.name === "call" && reference
            ? operationFiles.find(({ id }) => id === reference.value.id)
            : undefined;
        const directTarget =
          call.value.name && call.value.name !== "call" && !call.value.source
            ? operationsByName.get(call.value.name)
            : undefined;
        const target = referencedTarget ?? directTarget;
        if (target) {
          const expected = referencedTarget
            ? target.content.type.parameters
            : target.content.type.parameters.slice(1);
          if (
            directTarget &&
            target.content.type.parameters[0] &&
            !isTypeCompatible(
              current.type,
              target.content.type.parameters[0].type,
              context
            )
          )
            addDiagnostic(
              diagnostics,
              "invalid_argument_type",
              `Operation ${call.value.name} has an incompatible input`,
              { fileId: file.id }
            );
          call.type = {
            kind: "operation",
            parameters: referencedTarget
              ? [
                  { type: target.content.type },
                  ...structuredClone(target.content.type.parameters),
                ]
              : structuredClone(target.content.type.parameters),
            result: structuredClone(target.content.type.result),
          };
          call.value.source = undefined;
          validateArgumentCount(call, expected, file, diagnostics);
          validateArguments(
            call,
            expected,
            context,
            currentScope,
            file,
            diagnostics,
            catalog
          );
        } else if (call.value.name === "call" && reference) {
          if (!target)
            addDiagnostic(
              diagnostics,
              "unknown_operation",
              `Referenced operation ${reference.value.name} does not exist`,
              { fileId: file.id }
            );
        } else {
          const sourceName = call.value.source?.name;
          const packageKey = sourceName
            ? SOURCE_PACKAGE_MAP[sourceName]
            : undefined;
          const source = packageKey
            ? catalog.packages
                .filter(({ name }) => name === packageKey)
                .map(({ operation }) => operation)
            : catalog.builtins;
          if (!call.value.name) {
            addDiagnostic(
              diagnostics,
              "unknown_operation",
              "Operation call has no name",
              { fileId: file.id }
            );
            continue;
          }
          const matches = resolveCatalogOperation(
            source,
            call.value.name,
            current,
            context
          );
          if (matches.length !== 1) {
            addDiagnostic(
              diagnostics,
              matches.length ? "ambiguous_operation" : "unknown_operation",
              `Operation ${call.value.name} is not uniquely available for ${current.type.kind}`,
              { fileId: file.id, packageName: packageKey }
            );
          } else {
            const descriptor = matches[0];
            const parameters = resolveParameters(descriptor, current, context);
            const expected = parameters.slice(1);
            const result = resolveCatalogResult(
              descriptor,
              current,
              call,
              context
            );
            call.type = {
              kind: "operation",
              parameters: structuredClone(parameters),
              result: structuredClone(result),
            };
            call.value.source = structuredClone(descriptor.source);
            validateArgumentCount(call, expected, file, diagnostics);
            validateArguments(
              call,
              expected,
              context,
              currentScope,
              file,
              diagnostics,
              catalog
            );
          }
        }
        current = createData({ id: call.id, type: call.type.result });
      }
      if (declaresName && statement.name) {
        const existing = currentScope.get(statement.name);
        if (
          !isValidIdentifier(statement.name) ||
          (existing && existing.data.id !== file.id)
        ) {
          addDiagnostic(
            diagnostics,
            "duplicate_name",
            `Operation ${file.name} has an invalid or duplicate statement name`,
            { fileId: file.id }
          );
        }
      }
      returnSeen ||= topLevel && statement.controlFlow === "return";
      return current;
    };
    const reportReference = (reference: IData, currentScope: ProposalScope) => {
      if (!isDataOfType(reference, "reference")) return;
      if (!canonicalizeReference(reference, currentScope))
        addDiagnostic(
          diagnostics,
          "unresolved_reference",
          `Reference ${reference.value.name} is missing or out of scope`,
          { fileId: file.id }
        );
    };
    visitLexicalStatements({
      statements: parameters,
      scope,
      onStatement: (statement, currentScope) =>
        validateStatement(statement, currentScope, false),
      onReference: reportReference,
    });
    for (const parameter of parameters)
      if (parameter.name)
        scope.set(parameter.name, {
          data: { ...getStatementResult(parameter, context), id: parameter.id },
        });
    for (const statement of file.content.value.statements) {
      if (returnSeen)
        addDiagnostic(
          diagnostics,
          "unreachable_statement",
          `Operation ${file.name} has a statement after return`,
          { fileId: file.id }
        );
      let statementResult: IData | undefined;
      visitLexicalStatements({
        statements: [statement],
        scope,
        onStatement: (nested, currentScope, declaresName) => {
          const result = validateStatement(
            nested,
            currentScope,
            nested === statement,
            declaresName
          );
          if (nested === statement) statementResult = result;
        },
        onReference: reportReference,
      });
      if (statement.name)
        scope.set(statement.name, {
          data: {
            ...(statementResult ?? getStatementResult(statement, context)),
            id: statement.id,
          },
        });
    }
  }
}

function validateUniqueIds(project: Project, diagnostics: AgentDiagnostic[]) {
  const ids = new Set<string>();
  const instanceIds = new Set<string>();
  const visited = new WeakSet<object>();
  const visitedInstances = new WeakSet<object>();
  const add = (id: string, fileId: string) => {
    if (ids.has(id))
      addDiagnostic(
        diagnostics,
        "duplicate_entity_id",
        `Entity ID ${id} is duplicated`,
        { fileId }
      );
    ids.add(id);
  };
  const addInstance = (id: string, fileId: string) => {
    if (instanceIds.has(id))
      addDiagnostic(
        diagnostics,
        "duplicate_instance_id",
        `Runtime instance ID ${id} is duplicated`,
        { fileId }
      );
    instanceIds.add(id);
  };
  for (const file of project.files) {
    add(file.id, file.id);
    const walk = (data: IData, skipRoot = false) => {
      let root = true;
      walkData(
        data,
        {
          onData: (data) => {
            if (visited.has(data)) return;
            visited.add(data);
            if (!skipRoot || !root) add(data.id, file.id);
            root = false;
          },
          onOperation: (data) => {
            if (visitedInstances.has(data)) return;
            visitedInstances.add(data);
            if (data.value.instanceId && data.value.instanceId !== data.id)
              addInstance(data.value.instanceId, file.id);
          },
          onInstance: (data) => {
            if (visitedInstances.has(data)) return;
            visitedInstances.add(data);
            if (
              data.type.className !== "File" &&
              data.value.instanceId !== data.id
            )
              addInstance(data.value.instanceId, file.id);
          },
          onStatement: (statement) => {
            if (visited.has(statement)) return;
            visited.add(statement);
            add(statement.id, file.id);
          },
        },
        { nestedOperations: true, operationCalls: true }
      );
    };
    if (file.type === "operation") {
      walk(createOperationFromFile(file)!, true);
      for (const test of file.tests ?? []) {
        test.inputs.forEach((input) => walk(input));
        walk(test.expectedOutput);
      }
    } else if (file.type === "globals")
      Object.values(file.content).forEach((data) => walk(data));
  }
}

export async function validateAgentHistoryState(
  project: Project,
  state: AgentHistoryState
) {
  const diagnostics: AgentDiagnostic[] = [];
  const candidate = projectWithAgentState(project, state);
  const parsedDependencies = ProjectSchema.shape.dependencies.safeParse(
    candidate.dependencies
  );
  if (!parsedDependencies.success)
    addDiagnostic(
      diagnostics,
      "invalid_package_dependencies",
      "Package dependencies are malformed"
    );
  const packageNames = state.npmDependencies.map(({ name }) => name);
  for (const name of packageNames) {
    if (!PACKAGE_CATALOG[name])
      addDiagnostic(
        diagnostics,
        "unsupported_package",
        `Unsupported package: ${name}`,
        { packageName: name }
      );
  }
  if (new Set(packageNames).size !== packageNames.length)
    addDiagnostic(
      diagnostics,
      "duplicate_package",
      "Supported packages must be unique"
    );
  if (!ProjectSchema.safeParse(candidate).success)
    addDiagnostic(
      diagnostics,
      "invalid_project",
      "Candidate project does not match the project schema",
      { repairable: false }
    );
  const operationNames = new Set<string>();
  for (const { file } of state.operationFiles) {
    if (!ProjectFileSchema.safeParse(file).success)
      addDiagnostic(
        diagnostics,
        "invalid_operation",
        `Operation ${file.name} does not match the file schema`,
        { fileId: file.id }
      );
    if (operationNames.has(file.name))
      addDiagnostic(
        diagnostics,
        "duplicate_operation_name",
        `Operation name ${file.name} is duplicated`,
        { fileId: file.id }
      );
    operationNames.add(file.name);
  }
  validateUniqueIds(candidate, diagnostics);
  await validateOperationSemantics(candidate, diagnostics);
  for (const { file } of state.operationFiles) {
    const before = project.files.find((candidate) => candidate.id === file.id);
    if (isEqual(before, file)) continue;
    try {
      await formatCode(
        generateOperation(
          createOperationFromFile(file)!,
          createValidationContext(candidate)
        )
      );
    } catch {
      addDiagnostic(
        diagnostics,
        "invalid_generated_syntax",
        `Operation ${file.name} does not produce valid code`,
        { fileId: file.id }
      );
    }
  }
  return diagnostics.slice(0, MAX_DIAGNOSTICS);
}

function countCalls(file: OperationFile) {
  let count = 0;
  for (const statement of [
    ...file.content.value.parameters,
    ...file.content.value.statements,
  ]) {
    walkStatement(
      statement,
      { onOperation: () => count++ },
      { nestedOperations: true, operationCalls: true }
    );
  }
  return count;
}

function operationReview(
  before: OperationFile,
  after: OperationFile,
  project: Project
): OperationReview {
  const context = createValidationContext(project);
  return {
    change: "update",
    operationName: after.name,
    parameters: {
      before: before.content.value.parameters.length,
      after: after.content.value.parameters.length,
    },
    statements: {
      before: before.content.value.statements.length,
      after: after.content.value.statements.length,
    },
    operationCalls: { before: countCalls(before), after: countCalls(after) },
    returnType: {
      before: getTypeSignature(before.content.type.result, context),
      after: getTypeSignature(after.content.type.result, context),
    },
    generatedSyntax: "valid",
  };
}

export async function createAgentProposal({
  project,
  fileId,
  sourcePrompt,
  requestContext,
  update: input,
}: {
  project: Project;
  fileId: string;
  sourcePrompt: string;
  requestContext?: string;
  update: unknown;
}): Promise<AgentProposal> {
  const base = {
    id: nanoid(),
    projectId: project.id,
    fileId,
    baseFingerprint: getAgentEditableFingerprint(project),
    sourcePrompt,
    ...(requestContext ? { requestContext } : {}),
  };
  const parsed = AgentOperationUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...base,
      update: {
        explanation: "Invalid update",
        enablePackages: [],
        changes: [],
      },
      diagnostics: [
        {
          code: "invalid_update",
          severity: "error",
          message: parsed.error.issues[0]?.message ?? "Invalid update",
          repairable: true,
        },
      ],
    };
  }
  const update = parsed.data;
  const selected = project.files.find(
    (file): file is OperationFile =>
      file.id === fileId && file.type === "operation"
  );
  if (!selected) {
    return {
      ...base,
      update,
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
  const diagnostics: AgentDiagnostic[] = [];
  validateTargets(selected, update, diagnostics);
  if (diagnostics.length) return { ...base, update, diagnostics };
  const { candidate: changedCandidate, review: actions } = applyActions(
    selected,
    update
  );
  normalizeAgentFinalReturn(changedCandidate, actions);
  validateRequestedBody(
    selected,
    changedCandidate,
    requestContext ?? sourcePrompt,
    diagnostics
  );
  const changed = canonicalizeProjectCalls(changedCandidate, project);
  normalizeEmbeddedOperationCalls(changed, project, {
    builtins: coreOperations,
    packages: [],
  });
  validateCandidateReferences(changed, project, diagnostics);
  const deletedIds = update.changes.flatMap((action) =>
    action.kind === "delete_statement" ? [action.statementId] : []
  );
  for (const id of deletedIds) {
    if (referencesId(changed, id))
      addDiagnostic(
        diagnostics,
        "statement_in_use",
        `Deleted statement ${id} is still referenced`
      );
  }
  if (
    diagnostics.some(({ code }) =>
      ["unresolved_reference", "statement_in_use"].includes(code)
    )
  )
    return { ...base, update, diagnostics };
  let dependencies = project.dependencies?.npm ?? [];
  try {
    dependencies = applySupportedPackageChanges(
      dependencies,
      update.enablePackages.map((name) => ({ name, enabled: true }))
    );
  } catch (error) {
    addDiagnostic(
      diagnostics,
      "unsupported_package",
      error instanceof Error ? error.message : "Unsupported package"
    );
  }
  const packageProject = {
    ...project,
    dependencies: { ...project.dependencies, npm: dependencies },
  };
  let normalized: OperationFile = normalizeCandidate(changed, packageProject);
  const normalizedProject = {
    ...packageProject,
    files: packageProject.files.map((file) =>
      file.id === selected.id ? normalized : file
    ),
  };
  normalized = canonicalizeProjectCalls(normalized, normalizedProject);
  try {
    normalized = await canonicalizeCatalogCalls(normalized, packageProject);
  } catch {
    addDiagnostic(
      diagnostics,
      "package_load_failed",
      "Could not load a supported package descriptor"
    );
  }
  let files = migrateCallerArguments(
    selected,
    normalized,
    packageProject,
    diagnostics
  );
  files = files.map((file) => (file.id === selected.id ? normalized : file));
  const canonicalProject = { ...packageProject, files };
  const affectedOperationIds = getAffectedOperationIds(project, selected);
  files = files.map((file) =>
    file.type === "operation" && affectedOperationIds.has(file.id)
      ? canonicalizeProjectCalls(structuredClone(file), canonicalProject)
      : file
  );
  normalized = files.find(
    (file): file is OperationFile =>
      file.id === selected.id && file.type === "operation"
  )!;
  let propagated = files;
  const maxPasses = files.filter(({ type }) => type === "operation").length + 1;
  let frontier = new Set([selected.id]);
  for (let pass = 0; pass < maxPasses; pass++) {
    const updated = updateFiles(
      propagated,
      () => undefined,
      createValidationContext({ ...packageProject, files: propagated }),
      pass === 0 ? normalized : undefined
    );
    const next = updated.map((file, index) => {
      if (pass === 0 && file.id === selected.id) return file;
      const before = propagated[index];
      return before.type === "operation" &&
        [...frontier].some((operationId) => {
          const target = propagated.find(
            (candidate): candidate is OperationFile =>
              candidate.type === "operation" && candidate.id === operationId
          );
          return (
            target !== undefined && callsOperation(before, target.id, target.name)
          );
        })
        ? file
        : before;
    });
    if (isEqual(next, propagated)) break;
    frontier = new Set(
      next.flatMap((file, index) =>
        file.type === "operation" && !isEqual(file, propagated[index])
          ? [file.id]
          : []
      )
    );
    propagated = next;
  }
  const candidateProject = { ...packageProject, files: propagated };
  const state = getAgentHistoryState(candidateProject);
  diagnostics.push(...(await validateAgentHistoryState(project, state)));
  if (isEqual(getAgentHistoryState(project), state))
    addDiagnostic(
      diagnostics,
      "no_changes",
      "The update does not change the project"
    );
  const proposedFile = state.operationFiles.find(
    ({ file }) => file.id === selected.id
  )?.file;
  const changedFiles = state.operationFiles.flatMap(({ file }) => {
    if (file.id === selected.id) return [];
    const before = project.files.find(
      (candidate): candidate is OperationFile =>
        candidate.id === file.id && candidate.type === "operation"
    );
    return before && !isEqual(before, file)
      ? [operationReview(before, file, candidateProject)]
      : [];
  });
  const primary = operationReview(
    selected,
    proposedFile ?? normalized,
    candidateProject
  );
  return {
    ...base,
    update,
    proposedFile,
    proposedState: state,
    diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS),
    review: {
      ...primary,
      actions,
      files: changedFiles,
      packages: {
        enabled: update.enablePackages.filter(
          (name) =>
            !(project.dependencies?.npm ?? []).some(
              (dependency) => dependency.name === name
            )
        ),
        disabled: [],
      },
    },
  };
}

export const createAgentChangesProposal = createAgentProposal;
