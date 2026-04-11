import { IData, IStatement, OperationType } from "./types";

export type LayoutMode = "inline" | "multiline";

const THRESHOLD = 15;
const SEPARATOR_WIDTH = 1;

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

export function isSimpleData(data: IData): boolean {
  return !COMPLEX_KINDS.has(data.type.kind);
}

export function isComplexData(data: IData): boolean {
  return COMPLEX_KINDS.has(data.type.kind);
}

function getStringWidth(value: string): number {
  return 1 + Math.min(Math.floor(value.length / 10), 6);
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

  if (
    kind === "boolean" ||
    kind === "undefined" ||
    kind === "reference" ||
    kind === "error" ||
    kind === "unknown" ||
    kind === "never"
  ) {
    return 1;
  }

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
    const branches = data.value as {
      condition: IStatement;
      true: IStatement;
      false: IStatement;
    };
    return (
      getStatementWidth(branches.condition) +
      1 +
      getStatementWidth(branches.true) +
      1 +
      getStatementWidth(branches.false)
    );
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
  return 1 + paramsWidth + Math.max(0, params.length - 1) * SEPARATOR_WIDTH;
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
  if (isSimpleData(data)) return "inline";
  return getEntityWidth(data) >= THRESHOLD ? "multiline" : "inline";
}

export function getStatementLayout(statement: IStatement): LayoutMode {
  if (getEntityWidth(statement.data) >= THRESHOLD) return "multiline";

  for (const op of statement.operations) {
    if (getOperationCallWidth(op) >= THRESHOLD) return "multiline";
  }

  return "inline";
}

export function getOperationCallLayout(
  operation: IData<OperationType>
): LayoutMode {
  return getOperationCallWidth(operation) >= THRESHOLD ? "multiline" : "inline";
}

export { THRESHOLD, SEPARATOR_WIDTH };
