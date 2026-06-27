import { DataType, IData, IStatement, OperationType } from "./types";

export type LayoutMode = "inline" | "multiline";
type FoldedEntities = Record<string, boolean>;

const THRESHOLD = 12;
const WRAP_THRESHOLD = 6;
const SEPARATOR_WIDTH = 1;
const MAX_STRING_DISPLAY_LENGTH = 28;

const COMPLEX_KINDS = new Set<string>([
  "object",
  "array",
  "tuple",
  "dictionary",
  "operation",
  "condition",
  "instance",
  "union",
]);

export function isSimpleData(dataType: DataType): boolean {
  return !COMPLEX_KINDS.has(dataType.kind);
}

export function isComplexData(data: IData): boolean {
  return COMPLEX_KINDS.has(data.type.kind);
}

function getStringWidth(value: string): number {
  const effectiveLength = Math.min(value.length, MAX_STRING_DISPLAY_LENGTH);
  return 1 + Math.min(Math.floor(effectiveLength / 5), 6);
}

function getNumberWidth(value: number): number {
  const digits = String(Math.abs(value)).replace(".", "").length;
  return 1 + Math.min(Math.floor(digits / 3), 3);
}

export function getEntityWidth(data: IData, folded?: FoldedEntities): number {
  if (folded?.[data.id]) return 1;

  const kind = data.type.kind;

  if (kind === "string") {
    return getStringWidth((data.value as string) ?? "");
  }

  if (kind === "number") {
    return getNumberWidth((data.value as number) ?? 0);
  }

  if (isSimpleData(data.type)) return 1;

  if (kind === "array" || kind === "tuple") {
    const items = data.value as IStatement[];
    if (items.length === 0) return 1;
    const itemsWidth = items.reduce(
      (sum, item) => sum + getStatementWidth(item, folded),
      0
    );
    return 1 + itemsWidth + Math.max(0, items.length - 1) * SEPARATOR_WIDTH;
  }

  if (kind === "object" || kind === "dictionary") {
    const entries = (
      data.value as { entries: Array<{ key: string; value: IStatement }> }
    ).entries;
    if (entries.length === 0) return 1;
    const entriesWidth = entries.reduce(
      (sum, entry) => sum + 1 + getStatementWidth(entry.value, folded),
      0
    );
    return 1 + entriesWidth + Math.max(0, entries.length - 1) * SEPARATOR_WIDTH;
  }

  if (kind === "condition") {
    const value = data.value as {
      condition: IStatement;
      trueBranch: IStatement[];
      falseBranch: IStatement[];
    };
    if (value.trueBranch.length > 1 || value.falseBranch.length > 1)
      return THRESHOLD;
    const trueW =
      value.trueBranch.length > 0
        ? getStatementWidth(value.trueBranch[0], folded)
        : 1;

    const falseW =
      value.falseBranch.length > 0
        ? getStatementWidth(value.falseBranch[0], folded)
        : 1;

    return getStatementWidth(value.condition, folded) + 1 + trueW + 1 + falseW;
  }

  if (kind === "instance") {
    const value = data.value as {
      className: string;
      constructorArgs: IStatement[];
      instanceId: string;
    };
    if (value.constructorArgs.length === 0) return 1;
    const argsWidth = value.constructorArgs.reduce(
      (sum, arg) => sum + getStatementWidth(arg, folded),
      0
    );
    return (
      1 +
      argsWidth +
      Math.max(0, value.constructorArgs.length - 1) * SEPARATOR_WIDTH
    );
  }

  if (kind === "operation") {
    const value = data.value as {
      parameters: IStatement[];
      statements: IStatement[];
      name?: string;
      isAsync?: boolean;
      source?: unknown;
      instanceId?: string;
    };
    const paramWidth = value.parameters.reduce(
      (sum, p) => sum + getStatementWidth(p, folded),
      0
    );
    const stmtWidth = value.statements.reduce(
      (sum, s) => sum + getStatementWidth(s, folded),
      0
    );
    return 1 + paramWidth + stmtWidth;
  }

  if (kind === "union") {
    return 1;
  }

  return 1;
}

export function getOperationNameWidth(name: string): number {
  const overflow = Math.max(0, name.length - 12);
  return Math.min(Math.ceil(overflow / 8), 3);
}

export function getOperationCallWidth(
  operation: IData<OperationType>,
  folded?: FoldedEntities
): number {
  if (folded?.[operation.id]) return 1;

  const name = operation.value.name ?? "";
  const nameWidth = name.length > 0 ? getOperationNameWidth(name) : 0;
  const params = operation.value.parameters;
  const paramsWidth = params.reduce(
    (sum, p) => sum + getStatementWidth(p, folded),
    0
  );
  return (
    2 +
    nameWidth +
    paramsWidth +
    Math.max(0, params.length - 1) * SEPARATOR_WIDTH
  );
}

export function getStatementWidth(
  statement: IStatement,
  folded?: FoldedEntities
): number {
  let width = getEntityWidth(statement.data, folded);
  for (const op of statement.operations) {
    width += getOperationCallWidth(op, folded);
  }
  return width;
}

export function isSimpleStatement(statement: IStatement): boolean {
  return getStatementWidth(statement) <= 1;
}

export function getEntityLayout(
  data: IData,
  wrap?: boolean,
  folded?: FoldedEntities
) {
  if (isSimpleData(data.type)) return "inline";
  const threshold = wrap ? WRAP_THRESHOLD : THRESHOLD;
  return getEntityWidth(data, folded) >= threshold ? "multiline" : "inline";
}

export function getStatementLayout(
  stmt: IStatement,
  wrap?: boolean,
  folded?: FoldedEntities
) {
  const threshold = wrap ? WRAP_THRESHOLD : THRESHOLD;
  return getStatementWidth(stmt, folded) >= threshold ? "multiline" : "inline";
}

export function getOperationCallLayout(
  operation: IData<OperationType>,
  wrap?: boolean,
  folded?: FoldedEntities
) {
  const threshold = wrap ? WRAP_THRESHOLD : THRESHOLD;
  return getOperationCallWidth(operation, folded) >= threshold
    ? "multiline"
    : "inline";
}

export {
  THRESHOLD,
  WRAP_THRESHOLD,
  SEPARATOR_WIDTH,
  MAX_STRING_DISPLAY_LENGTH,
};
