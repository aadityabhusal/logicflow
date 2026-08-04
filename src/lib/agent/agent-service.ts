import { Output, stepCountIs, streamText, tool, zodSchema } from "ai";
import { z } from "zod";
import { LOGICFLOW_SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import { operationToLLMFormat, EntityMappingContext } from "./entity-mapper";
import { IData, IStatement, OperationType, DataType, Project } from "../types";
import { createData } from "../utils";
import { nanoid } from "nanoid";
import { AgentChange, AgentResponseSchema, DataTypeSchema } from "../schemas";
import { DataTypes } from "../data";
import { AgentProvider } from "./types";
import { createProviderModel, toAgentTransportError } from "./transport";
import { AgentDiscoveryError, createAgentDiscovery } from "./discovery";

const AGENT_REQUEST_TIMEOUT = 60_000;

export async function generateOperationChanges({
  apiKey,
  model,
  operation,
  project,
  userPrompt,
  abortSignal,
  onPartialExplanation,
}: {
  operation: IData<OperationType>;
  project: Project;
  userPrompt: string;
  model: string;
  apiKey: string;
  abortSignal?: AbortSignal;
  onPartialExplanation?: (explanation: string) => void;
}) {
  const { mappedOperation, mappingContext } = operationToLLMFormat(operation);
  const discovery = await createAgentDiscovery(project, operation.id);
  let toolCalls = 0;
  const executeTool = async (action: () => unknown) => {
    toolCalls++;
    if (toolCalls > 20) {
      return {
        error: {
          code: "tool_limit_reached",
          message: "Discovery tool-call limit reached",
        },
      };
    }
    try {
      return await action();
    } catch (error) {
      if (error instanceof AgentDiscoveryError) {
        return { error: { code: error.code, message: error.message } };
      }
      throw error;
    }
  };
  const tools = {
    get_project_outline: tool({
      description: "Return compact current project and operation context",
      inputSchema: z.object({}),
      execute: () => executeTool(() => discovery.getProjectOutline()),
    }),
    inspect_operation: tool({
      description: "Inspect an operation using its scoped handle",
      inputSchema: z.object({ handle: z.string() }),
      execute: ({ handle }) =>
        executeTool(() => discovery.inspectOperation(handle)),
    }),
    search_operations: tool({
      description:
        "Search current core, enabled-package, and project operations",
      inputSchema: z.object({
        query: z.string().optional(),
        inputType: DataTypeSchema.optional(),
        resultType: DataTypeSchema.optional(),
        source: z.enum(["core", "package", "project"]).optional(),
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: ({ query, inputType, resultType, source, limit }) =>
        executeTool(() =>
          discovery.searchOperations({
            query,
            inputType,
            resultType,
            source,
            limit,
          })
        ),
    }),
    describe_operations: tool({
      description: "Return exact details for operation handles",
      inputSchema: z.object({
        handles: z.array(z.string()).min(1).max(20),
        inputType: DataTypeSchema.optional(),
      }),
      execute: ({ handles, inputType }) =>
        executeTool(() => discovery.describeOperations(handles, inputType)),
    }),
    search_packages: tool({
      description: "Search packages supported by the host catalog",
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: ({ query, limit }) =>
        executeTool(() => discovery.searchPackages(query, limit)),
    }),
  };
  const [provider, ...modelParts] = model.split("/");
  if (!(["openai", "anthropic", "google"] as string[]).includes(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  try {
    const result = streamText({
      model: createProviderModel(
        provider as AgentProvider,
        modelParts.join("/"),
        apiKey
      ),
      output: Output.object({
        schema: zodSchema(AgentResponseSchema, { useReferences: true }),
      }),
      tools,
      stopWhen: stepCountIs(8),
      system: LOGICFLOW_SYSTEM_PROMPT,
      prompt: buildContextPrompt(JSON.stringify(mappedOperation), userPrompt),
      abortSignal,
      timeout: AGENT_REQUEST_TIMEOUT,
      maxRetries: 0,
      onError: () => undefined,
    });
    for await (const partial of result.partialOutputStream) {
      if (partial.explanation) onPartialExplanation?.(partial.explanation);
    }
    return { response: await result.output, mappingContext };
  } catch (error) {
    throw toAgentTransportError(error);
  }
}

export function applyChangesToOperation(
  operation: IData<OperationType>,
  changes: AgentChange[],
  ctx: EntityMappingContext
): IData<OperationType> {
  let result = operation;
  for (const change of changes) {
    result = applyChange(result, change, ctx);
  }
  return result;
}

function applyChange(
  operation: IData<OperationType>,
  change: AgentChange,
  ctx: EntityMappingContext
): IData<OperationType> {
  switch (change.action) {
    case "delete":
      return applyDelete(operation, change.entity.id, ctx);
    case "create":
      return applyCreate(
        operation,
        change.parentId,
        change.entity as IStatement,
        ctx
      );
    case "update":
      return applyUpdate(operation, change.entity, ctx);
  }
}

function applyDelete(
  operation: IData<OperationType>,
  entityId: string,
  ctx: EntityMappingContext
): IData<OperationType> {
  const originalId = ctx.reverseMap.get(entityId);
  if (!originalId) return operation;

  const result = structuredClone(operation);

  result.value.parameters = result.value.parameters.filter(
    (p) => p.id !== originalId
  );
  result.value.statements = result.value.statements.filter(
    (s) => s.id !== originalId
  );

  result.value.statements.forEach((s) => {
    s.operations = s.operations.filter((op) => op.id !== originalId);
  });
  result.value.parameters.forEach((p) => {
    p.operations = p.operations.filter((op) => op.id !== originalId);
  });

  return result;
}

function applyCreate(
  operation: IData<OperationType>,
  parentId: string,
  entity: IStatement,
  ctx: EntityMappingContext
): IData<OperationType> {
  const result = structuredClone(operation);
  const parentOriginalId = ctx.reverseMap.get(parentId);

  if (!parentOriginalId) return operation;

  const newStatement = convertStatementRecordToEntries(entity);

  if (parentOriginalId === operation.id) {
    if (!entity.data && entity.name) {
      result.value.parameters.push(newStatement);
    } else {
      result.value.statements.push(newStatement);
    }
    return result;
  }

  result.value.statements = result.value.statements.map((s) => {
    if (s.id === parentOriginalId) {
      const opCall = createOperationCallFromEntity(entity);
      if (opCall) s.operations.push(opCall);
    }
    return s;
  });

  result.value.parameters = result.value.parameters.map((p) => {
    if (p.id === parentOriginalId) {
      const opCall = createOperationCallFromEntity(entity);
      if (opCall) p.operations.push(opCall);
    }
    return p;
  });

  return result;
}

function applyUpdate(
  operation: IData<OperationType>,
  entity: { id: string } & Record<string, unknown>,
  ctx: EntityMappingContext
): IData<OperationType> {
  const originalId = ctx.reverseMap.get(entity.id);
  if (!originalId) return operation;

  const result = structuredClone(operation);

  if (entity.id.startsWith("S") || entity.id.startsWith("P")) {
    result.value.statements = result.value.statements.map((s) => {
      if (s.id === originalId) return patchStatement(s, entity);
      return s;
    });
    result.value.parameters = result.value.parameters.map((p) => {
      if (p.id === originalId) return patchStatement(p, entity);
      return p;
    });
  } else if (entity.id.startsWith("D")) {
    result.value.statements = result.value.statements.map((s) => {
      if (s.data.id === originalId) {
        s.data = patchData(s.data, entity, ctx);
      }
      return s;
    });
    result.value.parameters = result.value.parameters.map((p) => {
      if (p.data.id === originalId) {
        p.data = patchData(p.data, entity, ctx);
      }
      return p;
    });
  } else if (entity.id.startsWith("O")) {
    result.value.statements = result.value.statements.map((s) => {
      s.operations = s.operations.map((op) => {
        if (op.id === originalId) return patchOperationCall(op, entity);
        return op;
      });
      return s;
    });
    result.value.parameters = result.value.parameters.map((p) => {
      p.operations = p.operations.map((op) => {
        if (op.id === originalId) return patchOperationCall(op, entity);
        return op;
      });
      return p;
    });
  }

  return result;
}

function patchStatement(
  statement: IStatement,
  patch: Record<string, unknown>
): IStatement {
  const result = { ...statement };

  if ("name" in patch) {
    result.name = (patch.name as string | null) ?? undefined;
  }
  if ("isOptional" in patch) {
    result.isOptional = patch.isOptional as boolean;
  }
  if ("data" in patch && patch.data) {
    result.data = convertDataRecordToEntries(patch.data as IData);
  }
  if ("operations" in patch && Array.isArray(patch.operations)) {
    result.operations = patch.operations.map((op) =>
      convertOperationRecordToEntries(op as IData<OperationType>)
    );
  }

  return result;
}

function patchData(
  data: IData,
  patch: Record<string, unknown>,
  ctx: EntityMappingContext
): IData {
  const result = { ...data };

  if ("type" in patch && patch.type) {
    result.type = patch.type as DataType;
  }
  if ("value" in patch) {
    result.value = patch.value;
  }

  if (result.type?.kind === "reference" && result.value) {
    const refValue = result.value as { name: string; id: string };
    const refOriginalId = ctx.reverseMap.get(refValue.id);
    result.value = { name: refValue.name, id: refOriginalId || refValue.id };
  }

  return result;
}

function patchOperationCall(
  op: IData<OperationType>,
  patch: Record<string, unknown>
): IData<OperationType> {
  const result = { ...op };

  if ("value" in patch && patch.value) {
    const valuePatch = patch.value as Record<string, unknown>;
    result.value = {
      ...result.value,
      ...(valuePatch.name !== undefined && { name: valuePatch.name as string }),
      ...(Array.isArray(valuePatch.parameters) && {
        parameters: valuePatch.parameters.map((p) =>
          convertStatementRecordToEntries(p as IStatement)
        ),
      }),
      ...(Array.isArray(valuePatch.statements) && {
        statements: valuePatch.statements.map((s) =>
          convertStatementRecordToEntries(s as IStatement)
        ),
      }),
    };
  }

  return result;
}

function convertStatementRecordToEntries(stmt: IStatement): IStatement {
  return {
    ...stmt,
    operations: stmt.operations?.map(convertOperationRecordToEntries) ?? [],
    data: stmt.data
      ? convertDataRecordToEntries(stmt.data)
      : createDefaultData(),
  };
}

function convertDataRecordToEntries(data: IData): IData {
  if (!data.type) return data;

  if (data.type.kind === "object" || data.type.kind === "dictionary") {
    const value = data.value as {
      entries: Array<{ key: string; value: IStatement }>;
    };
    const entries = value.entries ?? [];
    return {
      ...data,
      value: {
        entries: entries.map(({ key, value }) => ({
          key,
          value: convertStatementRecordToEntries(value),
        })),
      },
    };
  }
  if (data.type.kind === "array" || data.type.kind === "tuple") {
    const arr = data.value as IStatement[];
    return { ...data, value: (arr ?? []).map(convertStatementRecordToEntries) };
  }
  return data;
}

function convertOperationRecordToEntries(
  op: IData<OperationType>
): IData<OperationType> {
  return {
    ...op,
    value: {
      ...op.value,
      parameters: op.value.parameters.map(convertStatementRecordToEntries),
      statements:
        op.value.statements?.map(convertStatementRecordToEntries) ?? [],
    },
  };
}

function createDefaultData(): IData {
  return createData({ type: { kind: "undefined" } });
}

function createOperationCallFromEntity(
  entity: IStatement
): IData<OperationType> | null {
  if (entity.data?.type?.kind !== "operation") return null;

  const opValue = entity.data.value as {
    name?: string;
    parameters?: IStatement[];
    statements?: IStatement[];
  };

  return {
    id: nanoid(),
    type: DataTypes.operation.type,
    value: {
      name: opValue?.name ?? entity.name ?? "",
      parameters:
        opValue?.parameters?.map(convertStatementRecordToEntries) ?? [],
      statements:
        opValue?.statements?.map(convertStatementRecordToEntries) ?? [],
    },
  };
}
