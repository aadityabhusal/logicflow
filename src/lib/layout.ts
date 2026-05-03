import { DataType, IData, IStatement, OperationType } from "./types";

export type LayoutMode = "inline" | "multiline";

const THRESHOLD = 15;
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

export function getEntityWidth(data: IData): number {
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
      (sum, item) => sum + getStatementWidth(item),
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
      (sum, entry) => sum + 1 + getStatementWidth(entry.value),
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
    if (value.trueBranch.length > 1 || value.falseBranch.length > 1) return THRESHOLD;
    const trueWidth =
      value.trueBranch.length > 0 ? getStatementWidth(value.trueBranch[0]) : 1;
    const falseWidth =
      value.falseBranch.length > 0
        ? getStatementWidth(value.falseBranch[0])
        : 1;
    return getStatementWidth(value.condition) + 1 + trueWidth + 1 + falseWidth;
  }

  if (kind === "instance") {
    const value = data.value as {
      className: string;
      constructorArgs: IStatement[];
      instanceId: string;
    };
    if (value.constructorArgs.length === 0) return 1;
    const argsWidth = value.constructorArgs.reduce(
      (sum, arg) => sum + getStatementWidth(arg),
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
      (sum, p) => sum + getStatementWidth(p),
      0
    );
    const stmtWidth = value.statements.reduce(
      (sum, s) => sum + getStatementWidth(s),
      0
    );
    return 1 + paramWidth + stmtWidth;
  }

  if (kind === "union") {
    return 1;
  }

  return 1;
}

export function getOperationCallWidth(operation: IData<OperationType>): number {
  const params = operation.value.parameters;
  const paramsWidth = params.reduce((sum, p) => sum + getStatementWidth(p), 0);
  return 2 + paramsWidth + Math.max(0, params.length - 1) * SEPARATOR_WIDTH;
}

export function getStatementWidth(statement: IStatement): number {
  let width = getEntityWidth(statement.data);
  for (const op of statement.operations) {
    width += getOperationCallWidth(op);
  }
  return width;
}

export function isSimpleStatement(statement: IStatement): boolean {
  return getStatementWidth(statement) <= 1;
}

export function getEntityLayout(data: IData): LayoutMode {
  if (isSimpleData(data.type)) return "inline";
  return getEntityWidth(data) >= THRESHOLD ? "multiline" : "inline";
}

export function getStatementLayout(statement: IStatement): LayoutMode {
  return getStatementWidth(statement) >= THRESHOLD ? "multiline" : "inline";
}

export function getOperationCallLayout(
  operation: IData<OperationType>
): LayoutMode {
  return getOperationCallWidth(operation) >= THRESHOLD ? "multiline" : "inline";
}

export { THRESHOLD, SEPARATOR_WIDTH, MAX_STRING_DISPLAY_LENGTH };
