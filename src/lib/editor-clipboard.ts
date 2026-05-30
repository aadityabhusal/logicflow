import { nanoid } from "nanoid";
import { IData, IStatement, OperationType } from "./types";
import { IStatementSchema, IDataSchema } from "./schemas";
import { isDataOfType } from "./utils";
import { notifications } from "@mantine/notifications";
import { walkStatement, walkData, Visitors } from "./walk";

function collectIds(map: Map<string, string>) {
  return {
    onStatement: (stmt) => map.set(stmt.id, nanoid()),
    onData: (data) => map.set(data.id, nanoid()),
  } as Visitors;
}

function remapIds(map: Map<string, string>) {
  return {
    onStatement: (stmt) => (stmt.id = map.get(stmt.id) ?? stmt.id),
    onData: (data) => {
      data.id = map.get(data.id) ?? data.id;
      if (isDataOfType(data, "reference")) {
        data.value.id = map.get(data.value.id) ?? data.value.id;
      }
    },
  } as Visitors;
}

const walkOptions = { operationCalls: true, nestedOperations: true };

export function cloneStatementWithFreshIds(stmt: IStatement) {
  const map = new Map<string, string>();
  walkStatement(stmt, collectIds(map), walkOptions);
  const clone = structuredClone(stmt);
  walkStatement(clone, remapIds(map), walkOptions);
  return clone;
}

export function cloneDataWithFreshIds(data: IData) {
  const map = new Map<string, string>();
  walkData(data, collectIds(map), walkOptions);
  const clone = structuredClone(data);
  walkData(clone, remapIds(map), walkOptions);
  return clone;
}

export function cloneOperationCallWithFreshIds(op: IData<OperationType>) {
  const map = new Map<string, string>();
  walkData(op, collectIds(map), walkOptions);
  const clone = structuredClone(op);
  walkData(clone, remapIds(map), walkOptions);
  return clone;
}

/* Clipboard read/write */

export type EntityClipboard =
  | { kind: "statement"; value: IStatement }
  | { kind: "operationCall"; value: IData<OperationType> }
  | { kind: "data"; value: IData };

export function writeEntityClipboard(entry: EntityClipboard): void {
  const envelope = { source: "logicflow", version: 1, ...entry };
  navigator.clipboard.writeText(JSON.stringify(envelope)).catch(() => {
    notifications.show({
      message: "Failed to write to clipboard",
      color: "red",
    });
  });
}

export async function readEntityClipboard(): Promise<EntityClipboard | null> {
  try {
    const text = await navigator.clipboard.readText();
    const parsed = JSON.parse(text);
    if (parsed?.source !== "logicflow" || parsed?.version !== 1) return null;

    const { kind, value } = parsed;

    if (kind === "statement") {
      const result = IStatementSchema.safeParse(value);
      return result.success ? { kind, value: result.data } : null;
    }
    if (kind === "operationCall") {
      const result = IDataSchema.safeParse(value);
      if (result.success && isDataOfType(result.data, "operation")) {
        return { kind, value: result.data as IData<OperationType> };
      }
      return null;
    }
    if (kind === "data") {
      const result = IDataSchema.safeParse(value);
      return result.success ? { kind, value: result.data } : null;
    }
    return null;
  } catch {
    return null;
  }
}
