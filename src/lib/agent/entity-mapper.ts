import { IData, IStatement, OperationType } from "../types";
import { isDataOfType } from "../utils";

export interface EntityMappingContext {
  idMap: Map<string, string>;
  reverseMap: Map<string, string>;
  nextIds: { S: number; D: number; O: number; P: number };
}

function createMappingContext(): EntityMappingContext {
  return {
    idMap: new Map(),
    reverseMap: new Map(),
    nextIds: { S: 1, D: 1, O: 1, P: 1 },
  };
}

function mapId(
  originalId: string,
  prefix: "S" | "D" | "O" | "P",
  ctx: EntityMappingContext
): string {
  if (ctx.idMap.has(originalId)) return ctx.idMap.get(originalId)!;
  const simpleId = `${prefix}${ctx.nextIds[prefix]}`;
  ctx.nextIds[prefix]++;
  ctx.idMap.set(originalId, simpleId);
  ctx.reverseMap.set(simpleId, originalId);
  return simpleId;
}

export function operationToLLMFormat(
  operation: IData<OperationType>,
  ctx: EntityMappingContext = createMappingContext()
): {
  mappedOperation: IData<OperationType>;
  mappingContext: EntityMappingContext;
} {
  const mappedOperation: IData<OperationType> = {
    id: mapId(operation.id, "D", ctx),
    type: operation.type,
    value: {
      name: operation.value.name,
      parameters: operation.value.parameters.map((p) =>
        statementToLLMFormat(p, ctx, "P")
      ),
      statements: operation.value.statements.map((s) =>
        statementToLLMFormat(s, ctx, "S")
      ),
    },
  };
  return { mappedOperation, mappingContext: ctx };
}

function statementToLLMFormat(
  statement: IStatement,
  ctx: EntityMappingContext,
  prefix: "S" | "P"
): IStatement {
  return {
    id: mapId(statement.id, prefix === "P" ? "P" : "S", ctx),
    name: statement.name,
    isOptional: statement.isOptional,
    data: {
      id: mapId(statement.data.id, "D", ctx),
      type: statement.data.type,
      value: serializeDataValue(statement.data, ctx),
    },
    operations: statement.operations.map(
      (op) => operationToLLMFormat(op, ctx).mappedOperation
    ),
  };
}

function serializeDataValue(data: IData, ctx: EntityMappingContext): unknown {
  if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    return data.value.map((s) => statementToLLMFormat(s, ctx, "S"));
  }
  if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    return {
      entries: data.value.entries.map(({ key, value }) => ({
        key,
        value: statementToLLMFormat(value, ctx, "S"),
      })),
    };
  }
  if (isDataOfType(data, "operation")) {
    return operationToLLMFormat(data, ctx).mappedOperation.value;
  }
  if (isDataOfType(data, "reference")) {
    return { name: data.value.name, id: mapId(data.value.id, "S", ctx) };
  }
  if (isDataOfType(data, "instance")) {
    return {
      className: data.value.className,
      constructorArgs: data.value.constructorArgs?.map((a) =>
        statementToLLMFormat(a, ctx, "P")
      ),
      instanceId: data.value.instanceId,
    };
  }
  return data.value;
}
