import { generateText, Output, zodSchema } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { LOGICFLOW_SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import { operationToLLMFormat, EntityMappingContext } from "./entity-mapper";
import { IData, IStatement, OperationType, DataType } from "../types";
import { createData } from "../utils";
import { nanoid } from "nanoid";
import { AgentChange, AgentResponseSchema } from "../schemas";

function getProviderModel(modelId: string, apiKey: string) {
  const [provider, ...modelParts] = modelId.split("/");
  const modelName = modelParts.join("/");
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelName);
    case "anthropic":
      return createAnthropic({ apiKey })(modelName);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelName);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export async function generateOperationChanges({
  apiKey,
  model,
  operation,
  userPrompt,
}: {
  operation: IData<OperationType>;
  userPrompt: string;
  model: string;
  apiKey: string;
}) {
  const { mappedOperation, mappingContext } = operationToLLMFormat(operation);
  const providerModel = getProviderModel(model, apiKey);
  const result = await generateText({
    model: providerModel,
    output: Output.object({
      schema: zodSchema(AgentResponseSchema, { useReferences: true }),
    }),
    system: LOGICFLOW_SYSTEM_PROMPT,
    prompt: buildContextPrompt(JSON.stringify(mappedOperation), userPrompt),
  });
  return { response: result.output, mappingContext };
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

  const newStatement = convertStatementRecordToMap(entity);

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
    result.data = convertDataRecordToMap(patch.data as IData);
  }
  if ("operations" in patch && Array.isArray(patch.operations)) {
    result.operations = patch.operations.map((op) =>
      convertOperationRecordToMap(op as IData<OperationType>)
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
          convertStatementRecordToMap(p as IStatement)
        ),
      }),
      ...(Array.isArray(valuePatch.statements) && {
        statements: valuePatch.statements.map((s) =>
          convertStatementRecordToMap(s as IStatement)
        ),
      }),
    };
  }

  return result;
}

function convertStatementRecordToMap(stmt: IStatement): IStatement {
  return {
    ...stmt,
    operations: stmt.operations?.map(convertOperationRecordToMap) ?? [],
    data: stmt.data ? convertDataRecordToMap(stmt.data) : createDefaultData(),
  };
}

function convertDataRecordToMap(data: IData): IData {
  if (!data.type) return data;

  if (data.type.kind === "object" || data.type.kind === "dictionary") {
    const record = data.value as
      | Record<string, IStatement>
      | Map<string, IStatement>;
    const map =
      record instanceof Map
        ? record
        : new Map(
            Object.entries(record ?? {}).map(([k, v]) => [
              k,
              convertStatementRecordToMap(v),
            ])
          );
    return { ...data, value: map };
  }
  if (data.type.kind === "array" || data.type.kind === "tuple") {
    const arr = data.value as IStatement[];
    return { ...data, value: (arr ?? []).map(convertStatementRecordToMap) };
  }
  return data;
}

function convertOperationRecordToMap(
  op: IData<OperationType>
): IData<OperationType> {
  return {
    ...op,
    value: {
      ...op.value,
      parameters: op.value.parameters.map(convertStatementRecordToMap),
      statements: op.value.statements?.map(convertStatementRecordToMap) ?? [],
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
    type: { kind: "operation", parameters: [], result: { kind: "unknown" } },
    value: {
      name: opValue?.name ?? entity.name ?? "",
      parameters: opValue?.parameters?.map(convertStatementRecordToMap) ?? [],
      statements: opValue?.statements?.map(convertStatementRecordToMap) ?? [],
    },
  };
}
