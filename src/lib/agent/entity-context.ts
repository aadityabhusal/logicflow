import type { IData, IStatement, OperationType } from "../types";

export interface EntityContext {
  operation: IData<OperationType>;
  nextId: number;
}

export function createEntityContext(
  operation: IData<OperationType>
): EntityContext {
  const cloned = structuredClone(operation);
  let nextId = 1;
  assignIds(cloned, () => `entity_${nextId++}`);
  return { operation: cloned, nextId };
}

function assignIds(
  data: IData | IData<OperationType>,
  genId: () => string
): void {
  data.id = genId();
  const kind = data.type?.kind;
  const value = data.value;

  if (kind === "array" || kind === "tuple") {
    (value as IStatement[])?.forEach((s) => assignStatementIds(s, genId));
  } else if (kind === "object" || kind === "dictionary") {
    const entries = (value as { entries: Array<{ key: string; value: IStatement }> })?.entries ?? [];
    entries.forEach((e) => assignStatementIds(e.value, genId));
  } else if (kind === "operation") {
    const op = value as { parameters: IStatement[]; statements: IStatement[] };
    op.parameters?.forEach((p) => assignStatementIds(p, genId));
    op.statements?.forEach((s) => assignStatementIds(s, genId));
  } else if (kind === "condition") {
    const cond = value as { condition: IStatement; true: IStatement; false: IStatement };
    assignStatementIds(cond.condition, genId);
    assignStatementIds(cond.true, genId);
    assignStatementIds(cond.false, genId);
  } else if (kind === "reference") {
    const ref = value as { id: string } | null;
    if (ref?.id) ref.id = genId();
  }
}

function assignStatementIds(stmt: IStatement, genId: () => string): void {
  stmt.id = genId();
  stmt.data.id = genId();
  assignIds(stmt.data, genId);
  stmt.operations?.forEach((op) => {
    op.id = genId();
    const opValue = op.value as { parameters: IStatement[]; statements: IStatement[] };
    opValue.parameters?.forEach((p) => assignStatementIds(p, genId));
    opValue.statements?.forEach((s) => assignStatementIds(s, genId));
  });
}

export function generateId(ctx: EntityContext): string {
  return `entity_${ctx.nextId++}`;
}

export function serializeForLLM(ctx: EntityContext): string {
  return JSON.stringify(ctx.operation, null, 2);
}

export function findStatementById(ctx: EntityContext, id: string): IStatement | null {
  const all = [...ctx.operation.value.parameters, ...ctx.operation.value.statements];
  return all.find((s) => s.id === id) ?? null;
}
