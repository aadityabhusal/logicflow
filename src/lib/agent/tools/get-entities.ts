import { hasSubObject } from "remeda";
import type { ToolResult, Tool } from "./types";
import type { EntityContext } from "../entity-context";
import type { IStatement, IData, OperationType } from "../../types";
import { GetEntitiesSchema } from "./schemas";

interface EntityWithMeta {
  entity: IStatement | IData<OperationType>;
  entityType: "statement" | "parameter" | "operation_call";
  parentId: string;
}

function execute(ctx: EntityContext, args: unknown): ToolResult {
  const parsed = GetEntitiesSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid arguments: ${parsed.error.message}` };
  }

  const { filter, beforeStatementId } = parsed.data;
  let entities = collectEntities(ctx);

  if (filter && filter.length > 0) {
    entities = entities.filter((e) =>
      filter.some((f) => matchesFilter(e, f as Record<string, unknown>))
    );
  }

  if (beforeStatementId) {
    entities = filterByScope(ctx, entities, beforeStatementId);
  }

  return {
    success: true,
    data: {
      entities: entities.map((e) => ({
        ...e.entity,
        entityType: e.entityType,
        parentId: e.parentId,
      })),
      count: entities.length,
    },
    message: `Found ${entities.length} entities`,
  };
}

function collectEntities(ctx: EntityContext): EntityWithMeta[] {
  const entities: EntityWithMeta[] = [];
  const opId = ctx.operation.id;

  for (const param of ctx.operation.value.parameters) {
    entities.push({ entity: param, entityType: "parameter", parentId: opId });
    for (const op of param.operations || []) {
      entities.push({ entity: op, entityType: "operation_call", parentId: param.id });
    }
  }

  for (const stmt of ctx.operation.value.statements) {
    entities.push({ entity: stmt, entityType: "statement", parentId: opId });
    for (const op of stmt.operations || []) {
      entities.push({ entity: op, entityType: "operation_call", parentId: stmt.id });
    }
  }

  return entities;
}

function matchesFilter(
  item: EntityWithMeta,
  filter: Record<string, unknown>
): boolean {
  if (filter.id && item.entity.id !== filter.id) return false;
  if (filter.entityType && item.entityType !== filter.entityType) return false;

  const checkObj: Record<string, unknown> = {
    id: item.entity.id,
    entityType: item.entityType,
  };

  if (item.entityType === "statement" || item.entityType === "parameter") {
    const stmt = item.entity as IStatement;
    checkObj.name = stmt.name;
    checkObj.isOptional = stmt.isOptional;
    checkObj.data = stmt.data;
    checkObj.operations = stmt.operations;
  } else {
    const op = item.entity as IData<OperationType>;
    checkObj.type = op.type;
    checkObj.value = op.value;
  }

  return hasSubObject(checkObj, filter);
}

function filterByScope(
  ctx: EntityContext,
  entities: EntityWithMeta[],
  beforeStatementId: string
): EntityWithMeta[] {
  const stmtIndex = ctx.operation.value.statements.findIndex(
    (s) => s.id === beforeStatementId
  );
  if (stmtIndex === -1) return entities;

  return entities.filter((e) => {
    if (e.entityType === "parameter") return true;

    if (e.entityType === "statement") {
      const idx = ctx.operation.value.statements.findIndex(
        (s) => s.id === e.entity.id
      );
      return idx !== -1 && idx < stmtIndex;
    }

    if (e.entityType === "operation_call") {
      const parentStmt = ctx.operation.value.statements.find(
        (s) => s.id === e.parentId
      );
      if (!parentStmt) {
        const parentParam = ctx.operation.value.parameters.find(
          (p) => p.id === e.parentId
        );
        return !!parentParam;
      }
      const parentIdx = ctx.operation.value.statements.indexOf(parentStmt);
      return parentIdx < stmtIndex;
    }

    return false;
  });
}

export const getEntitiesTool: Tool = {
  name: "get_entities",
  description:
    "Query entities in the operation. Returns statements, parameters, and operation calls. Use filter array with OR logic. Use beforeStatementId to get entities in scope before a statement.",
  parameters: GetEntitiesSchema,
  execute,
};
